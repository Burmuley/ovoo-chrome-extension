# Ovoo Chrome Extension

A Manifest V3 Chrome extension that integrates with a self-hosted [Ovoo](https://github.com/Burmuley/ovoo) server to provide anonymous email aliasing directly in the browser. When you focus an `<input type="email">` field on any page, the extension offers your existing site-specific aliases in an inline widget and lets you create new ones on the spot.

## Features

- **Inline alias picker** — a Shadow DOM widget appears below any focused email input, listing aliases scoped to that site's hostname. Click one to auto-fill the field.
- **One-click alias creation** — create a new alias from the inline widget or from the popup, choosing your protected address and domain.
- **Popup alias manager** — browse, search, and manage all your aliases from the extension popup.
- **OIDC authentication** — sign in via any provider configured on your Ovoo server; tokens are stored locally and auto-refreshed.
- **Per-hostname alias cache** — aliases are cached in memory by hostname to minimise API round-trips (cache is rebuilt transparently when the service worker restarts).

## Requirements

- A running [Ovoo](https://github.com/Burmuley/ovoo) server reachable from your browser.
- Chrome / Chromium 120+ (Manifest V3).
- Node.js 18+ and npm (for building from source).

## Installation

### From source

```bash
git clone https://github.com/Burmuley/ovoo-chrome-extension.git
cd ovoo-chrome-extension
npm install
npm run build
```

Then load the unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right)
3. Click **Load unpacked** and select the `dist/` directory

After each rebuild (`npm run build`) click the reload icon on the extension card. Content scripts additionally require a page reload on the tab you are testing.

## Configuration

1. Click the extension icon and open **Options** (or navigate to the extension's options page via `chrome://extensions`).
2. Enter the full URL of your Ovoo server (e.g. `https://ovoo.example.com`) and click **Save**.
3. Return to the popup and sign in with the OIDC provider shown.

The server URL is stored in `chrome.storage.local`. Changing it clears the stored JWT and requires re-authentication.

## Usage

### Inline widget

Focus any `<input type="email">` field, or a `<input type="text">` whose `name` attribute contains `email`, `user`, or `username` (case-insensitive), on any page. If you are signed in, a dropdown appears below the input showing:

- Aliases previously created for this site's hostname (click to fill).
- A **+ Create new email Alias** button that opens the popup's creation form and inserts the new alias into the field automatically.

Press `Escape` or click elsewhere to dismiss the widget.

### Popup

Click the extension icon to open the popup:

| State | What you see |
|---|---|
| No server configured | Link to the Options page |
| Not signed in | Sign-in buttons for each OIDC provider |
| Signed in | Alias list with search + **+ New** button |

From the alias list you can search across all your aliases, create a new one (pick service name, protected address, and domain), and sign out.

## Development

```bash
npm run dev        # watch mode — rebuilds on save (reload extension + page manually)
npm run build      # production build → dist/
npm run type-check # TypeScript type check with no output
```

There is no automated test suite. Verify changes by loading the unpacked `dist/` in Chrome as described above.

## Project structure

```
src/
  api/client.ts          # Thin fetch wrapper; attaches Bearer JWT to every request
  background/
    service-worker.ts    # Message router, OIDC tab flow, per-hostname alias cache
  content/
    email-detector.ts    # MutationObserver on email inputs; Shadow DOM widget
  options/
    options.ts           # Server URL settings page
  popup/
    popup.ts             # Alias list, search, creation form, sign-in flow
  types/
    ovoo.ts              # Shared TypeScript types for all API shapes
manifest.json
vite.config.ts
```

### Data flow

```
<input type="email"> focus
  → content/email-detector.ts   (DOM observer + Shadow DOM widget)
      chrome.runtime.sendMessage
  → background/service-worker.ts  (auth, API calls, per-hostname cache)
      fetch with Bearer JWT
  → Ovoo REST API
```

Content scripts cannot make cross-origin requests — all API calls go through the service worker, which is exempt from CORS via `host_permissions: ["<all_urls>"]`.

### Authentication

The extension uses a cookie-based OIDC flow instead of `chrome.identity.launchWebAuthFlow`:

1. The service worker opens a new tab pointing to `/auth/<provider>/login` on the Ovoo server.
2. After the OIDC round-trip the server sets an `HttpOnly` cookie (`ovoo_auth`) and redirects to `/`.
3. `chrome.tabs.onUpdated` detects the redirect, reads the cookie via `chrome.cookies.get()`, extracts the JWT, and stores it in `chrome.storage.local` with its expiry.
4. Subsequent API calls attach the JWT as `Authorization: Bearer <token>`.

On JWT expiry the service worker automatically reopens the login tab using the last-used provider.

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Persist server URL, JWT, and ephemeral UI state |
| `cookies` | Read the `ovoo_auth` cookie after OIDC redirect |
| `tabs` | Open and detect the login tab; send messages to content scripts |
| `host_permissions: <all_urls>` | Allow the service worker to make cross-origin API calls and read cookies for any configured server origin |
