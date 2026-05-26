const urlInput = document.getElementById('serverUrl') as HTMLInputElement
const saveBtn = document.getElementById('save') as HTMLButtonElement
const msg = document.getElementById('msg') as HTMLDivElement

function showMsg(text: string, type: 'success' | 'error'): void {
  msg.textContent = text
  msg.className = type
  msg.hidden = false
}

chrome.storage.local.get('serverUrl').then((data) => {
  if (data.serverUrl) urlInput.value = data.serverUrl as string
})

saveBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim()
  if (!url) {
    showMsg('Please enter a URL.', 'error')
    return
  }
  try {
    new URL(url) // validate URL format
  } catch {
    showMsg('Please enter a valid URL (include https://).', 'error')
    return
  }
  await chrome.storage.local.set({ serverUrl: url })
  await chrome.storage.local.remove(['jwt', 'jwtExpiry'])
  showMsg('Saved! You will need to sign in again.', 'success')
})
