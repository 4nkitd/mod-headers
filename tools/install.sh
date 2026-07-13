#!/usr/bin/env bash
set -euo pipefail

# ModHeaders auto-installer — cross-browser, cross-OS
# Usage: bash tools/install.sh [--load-temp]

BOLD="$(tput bold 2>/dev/null || echo '')"
GREEN="$(tput setaf 2 2>/dev/null || echo '')"
YELLOW="$(tput setaf 3 2>/dev/null || echo '')"
CYAN="$(tput setaf 6 2>/dev/null || echo '')"
RED="$(tput setaf 1 2>/dev/null || echo '')"
RESET="$(tput sgr0 2>/dev/null || echo '')"

EXT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$EXT_DIR/manifest.json"
LOAD_TEMP=false

if [[ "${1:-}" == "--load-temp" ]]; then
  LOAD_TEMP=true
  shift
fi

log()  { echo -e "${CYAN}[mod-headers]${RESET} $1"; }
ok()   { echo -e "  ${GREEN}${BOLD}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}${BOLD}⚠${RESET}  $1"; }
err()  { echo -e "  ${RED}${BOLD}✗${RESET} $1"; }

die() {
  echo -e "${RED}${BOLD}FATAL:${RESET} $1" >&2
  exit 1
}

# ── OS detection ──────────────────────────────────────────────
UNAME="$(uname -s)"
case "$UNAME" in
  Darwin)  OS="macos"  ;;
  Linux)   OS="linux"  ;;
  *_NT-*|MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
  *)       OS="unknown";;
esac

log "detected OS: ${BOLD}$OS${RESET}"
log "extension path: $EXT_DIR"

[[ -f "$MANIFEST" ]] || die "manifest.json not found at $MANIFEST"

# ── Browser detection ─────────────────────────────────────────

BROWSERS=()

detect_browser() {
  local name="$1" label="$2" shift; shift
  for p in "$@"; do
    case "$OS" in
      macos)
        local found=false
        for dir in "/Applications" "$HOME/Applications" "/System/Volumes/Data/Applications"; do
          if [[ -d "$dir/${p}.app" ]]; then found=true; break; fi
        done
        if ! $found && command -v mdfind &>/dev/null; then
          local mdfind_result
          mdfind_result="$(mdfind "kMDItemContentType == 'com.apple.application-bundle' && kMDItemDisplayName == '${p}'" 2>/dev/null | head -1)"
          if [[ -n "$mdfind_result" && -d "$mdfind_result" ]]; then
            found=true
          fi
        fi
        if $found; then
          BROWSERS+=("$name|$label|macos|$p")
          return
        fi
        ;;
      linux)
        if command -v "$p" &>/dev/null || [[ -f "/usr/bin/$p" ]] || [[ -f "/opt/$p/$p" ]] || [[ -f "/snap/bin/$p" ]]; then
          BROWSERS+=("$name|$label|linux|$p")
          return
        fi
        if command -v flatpak &>/dev/null && flatpak list 2>/dev/null | grep -qi "$p"; then
          BROWSERS+=("$name|$label|linux|flatpak run $p")
          return
        fi
        if command -v snap &>/dev/null && snap list 2>/dev/null | grep -qi "$name"; then
          BROWSERS+=("$name|$label|linux|$p")
          return
        fi
        ;;
      windows)
        local found=false
        for path in "$@"; do
          if [[ -f "$path" ]]; then found=true; p="$path"; break; fi
        done
        if $found; then
          BROWSERS+=("$name|$label|windows|$p")
          return
        fi
        ;;
    esac
  done
}

# Browser registry: name | label | macOS .app names | Windows paths | Linux bins
# On macOS/linux the extra args are treated as names, on Windows they're actual .exe paths.

if [[ "$OS" == "windows" ]]; then
  PROGRAM_FILES_X86="/c/Program Files (x86)"
  PROGRAM_FILES="/c/Program Files"
  LOCAL_APPDATA="/c/Users/$USER/AppData/Local"

  detect_browser "chrome"  "Google Chrome" \
    "$PROGRAM_FILES/Google/Chrome/Application/chrome.exe" \
    "$PROGRAM_FILES_X86/Google/Chrome/Application/chrome.exe"
  detect_browser "edge"    "Microsoft Edge" \
    "$PROGRAM_FILES/Microsoft/Edge/Application/msedge.exe" \
    "$PROGRAM_FILES_X86/Microsoft/Edge/Application/msedge.exe"
  detect_browser "brave"   "Brave Browser" \
    "$PROGRAM_FILES/BraveSoftware/Brave-Browser/Application/brave.exe" \
    "$LOCAL_APPDATA/BraveSoftware/Brave-Browser/Application/brave.exe"
  detect_browser "opera"   "Opera" \
    "$LOCAL_APPDATA/Programs/Opera/opera.exe" \
    "$PROGRAM_FILES/Opera/opera.exe"
  detect_browser "vivaldi" "Vivaldi" \
    "$LOCAL_APPDATA/Vivaldi/Application/vivaldi.exe" \
    "$PROGRAM_FILES/Vivaldi/Application/vivaldi.exe"
  detect_browser "arc"     "Arc" \
    "$LOCAL_APPDATA/Arc/Arc.exe"
  detect_browser "firefox" "Firefox" \
    "$PROGRAM_FILES/Mozilla Firefox/firefox.exe" \
    "$PROGRAM_FILES_X86/Mozilla Firefox/firefox.exe"
  detect_browser "chromium" "Chromium" \
    "$LOCAL_APPDATA/Chromium/Application/chrome.exe"
  detect_browser "firefox-dev" "Firefox Dev" \
    "$PROGRAM_FILES/Firefox Developer Edition/firefox.exe"
else
  detect_browser "chrome"   "Google Chrome"              "Google Chrome"
  detect_browser "edge"     "Microsoft Edge"             "Microsoft Edge" "microsoft-edge"
  detect_browser "brave"    "Brave Browser"              "Brave Browser" "brave-browser"
  detect_browser "opera"    "Opera"                      "Opera" "opera"
  detect_browser "arc"      "Arc"                        "Arc"
  detect_browser "vivaldi"  "Vivaldi"                    "Vivaldi" "vivaldi"
  detect_browser "chromium" "Chromium"                   "Chromium" "chromium" "chromium-browser"
  detect_browser "firefox"  "Firefox"                    "Firefox" "firefox"
  detect_browser "firefox-dev" "Firefox Dev"             "Firefox Developer Edition" "firefox-developer-edition" "Firefox Nightly"
fi

if [[ ${#BROWSERS[@]} -eq 0 ]]; then
  warn "no supported browsers detected."
  echo ""
  echo "  To install manually, open your browser's extension management page"
  echo "  and load the unpacked extension from:"
  echo "    $EXT_DIR"
  exit 0
fi

log "found ${BOLD}${#BROWSERS[@]}${RESET} browser(s):"
for entry in "${BROWSERS[@]}"; do
  IFS='|' read -r name label os_key bin <<< "$entry"
  echo "  - $label ($bin)"
done
echo ""

# ── Install helpers ───────────────────────────────────────────

win_open_url() {
  cmd.exe /c start "" "$1" 2>/dev/null &
}

win_launch_with_flag() {
  local exe="$1" flag="$2"
  # Use cygpath to convert the unix path to Windows style if needed
  local win_flag
  win_flag="$(cygpath -w "$flag" 2>/dev/null || echo "$flag")"
  cmd.exe /c start "" "$exe" "$win_flag" 2>/dev/null &
}

install_chromium() {
  local label="$1" bin="$2"

  case "$OS" in
    macos)
      if $LOAD_TEMP; then
        open -a "$label" --args --load-extension="$EXT_DIR" 2>/dev/null && \
          ok "$label launched with extension loaded (temporary)" || \
          warn "could not launch $label with --load-extension"
      else
        open -a "$label" "chrome://extensions" 2>/dev/null && \
          ok "$label → chrome://extensions opened" || \
          warn "could not open $label"
      fi
      ;;
    linux)
      if $LOAD_TEMP; then
        "$bin" --load-extension="$EXT_DIR" &>/dev/null &
        ok "$label launched with extension loaded (temporary)"
      else
        "$bin" "chrome://extensions" &>/dev/null &
        ok "$label → chrome://extensions opened"
      fi
      ;;
    windows)
      if $LOAD_TEMP; then
        win_launch_with_flag "$bin" "--load-extension=$EXT_DIR"
        ok "$label launched with extension loaded (temporary)"
      else
        win_open_url "chrome://extensions"
        ok "$label → chrome://extensions opened (use any Chromium browser window)"
      fi
      ;;
  esac
}

install_firefox() {
  local label="$1" bin="$2"

  case "$OS" in
    macos)
      open -a "$label" "about:debugging#/runtime/this-firefox" 2>/dev/null && \
        ok "$label → about:debugging opened" || \
        warn "could not open $label"
      ;;
    linux)
      "$bin" "about:debugging#/runtime/this-firefox" &>/dev/null &
      ok "$label → about:debugging opened"
      ;;
    windows)
      win_open_url "about:debugging#/runtime/this-firefox"
      ok "$label → about:debugging opened (use any Firefox window)"
      ;;
  esac
}

# ── Run installs ──────────────────────────────────────────────

log "installing ModHeaders..."

for entry in "${BROWSERS[@]}"; do
  IFS='|' read -r name label os_key bin <<< "$entry"

  case "$name" in
    chrome|edge|brave|opera|arc|vivaldi|chromium)
      install_chromium "$label" "$bin"
      ;;
    firefox|firefox-dev)
      install_firefox "$label" "$bin"
      ;;
  esac
done

echo ""

# ── Post-install instructions ─────────────────────────────────
if $LOAD_TEMP; then
  log "${BOLD}Temporary load${RESET} — extension will be removed when browser quits."
  echo "  Re-run without --load-temp for permanent install."
else
  echo "${GREEN}${BOLD}╔════════════════════════════════════════════════════════╗${RESET}"
  echo "${GREEN}${BOLD}║${RESET}  For each browser window that opened:                ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}                                                        ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}  ${BOLD}Chromium (Chrome / Edge / Brave / Opera / Arc):${RESET}     ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}    1. Toggle ${BOLD}Developer mode${RESET} ON (top right)          ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}    2. Click ${BOLD}Load unpacked${RESET}                            ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}    3. Select: ${CYAN}$EXT_DIR${RESET}"
  echo "${GREEN}${BOLD}║${RESET}                                                        ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}  ${BOLD}Firefox:${RESET}                                             ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}    1. Click ${BOLD}Load Temporary Add-on…${RESET}                 ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}║${RESET}    2. Select: ${CYAN}$MANIFEST${RESET}"
  echo "${GREEN}${BOLD}║${RESET}                                                        ${GREEN}${BOLD}║${RESET}"
  echo "${GREEN}${BOLD}╚════════════════════════════════════════════════════════╝${RESET}"
fi