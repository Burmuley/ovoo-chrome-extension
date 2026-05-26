import type { Alias, ProtectedAddress } from '../types/ovoo'

const content = document.getElementById('content')!

function sendMessage<T>(message: object): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve)
  })
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<Record<string, string>> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v)
  if (text !== undefined) node.textContent = text
  return node
}

function clear(): void {
  content.textContent = ''
}

async function getCurrentTabHostname(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return ''
  try {
    return new URL(tab.url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function renderAliasItem(alias: Alias): HTMLElement {
  const item = el('div', { class: 'alias-item' })
  item.appendChild(el('div', { class: 'alias-email' }, alias.email))
  const meta = el('div', { class: 'alias-meta' })
  if (alias.metadata.service_name) {
    meta.appendChild(el('span', { class: 'alias-service' }, alias.metadata.service_name))
  }
  const badgeClass = alias.active ? 'alias-badge active' : 'alias-badge inactive'
  meta.appendChild(el('span', { class: badgeClass }, alias.active ? 'active' : 'inactive'))
  item.appendChild(meta)
  return item
}

async function renderAliases(serverUrl: string): Promise<void> {
  clear()

  // Header
  const header = el('div', { class: 'header' })
  const headerLeft = el('div', { class: 'header-left' })
  const title = el('h1', {}, 'Ovoo Aliases')
  headerLeft.appendChild(title)
  if (serverUrl) {
    headerLeft.appendChild(el('div', { class: 'server-url' }, serverUrl))
  }
  header.appendChild(headerLeft)

  const actions = el('div', { class: 'header-actions' })
  const newBtn = el('button', { class: 'btn-new' }, '+ New')
  newBtn.addEventListener('click', () => void renderNewAliasForm(serverUrl))
  actions.appendChild(newBtn)
  const logoutBtn = el('button', { class: 'btn-logout' }, 'Sign out')
  logoutBtn.addEventListener('click', async () => {
    await sendMessage({ type: 'LOGOUT' })
    void render()
  })
  actions.appendChild(logoutBtn)
  header.appendChild(actions)
  content.appendChild(header)

  // Search
  const searchWrap = el('div', { class: 'search-wrap' })
  const searchInput = el('input', { type: 'text', placeholder: 'Search aliases…' })
  searchWrap.appendChild(searchInput)
  content.appendChild(searchWrap)

  // Alias list container
  const listWrap = el('div', { class: 'alias-list' })
  content.appendChild(listWrap)

  function renderList(aliases: Alias[], query: string): void {
    listWrap.textContent = ''
    if (aliases.length === 0) {
      listWrap.appendChild(
        el('div', { class: 'empty-state' }, query ? 'No aliases match your search.' : 'No aliases found.'),
      )
      return
    }
    for (const alias of aliases) {
      listWrap.appendChild(renderAliasItem(alias))
    }
  }

  async function fetchAndRender(query: string): Promise<void> {
    listWrap.textContent = ''
    listWrap.appendChild(el('div', { class: 'empty-state' }, query ? 'Searching…' : 'Loading…'))
    const res = await sendMessage<{ ok: boolean; aliases?: Alias[]; error?: string }>({
      type: 'GET_ALL_ALIASES',
      ...(query ? { q: query } : {}),
    })
    renderList(res.aliases ?? [], query)
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  searchInput.addEventListener('input', () => {
    const query = (searchInput as HTMLInputElement).value
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void fetchAndRender(query), 300)
  })

  void fetchAndRender('')
  searchInput.focus()
}

async function renderNewAliasForm(serverUrl: string, fromTabId?: number): Promise<void> {
  clear()

  // Header
  const header = el('div', { class: 'header' })
  const headerLeft = el('div', { class: 'header-left' })
  headerLeft.appendChild(el('h1', {}, 'New Alias'))
  if (serverUrl) headerLeft.appendChild(el('div', { class: 'server-url' }, serverUrl))
  header.appendChild(headerLeft)
  const actions = el('div', { class: 'header-actions' })
  const cancelBtn = el('button', {}, 'Cancel')
  cancelBtn.addEventListener('click', () => void renderAliases(serverUrl))
  actions.appendChild(cancelBtn)
  header.appendChild(actions)
  content.appendChild(header)

  // Loading spinner while fetching data
  const spinner = el('div', { class: 'spinner-wrap' })
  spinner.appendChild(el('div', { class: 'spinner' }))
  content.appendChild(spinner)

  const [hostname, addrRes, domainRes] = await Promise.all([
    getCurrentTabHostname(),
    sendMessage<{ ok: boolean; addresses?: ProtectedAddress[]; error?: string }>({
      type: 'GET_PROTECTED_ADDRESSES',
    }),
    sendMessage<{ ok: boolean; domains?: string[]; error?: string }>({ type: 'GET_DOMAINS' }),
  ])

  spinner.remove()

  const addresses = addrRes.addresses ?? []
  const domains = domainRes.domains ?? []

  if (!addrRes.ok || !domainRes.ok) {
    const errWrap = el('div', { class: 'form-wrap' })
    errWrap.appendChild(
      el('div', { class: 'form-error' }, addrRes.error ?? domainRes.error ?? 'Failed to load data'),
    )
    content.appendChild(errWrap)
    return
  }

  // Form
  const form = el('div', { class: 'form-wrap' })

  // Service name
  const serviceGroup = el('div', { class: 'form-group' })
  serviceGroup.appendChild(el('label', { class: 'form-label' }, 'Service name'))
  const serviceInput = el('input', { class: 'form-input', type: 'text', value: hostname })
  serviceGroup.appendChild(serviceInput)
  form.appendChild(serviceGroup)

  // Protected address
  const addrGroup = el('div', { class: 'form-group' })
  addrGroup.appendChild(el('label', { class: 'form-label' }, 'Forward to'))
  const addrSelect = el('select', { class: 'form-select' })
  for (const addr of addresses) {
    const opt = el('option', { value: addr.id }, addr.email)
    addrSelect.appendChild(opt)
  }
  addrGroup.appendChild(addrSelect)
  form.appendChild(addrGroup)

  // Domain
  const domainGroup = el('div', { class: 'form-group' })
  domainGroup.appendChild(el('label', { class: 'form-label' }, 'Domain'))
  const domainSelect = el('select', { class: 'form-select' })
  for (const d of domains) {
    domainSelect.appendChild(el('option', { value: d }, d))
  }
  domainGroup.appendChild(domainSelect)
  form.appendChild(domainGroup)

  // Error message placeholder
  const errorEl = el('div', { class: 'form-error' })
  form.appendChild(errorEl)

  // Buttons
  const btnRow = el('div', { class: 'btn-row' })
  const createBtn = el('button', { class: 'btn-primary' }, 'Create')
  createBtn.addEventListener('click', async () => {
    const serviceName = (serviceInput as HTMLInputElement).value.trim()
    if (!serviceName) {
      errorEl.textContent = 'Service name is required.'
      return
    }
    createBtn.textContent = 'Creating…'
    createBtn.disabled = true
    errorEl.textContent = ''

    const res = await sendMessage<{ ok: boolean; alias?: Alias; error?: string }>({
      type: 'CREATE_ALIAS',
      hostname: serviceName,
      protectedAddressId: (addrSelect as HTMLSelectElement).value,
      domain: (domainSelect as HTMLSelectElement).value || undefined,
    })

    if (res.ok && res.alias) {
      if (fromTabId !== undefined) {
        chrome.tabs.sendMessage(fromTabId, { type: 'INSERT_ALIAS', email: res.alias.email }).catch(() => {})
      }
      void renderAliasCreated(serverUrl, res.alias)
    } else {
      errorEl.textContent = res.error ?? 'Failed to create alias.'
      createBtn.textContent = 'Create'
      createBtn.disabled = false
    }
  })
  btnRow.appendChild(createBtn)
  form.appendChild(btnRow)

  content.appendChild(form)
}

function renderAliasCreated(serverUrl: string, alias: Alias): void {
  clear()

  const header = el('div', { class: 'header' })
  const headerLeft = el('div', { class: 'header-left' })
  headerLeft.appendChild(el('h1', {}, 'Alias Created'))
  if (serverUrl) headerLeft.appendChild(el('div', { class: 'server-url' }, serverUrl))
  header.appendChild(headerLeft)
  const actions = el('div', { class: 'header-actions' })
  const backBtn = el('button', {}, 'All aliases')
  backBtn.addEventListener('click', () => void renderAliases(serverUrl))
  actions.appendChild(backBtn)
  header.appendChild(actions)
  content.appendChild(header)

  const wrap = el('div', { class: 'form-wrap' })

  const resultGroup = el('div', { class: 'form-group' })
  resultGroup.appendChild(el('div', { class: 'form-label' }, 'New alias'))
  resultGroup.appendChild(el('div', { class: 'alias-result' }, alias.email))
  wrap.appendChild(resultGroup)

  const btnRow = el('div', { class: 'btn-row' })

  const copyBtn = el('button', { class: 'btn-primary' }, 'Copy')
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(alias.email).then(() => {
      copyBtn.textContent = 'Copied!'
      setTimeout(() => { copyBtn.textContent = 'Copy' }, 1500)
    }).catch(() => {})
  })
  btnRow.appendChild(copyBtn)

  const doneBtn = el('button', {}, 'Back to aliases')
  doneBtn.addEventListener('click', () => void renderAliases(serverUrl))
  btnRow.appendChild(doneBtn)

  wrap.appendChild(btnRow)
  content.appendChild(wrap)
}

function renderReauthInProgress(): void {
  clear()
  const wrap = el('div', { class: 'spinner-wrap' })
  const spinner = el('div', { class: 'spinner' })
  wrap.appendChild(spinner)
  wrap.appendChild(
    el('div', {}, 'Re-authenticating — please complete the login in the tab that opened…'),
  )
  content.appendChild(wrap)

  // Transition to aliases view once the new JWT lands in storage
  chrome.storage.onChanged.addListener(function onStorageChange(changes, area) {
    if (area === 'local' && changes['jwt']?.newValue) {
      chrome.storage.onChanged.removeListener(onStorageChange)
      void render()
    }
  })
}

function renderNoServer(): void {
  clear()
  const wrap = el('div', { class: 'simple-content' })
  wrap.appendChild(el('div', { class: 'status' }, 'No server configured.'))
  const link = el('a', { class: 'link' }, 'Open Options to set server URL')
  link.addEventListener('click', () => chrome.runtime.openOptionsPage())
  wrap.appendChild(link)
  content.appendChild(wrap)
}

function renderProviders(providers: string[]): void {
  clear()
  const wrap = el('div', { class: 'simple-content' })
  wrap.appendChild(el('div', { class: 'status' }, 'Not signed in.'))
  const providerWrap = el('div', { class: 'providers' })
  for (const p of providers) {
    const btn = el('button', { class: 'provider-btn', 'data-provider': p }, `Sign in with ${p}`)
    btn.addEventListener('click', async () => {
      btn.textContent = 'Opening login…'
      btn.disabled = true
      await sendMessage({ type: 'LOGIN', provider: p })
      window.close()
    })
    providerWrap.appendChild(btn)
  }
  wrap.appendChild(providerWrap)
  content.appendChild(wrap)
}

async function render(): Promise<void> {
  const authRes = await sendMessage<{
    ok: boolean
    authenticated: boolean
    reauth_started: boolean
  }>({ type: 'GET_AUTH_STATUS' })

  if (authRes.authenticated) {
    const data = await chrome.storage.local.get(['serverUrl', 'pendingNewAlias', 'pendingNewAliasTabId'])
    const serverUrl = (data.serverUrl as string | undefined) ?? ''
    if (data.pendingNewAlias) {
      const fromTabId = data.pendingNewAliasTabId as number | undefined
      await chrome.storage.local.remove(['pendingNewAlias', 'pendingNewAliasTabId'])
      await renderNewAliasForm(serverUrl, fromTabId)
    } else {
      await renderAliases(serverUrl)
    }
    return
  }

  if (authRes.reauth_started) {
    renderReauthInProgress()
    return
  }

  const { serverUrl } = await chrome.storage.local.get('serverUrl')
  if (!serverUrl) {
    renderNoServer()
    return
  }

  let providers: string[] = []
  try {
    const res = await sendMessage<{ ok: boolean; providers?: string[] }>({
      type: 'GET_PROVIDERS',
    })
    providers = res.providers ?? []
  } catch {
    clear()
    const wrap = el('div', { class: 'simple-content' })
    wrap.appendChild(el('div', { class: 'status' }, 'Could not reach server.'))
    content.appendChild(wrap)
    return
  }

  if (providers.length === 0) {
    clear()
    const wrap = el('div', { class: 'simple-content' })
    wrap.appendChild(el('div', { class: 'status' }, 'No auth providers available on server.'))
    content.appendChild(wrap)
    return
  }

  renderProviders(providers)
}

void render()
