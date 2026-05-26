# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # production build → dist/
npm run dev          # watch mode (rebuild on save; still requires manual extension reload in Chrome)
npm run type-check   # tsc --noEmit, no output = clean
```

There is no test suite. Verification is done by loading the unpacked extension in Chrome:
1. `npm run build`
2. `chrome://extensions` → Enable Developer Mode → Load unpacked → select `dist/`
3. Reload the extension card after each rebuild. Content scripts also require a page reload.

## Architecture

Manifest V3 Chrome extension. All source is TypeScript; `vite-plugin-web-extension` reads `manifest.json`, compiles every entry point it references, and outputs a ready-to-load `dist/` directory.

### Data flow

```
<input type="email"> focus
  → content/email-detector.ts   (DOM observer, Shadow DOM widget)
      chrome.runtime.sendMessage
  → background/service-worker.ts  (auth, API calls, per-hostname alias cache)
      fetch with Bearer JWT
  → Ovoo REST API  (GET /api/v1/aliases?service_name=<hostname>, POST /api/v1/aliases)
```

Content scripts **cannot** make cross-origin fetch calls — all API requests go through the service worker via message passing. The service worker is exempt from CORS because `host_permissions: ["<all_urls>"]` is declared.

### Authentication

The Ovoo server uses OIDC. Available providers are fetched from `GET /auth/providers`. Login opens a browser tab (`chrome.tabs.create`) pointing to `/auth/<provider>/login`. After the OIDC round-trip the server sets an `HttpOnly` cookie named `ovoo_auth` and redirects to `/`. The service worker detects this navigation via `chrome.tabs.onUpdated`, reads the cookie with `chrome.cookies.get()`, extracts the JWT, and stores it in `chrome.storage.local` with its expiry. Subsequent API calls use `Authorization: Bearer <jwt>`.

`chrome.identity.launchWebAuthFlow` is intentionally **not** used — the Ovoo callback always redirects to `/` and never to an extension redirect URI.

### Key files

| File | Responsibility |
|---|---|
| `src/types/ovoo.ts` | Shared TypeScript types for all API response shapes |
| `src/api/client.ts` | Thin `fetch` wrapper; reads `serverUrl`+`jwt` from storage on every call |
| `src/background/service-worker.ts` | Message router, OIDC tab flow, per-hostname `Map` alias cache |
| `src/content/email-detector.ts` | `MutationObserver` on `<input type="email">`; renders inline widget via Shadow DOM |
| `src/popup/popup.ts` | Provider selection UI; login triggers `LOGIN` message to service worker |
| `src/options/options.ts` | Saves `serverUrl` to `chrome.storage.local`; clears JWT on change |

### Alias cache

The service worker holds an in-memory `Map<hostname, Alias[]>`. It is keyed by the page hostname and populated by `GET /api/v1/aliases?service_name=<hostname>`. Cache entries are invalidated individually after `CREATE_ALIAS` and fully cleared on logout or re-authentication. Because MV3 service workers are ephemeral, the cache may be empty on any given message — callers always fall through to the API when the key is absent.

### Widget

The inline widget is a `position: fixed` host element appended to `document.body`, with a closed Shadow DOM inside to isolate styles from the host page. It shows alias items (site-specific, clickable to fill the field) and always shows a "Create new email Alias" button at the bottom. A 150 ms blur delay prevents the widget from disappearing before a `mousedown` on it can register.

### Extending the API client

All API calls go through `apiFetch<T>()` in `src/api/client.ts`, which attaches the Bearer token and throws on non-2xx responses. Add new endpoints there. `getProviders()` is the one exception — it skips `apiFetch` because it requires no authentication.
