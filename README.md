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

## Browser support

| Browser           | Side panel | DNR rules | Status      |
|-------------------|------------|-----------|-------------|
| Chrome ≥116       | yes        | yes       | full        |
| Edge ≥116         | yes        | yes       | full        |
| Brave ≥1.58       | yes        | yes       | full        |
| Opera ≥102        | yes        | yes       | full        |
| Arc               | yes        | yes       | full        |
| Vivaldi ≥6.4      | yes        | yes       | full        |
| Chromium ≥116     | yes        | yes       | full        |
| Firefox            | no (1)     | partial   | load as temp add-on |

(1) Firefox does not implement the side panel API. Use `about:debugging` to load.

## Quick start

1. Open the side panel by clicking the ModHeaders toolbar icon.
2. Click **+ New Rule** (or press `⌘N` / `Ctrl+N`).
3. Give it a name, set a URL pattern (e.g. `*://api.example.com/*`).
4. Add headers — choose *request* or *response*, pick set/append/remove.
5. Click **Save** (`⌘S` / `Ctrl+S`). Headers inject immediately.
6. Toggle the master switch to pause/resume all rules at once.

Import/export your rule set as JSON from the **⋮** menu.

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
