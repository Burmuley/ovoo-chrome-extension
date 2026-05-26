import type { Alias } from '../types/ovoo'

const WIDGET_HOST_ID = 'ovoo-alias-widget-host'

function sendMessage<T>(message: object): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve)
  })
}

function removeWidget(): void {
  document.getElementById(WIDGET_HOST_ID)?.remove()
}

function insertValue(input: HTMLInputElement, value: string): void {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

let pendingInsertInput: HTMLInputElement | null = null

function createWidget(input: HTMLInputElement, aliases: Alias[]): void {
  removeWidget()

  const rect = input.getBoundingClientRect()

  const host = document.createElement('div')
  host.id = WIDGET_HOST_ID
  // position: fixed so coordinates come from getBoundingClientRect (viewport-relative)
  host.style.cssText = `
    position: fixed !important;
    z-index: 2147483647 !important;
    top: ${rect.bottom + 4}px;
    left: ${rect.left}px;
    min-width: ${Math.max(rect.width, 220)}px;
    pointer-events: auto;
  `

  const shadow = host.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = `
    .widget {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 13px;
      background: #ffffff;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      overflow: hidden;
    }
    .alias-item {
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #f3f4f6;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .alias-item:last-child {
      border-bottom: none;
    }
    .alias-item:hover {
      background: #f3f4f6;
    }
    .create-btn {
      display: block;
      width: 100%;
      padding: 9px 12px;
      font-size: 13px;
      font-family: inherit;
      background: #2563eb;
      color: #ffffff;
      border: none;
      cursor: pointer;
      text-align: left;
      box-sizing: border-box;
    }
    .create-btn:hover:not(:disabled) {
      background: #1d4ed8;
    }
    .create-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .create-btn {
      border-top: 1px solid #f3f4f6;
    }
  `

  const widget = document.createElement('div')
  widget.className = 'widget'

  aliases.forEach((alias) => {
    const item = document.createElement('div')
    item.className = 'alias-item'
    item.textContent = alias.email
    item.title = alias.email
    item.addEventListener('mousedown', (e) => {
      e.preventDefault() // prevent input blur before click registers
      insertValue(input, alias.email)
      removeWidget()
    })
    widget.appendChild(item)
  })

  const btn = document.createElement('button')
  btn.className = 'create-btn'
  btn.textContent = '+ Create new email Alias'
  btn.addEventListener('mousedown', async (e) => {
    e.preventDefault()
    pendingInsertInput = input
    await sendMessage({ type: 'OPEN_NEW_ALIAS_FORM' })
    removeWidget()
  })
  widget.appendChild(btn)

  shadow.appendChild(style)
  shadow.appendChild(widget)
  document.body.appendChild(host)
}

async function onEmailFocus(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement

  const authRes = await sendMessage<{ ok: boolean; authenticated: boolean }>({
    type: 'GET_AUTH_STATUS',
  })
  if (!authRes.authenticated) return

  const aliasRes = await sendMessage<{ ok: boolean; aliases?: Alias[]; error?: string }>({
    type: 'GET_ALIASES',
    hostname: location.hostname,
  })
  if (!aliasRes.ok) return

  createWidget(input, aliasRes.aliases ?? [])
}

function attachToInput(input: HTMLInputElement): void {
  if (input.dataset.ovooAttached) return
  input.dataset.ovooAttached = '1'

  input.addEventListener('focus', (e) => {
    void onEmailFocus(e)
  })
  input.addEventListener('blur', () => {
    // Delay removal to allow mousedown on widget items to fire before blur removes the widget.
    setTimeout(removeWidget, 150)
  })
}

const ALIAS_KEYWORDS = ['email', 'user']

function isEmailLikeInput(input: HTMLInputElement): boolean {
  if (input.type === 'email') return true
  if (input.type !== 'text' && input.type !== '') return false
  for (const attr of Array.from(input.attributes)) {
    const val = attr.value.toLowerCase()
    if (ALIAS_KEYWORDS.some((kw) => val.includes(kw))) return true
  }
  return false
}

function scanInputs(): void {
  document
    .querySelectorAll<HTMLInputElement>('input[type="email"], input[type="text"], input:not([type])')
    .forEach((input) => { if (isEmailLikeInput(input)) attachToInput(input) })
}

scanInputs()

const observer = new MutationObserver(scanInputs)
observer.observe(document.body, { childList: true, subtree: true })

document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape') removeWidget()
  },
  true,
)

chrome.runtime.onMessage.addListener((message: { type: string; [key: string]: unknown }) => {
  if (message.type === 'INSERT_ALIAS' && pendingInsertInput) {
    insertValue(pendingInsertInput, message.email as string)
    pendingInsertInput = null
  }
})
