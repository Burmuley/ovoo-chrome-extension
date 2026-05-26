const urlInput     = document.getElementById('serverUrl')    as HTMLInputElement
const saveBtn      = document.getElementById('save')         as HTMLButtonElement
const msg          = document.getElementById('msg')          as HTMLDivElement
const modeOidc     = document.getElementById('modeOidc')     as HTMLInputElement
const modeBearer   = document.getElementById('modeBearer')   as HTMLInputElement
const tokenSection = document.getElementById('tokenSection') as HTMLDivElement
const tokenInput   = document.getElementById('bearerToken')  as HTMLTextAreaElement

function showMsg(text: string, type: 'success' | 'error'): void {
  msg.textContent = text
  msg.className = type
  msg.hidden = false
}

function syncTokenSection(): void {
  tokenSection.hidden = !modeBearer.checked
}

modeOidc.addEventListener('change', syncTokenSection)
modeBearer.addEventListener('change', syncTokenSection)

chrome.storage.local.get(['serverUrl', 'authMode']).then((data) => {
  if (data.serverUrl) urlInput.value = data.serverUrl as string
  if ((data.authMode as string | undefined) === 'bearer') modeBearer.checked = true
  syncTokenSection()
})

saveBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim()
  if (!url) { showMsg('Please enter a URL.', 'error'); return }
  try { new URL(url) } catch {
    showMsg('Please enter a valid URL (include https://).', 'error')
    return
  }

  const mode = modeBearer.checked ? 'bearer' : 'oidc'
  await chrome.storage.local.set({ serverUrl: url, authMode: mode })

  if (mode === 'bearer') {
    const token = tokenInput.value.trim()
    if (token) {
      await chrome.storage.local.set({ jwt: token })
      await chrome.storage.local.remove('jwtExpiry')
    }
    showMsg('Saved!', 'success')
  } else {
    await chrome.storage.local.remove(['jwt', 'jwtExpiry'])
    showMsg('Saved! You will need to sign in again.', 'success')
  }
})
