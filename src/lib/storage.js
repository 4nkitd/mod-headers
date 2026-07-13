// Storage facade. Single source of truth for the rules array + settings.
// All callers go through here so the schema stays consistent.

const KEY_RULES = 'rules';
const KEY_SETTINGS = 'settings';

const DEFAULT_SETTINGS = {
  masterEnabled: true,
  theme: 'system'
};

export async function loadState() {
  const data = await chrome.storage.local.get([KEY_RULES, KEY_SETTINGS]);
  return {
    rules: Array.isArray(data[KEY_RULES]) ? data[KEY_RULES] : [],
    settings: { ...DEFAULT_SETTINGS, ...(data[KEY_SETTINGS] || {}) }
  };
}

export async function saveRules(rules) {
  await chrome.storage.local.set({ [KEY_RULES]: rules });
}

export async function saveSettings(settings) {
  const current = (await chrome.storage.local.get(KEY_SETTINGS))[KEY_SETTINGS] || {};
  await chrome.storage.local.set({
    [KEY_SETTINGS]: { ...DEFAULT_SETTINGS, ...current, ...settings }
  });
}

export function onStateChange(callback) {
  const listener = (changes, area) => {
    if (area !== 'local') return;
    if (KEY_RULES in changes || KEY_SETTINGS in changes) {
      callback(changes);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
