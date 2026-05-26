import type {
  Alias,
  PaginatedAliases,
  PaginatedProtectedAddresses,
  ProtectedAddress,
} from '../types/ovoo'

async function getStorage(): Promise<{ serverUrl: string; jwt: string }> {
  const data = await chrome.storage.local.get(['serverUrl', 'jwt'])
  if (!data.serverUrl) throw new Error('Server URL not configured')
  if (!data.jwt) throw new Error('Not authenticated')
  return { serverUrl: data.serverUrl as string, jwt: data.jwt as string }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { serverUrl, jwt } = await getStorage()
  const url = serverUrl.replace(/\/$/, '') + path
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      ...init?.headers,
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function getProviders(): Promise<string[]> {
  const data = await chrome.storage.local.get('serverUrl')
  if (!data.serverUrl) throw new Error('Server URL not configured')
  const url = (data.serverUrl as string).replace(/\/$/, '') + '/auth/providers'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch providers: ${res.status}`)
  return res.json() as Promise<string[]>
}

export async function getAliases(serviceName?: string, q?: string): Promise<Alias[]> {
  const params = new URLSearchParams()
  if (serviceName) params.set('service_name', serviceName)
  if (q) params.set('q', q)
  const qs = params.toString()
  const data = await apiFetch<PaginatedAliases>(`/api/v1/aliases${qs ? `?${qs}` : ''}`)
  return data.aliases
}

export async function getProtectedAddresses(): Promise<ProtectedAddress[]> {
  const data = await apiFetch<PaginatedProtectedAddresses>('/api/v1/praddrs')
  return data.protected_addresses
}

export async function getDomains(): Promise<string[]> {
  const data = await apiFetch<{ domains: string[] }>('/api/v1/domains')
  return data.domains
}

export async function createAlias(
  protectedAddressId: string,
  serviceName: string,
  domain?: string,
): Promise<Alias> {
  return apiFetch<Alias>('/api/v1/aliases', {
    method: 'POST',
    body: JSON.stringify({
      protected_address_id: protectedAddressId,
      ...(domain ? { domain } : {}),
      metadata: { service_name: serviceName, comment: '' },
    }),
  })
}
