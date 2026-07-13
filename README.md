# ModHeaders

A Chrome extension that lives in the **side panel** and lets you configure
HTTP request/response header rules with a polished, distraction-free UI.

Built on Chrome's modern `declarativeNetRequest` API (Manifest V3).

## Features

- **Side panel UX** — open from any tab, stays out of your way
- **Per-rule** header set / append / remove for both request and response
- **URL, domain, or regex** matching
- **Per-resource-type** filters (XHR, main_frame, script, …)
- **Master toggle** to instantly pause every rule
- **Search**, **duplicate**, **import / export JSON**
- **Light + dark theme** (follows system)
- **Keyboard**: `/` focus search · `⌘N` new rule · `⌘S` save · `Esc` back

## Install

### Auto-install (all browsers, all OSes)

```bash
bash tools/install.sh
```

Detects your OS and installed browsers (Chrome, Edge, Brave, Opera, Arc,
Vivaldi, Chromium, Firefox, Firefox Dev) and opens each to the right page.

For a one-shot temp load (gone after browser quit):
```bash
bash tools/install.sh --load-temp
```

### Manual (unpacked)

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked** and choose this folder
4. Pin the extension and click its toolbar icon to open the side panel

## Project layout

```
manifest.json
icons/                        generated PNGs
src/
  background/service-worker.js   syncs storage → DNR dynamic rules
  lib/storage.js                 chrome.storage facade
  lib/rules.js                   rule shape + DNR translation
  sidepanel/                     UI (HTML / CSS / JS)
tools/make-icons.py              regenerate icons (uv run …)
tools/install.sh                  cross-browser auto-installer
tools/test-ui.mjs                 visual smoke test (Playwright)
```

## Regenerating icons

```bash
uv run tools/make-icons.py
```

## How rules become DNR rules

Storage holds a plain `rules[]` array. The service worker watches
`chrome.storage` and rebuilds the dynamic DNR ruleset on every change:

- enabled rules with at least one valid header op are emitted
- match type translates to `urlFilter` / `requestDomains` / `regexFilter`
- resource-type filter is applied if specified, otherwise all types

When the master toggle is off, the dynamic ruleset is simply emptied —
no rules fire until you flip it back on.
