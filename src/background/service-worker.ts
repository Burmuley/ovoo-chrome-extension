import * as api from '../api/client'
import type { Alias } from '../types/ovoo'

// Ephemeral per-hostname alias cache — lost on service worker restart, falls back to API fetch.
const aliasCache = new Map<string, Alias[]>()

async function isAuthenticated(): Promise<boolean> {
  const { jwt } = await chrome.storage.local.get('jwt')
  return !!jwt
}

function normaliseHostname(hostname: string): string {
  return hostname.replace(/^www\./, '')
}

async function loginWithProvider(provider: string): Promise<void> {
  const data = await chrome.storage.local.get('serverUrl')
  if (!data.serverUrl) throw new Error('Server URL not configured')
  const base = (data.serverUrl as string).replace(/\/$/, '')
  const loginUrl = `${base}/auth/${encodeURIComponent(provider)}/login`
  const tab = await chrome.tabs.create({ url: loginUrl })
  await chrome.storage.local.set({ pendingAuthTabId: tab.id })
}

async function tryAutoRenew(): Promise<boolean> {
  const data = await chrome.storage.local.get(['lastProvider', 'pendingAuthTabId', 'authMode'])
  if (((data.authMode as string | undefined) ?? 'oidc') === 'bearer') return false
  if (data.pendingAuthTabId) return true // re-auth already in progress
  if (!data.lastProvider) return false
  await loginWithProvider(data.lastProvider as string)
  return true
}

// Clear pending auth state if the login tab is closed before completing auth.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await chrome.storage.local.get('pendingAuthTabId')
  if (tabId === stored.pendingAuthTabId) {
    await chrome.storage.local.remove('pendingAuthTabId')
  }
})

// Detect when the login tab lands on the server root — that means auth is complete.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return

  const stored = await chrome.storage.local.get(['pendingAuthTabId', 'serverUrl'])
  if (tabId !== stored.pendingAuthTabId || !stored.serverUrl) return

  const base = (stored.serverUrl as string).replace(/\/$/, '')
  const tabUrl = tab.url ?? ''

  // Only trigger on the exact root page, not on intermediate redirects.
  if (tabUrl !== base && tabUrl !== base + '/') return

  const accessCookie = await chrome.cookies.get({ url: base, name: 'ovoo_access' })
  if (!accessCookie) return

  await chrome.storage.local.set({ jwt: accessCookie.value })
  await chrome.storage.local.remove('pendingAuthTabId')
  aliasCache.clear()

  await chrome.tabs.remove(tabId)
})

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; [key: string]: unknown },
    sender,
    sendResponse: (r: unknown) => void,
  ) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: Error) => sendResponse({ ok: false, error: err.message }))
    return true // keep the message channel open for async response
  },
)

async function handleMessage(
  message: { type: string; [key: string]: unknown },
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (message.type) {
    case 'GET_AUTH_STATUS': {
      const authenticated = await isAuthenticated()
      if (!authenticated) {
        const reauth_started = await tryAutoRenew()
        return { ok: true, authenticated: false, reauth_started }
      }
      return { ok: true, authenticated: true, reauth_started: false }
    }

    case 'GET_PROVIDERS':
      return { ok: true, providers: await api.getProviders() }

    case 'LOGIN':
      await chrome.storage.local.set({ lastProvider: message.provider as string })
      await loginWithProvider(message.provider as string)
      return { ok: true }

    case 'LOGOUT': {
      const { pendingAuthTabId } = await chrome.storage.local.get('pendingAuthTabId')
      if (pendingAuthTabId) {
        await chrome.tabs.remove(pendingAuthTabId as number).catch(() => {})
      }
      await chrome.storage.local.remove(['jwt', 'jwtExpiry', 'lastProvider', 'pendingAuthTabId'])
      aliasCache.clear()
      return { ok: true }
    }

    case 'GET_ALIASES': {
      if (!(await isAuthenticated())) return { ok: false, error: 'Not authenticated' }
      const hostname = normaliseHostname(message.hostname as string)
      if (!aliasCache.has(hostname)) {
        aliasCache.set(hostname, await api.getAliases(hostname))
      }
      return { ok: true, aliases: aliasCache.get(hostname)! }
    }

    case 'GET_ALL_ALIASES': {
      if (!(await isAuthenticated())) return { ok: false, error: 'Not authenticated' }
      const q = message.q as string | undefined
      const active = message.active as boolean | undefined
      const aliases = await api.getAliases(undefined, q, active)
      return { ok: true, aliases }
    }

    case 'OPEN_NEW_ALIAS_FORM': {
      await chrome.storage.local.set({
        pendingNewAlias: true,
        ...(sender.tab?.id !== undefined ? { pendingNewAliasTabId: sender.tab.id } : {}),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (chrome.action as any).openPopup()
      return { ok: true }
    }

    case 'GET_PROTECTED_ADDRESSES': {
      if (!(await isAuthenticated())) return { ok: false, error: 'Not authenticated' }
      const addresses = await api.getProtectedAddresses()
      return { ok: true, addresses }
    }

    case 'GET_DOMAINS': {
      if (!(await isAuthenticated())) return { ok: false, error: 'Not authenticated' }
      const domains = await api.getDomains()
      return { ok: true, domains }
    }

    case 'CREATE_ALIAS': {
      if (!(await isAuthenticated())) return { ok: false, error: 'Not authenticated' }
      const hostname = normaliseHostname(message.hostname as string)
      let protectedAddressId = message.protectedAddressId as string | undefined
      const domain = message.domain as string | undefined
      if (!protectedAddressId) {
        const addresses = await api.getProtectedAddresses()
        const active = addresses.find((a) => a.active)
        if (!active) throw new Error('No active protected address found')
        protectedAddressId = active.id
      }
      const alias = await api.createAlias(protectedAddressId, hostname, domain)
      aliasCache.delete(hostname)
      return { ok: true, alias }
    }

    default:
      return { ok: false, error: `Unknown message type: ${message.type}` }
  }
}
