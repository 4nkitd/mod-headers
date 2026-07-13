import { loadState, onStateChange } from '../lib/storage.js';
import { toDnrRule } from '../lib/rules.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  syncDnrRules();
});

chrome.runtime.onStartup.addListener(() => {
  syncDnrRules();
});

onStateChange(() => {
  syncDnrRules();
});

async function syncDnrRules() {
  try {
    const { rules, settings } = await loadState();
    const masterEnabled = settings.masterEnabled !== false;

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map(r => r.id);

    const addRules = [];
    if (masterEnabled) {
      let nextId = 1;
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const dnr = toDnrRule(rule, nextId);
        if (dnr) {
          addRules.push(dnr);
          nextId++;
        }
      }
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });
  } catch (err) {
    console.error('[ModHeaders] DNR sync failed:', err);
  }
}
