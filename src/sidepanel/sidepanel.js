import {
  loadState,
  saveRules,
  saveSettings,
  onStateChange
} from '../lib/storage.js';
import {
  newRule,
  summarizeRule,
  ALL_RESOURCE_TYPES,
  HEADER_OPS
} from '../lib/rules.js';

// =====================================================================
// State
// =====================================================================
const state = {
  rules: [],
  settings: { masterEnabled: true },
  search: '',
  view: 'list',          // 'list' | 'edit'
  editing: null,         // working copy of the rule being edited
  editingExisting: false // is editing an existing rule (vs new)?
};

// =====================================================================
// DOM refs
// =====================================================================
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const app = $('#app');
const ruleListEl = $('#ruleList');
const emptyStateEl = $('#emptyState');
const searchEl = $('#search');
const masterToggleEl = $('#masterToggle');
const statusPillEl = $('#statusPill');
const menuBtn = $('#menuBtn');
const menuPopover = $('#menuPopover');
const importFileEl = $('#importFile');
const toastEl = $('#toast');

const editTitleEl = $('#editTitle');
const editEyebrowEl = $('#editEyebrow');
const statusLabelEl = statusPillEl.querySelector('.status-label');
const ruleNameEl = $('#ruleName');
const ruleMatchTypeEl = $('#ruleMatchType');
const rulePatternEl = $('#rulePattern');
const ruleEnabledEl = $('#ruleEnabled');
const requestHeadersEl = $('#requestHeaders');
const responseHeadersEl = $('#responseHeaders');
const resourceTypesEl = $('#resourceTypes');
const previewBox = $('#previewBox');
const previewText = $('#previewText');
const deleteBtn = $('#deleteBtn');

const headerRowTpl = $('#headerRowTemplate');
const ruleCardTpl = $('#ruleCardTemplate');

// =====================================================================
// Boot
// =====================================================================
init();

async function init() {
  const loaded = await loadState();
  state.rules = loaded.rules;
  state.settings = loaded.settings;
  buildResourceTypeChips();
  renderAll();
  wireEvents();

  // External changes (e.g. another panel instance) → re-render
  onStateChange(async () => {
    const fresh = await loadState();
    state.rules = fresh.rules;
    state.settings = fresh.settings;
    if (state.view === 'list') renderAll();
    else updateMasterUi();
  });
}

// =====================================================================
// Rendering
// =====================================================================
function renderAll() {
  updateMasterUi();
  renderRuleList();
}

function updateMasterUi() {
  const on = state.settings.masterEnabled !== false;
  masterToggleEl.checked = on;
  app.dataset.master = on ? 'on' : 'off';
  const total = state.rules.length;
  const enabled = state.rules.filter(r => r.enabled).length;
  let label;
  if (!on) label = total ? `paused — ${total} ${total === 1 ? 'rule' : 'rules'}` : 'paused';
  else if (total === 0) label = 'idle — no rules';
  else if (enabled === 0) label = `${total} ${total === 1 ? 'rule' : 'rules'} — all off`;
  else if (enabled === total) label = `${enabled} ${enabled === 1 ? 'rule' : 'rules'} active`;
  else label = `${enabled}/${total} active`;
  if (statusLabelEl) statusLabelEl.textContent = label;
  else statusPillEl.textContent = label;
}

function renderRuleList() {
  const q = state.search.trim().toLowerCase();
  const visible = state.rules.filter(r => {
    if (!q) return true;
    const hay = [
      r.name,
      r.pattern,
      ...(r.requestHeaders || []).flatMap(h => [h.header, h.value]),
      ...(r.responseHeaders || []).flatMap(h => [h.header, h.value])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  ruleListEl.innerHTML = '';
  if (state.rules.length === 0) {
    emptyStateEl.hidden = false;
    ruleListEl.hidden = true;
    return;
  }
  emptyStateEl.hidden = true;
  ruleListEl.hidden = false;

  if (visible.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'hint';
    msg.style.textAlign = 'center';
    msg.textContent = `No rules match "${state.search}"`;
    ruleListEl.appendChild(msg);
    return;
  }

  for (const rule of visible) {
    ruleListEl.appendChild(renderRuleCard(rule));
  }
}

function renderRuleCard(rule) {
  const node = ruleCardTpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = rule.id;
  node.dataset.disabled = String(!rule.enabled);

  node.querySelector('.rule-name').textContent = rule.name || 'Untitled rule';
  node.querySelector('.match-badge').textContent =
    rule.matchType === 'regex' ? 'REGEX' :
    rule.matchType === 'domain' ? 'DOMAIN' : 'URL';
  node.querySelector('.rule-pattern').textContent = rule.pattern || '*';
  node.querySelector('.rule-summary').textContent = summarizeRule(rule);

  const toggle = node.querySelector('.rule-toggle');
  toggle.checked = rule.enabled;
  toggle.addEventListener('change', e => {
    e.stopPropagation();
    toggleRule(rule.id, toggle.checked);
  });

  node.querySelector('.edit-btn').addEventListener('click', () => openEditor(rule.id));
  node.querySelector('.duplicate-btn').addEventListener('click', () => duplicateRule(rule.id));
  node.querySelector('.rule-card-main').addEventListener('click', e => {
    if (e.target.closest('label, input, button')) return;
    openEditor(rule.id);
  });

  return node;
}

// =====================================================================
// Editor
// =====================================================================
function buildResourceTypeChips() {
  resourceTypesEl.innerHTML = '';
  for (const t of ALL_RESOURCE_TYPES) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.value = t;
    chip.dataset.on = 'false';
    chip.textContent = t.replace(/_/g, ' ');
    chip.addEventListener('click', () => {
      const next = chip.dataset.on === 'true' ? 'false' : 'true';
      chip.dataset.on = next;
      syncEditingFromForm();
    });
    resourceTypesEl.appendChild(chip);
  }
}

function openEditor(ruleId) {
  let rule;
  if (ruleId) {
    const original = state.rules.find(r => r.id === ruleId);
    if (!original) return;
    rule = JSON.parse(JSON.stringify(original)); // deep clone working copy
    state.editingExisting = true;
    if (editEyebrowEl) editEyebrowEl.textContent = '[ edit ]';
    editTitleEl.textContent = original.name || 'Untitled rule';
    deleteBtn.hidden = false;
  } else {
    rule = newRule({ name: '' });
    state.editingExisting = false;
    if (editEyebrowEl) editEyebrowEl.textContent = '[ new ]';
    editTitleEl.textContent = 'Untitled rule';
    deleteBtn.hidden = true;
  }

  state.editing = rule;
  state.view = 'edit';
  app.dataset.view = 'edit';

  // Populate form
  ruleNameEl.value = rule.name || '';
  ruleMatchTypeEl.value = rule.matchType || 'url';
  rulePatternEl.value = rule.pattern || '';
  ruleEnabledEl.checked = rule.enabled !== false;

  // Resource type chips
  $$('.chip', resourceTypesEl).forEach(c => {
    c.dataset.on = (rule.resourceTypes || []).includes(c.dataset.value) ? 'true' : 'false';
  });

  // Header rows
  requestHeadersEl.innerHTML = '';
  responseHeadersEl.innerHTML = '';
  (rule.requestHeaders || []).forEach(h => addHeaderRow('request', h));
  (rule.responseHeaders || []).forEach(h => addHeaderRow('response', h));
  updateEmptyHints();
  updatePreview();

  setTimeout(() => ruleNameEl.focus(), 50);
}

function closeEditor() {
  state.editing = null;
  state.view = 'list';
  app.dataset.view = 'list';
  renderRuleList();
}

function addHeaderRow(kind, data = { header: '', value: '', operation: 'set' }) {
  const container = kind === 'request' ? requestHeadersEl : responseHeadersEl;
  const row = headerRowTpl.content.firstElementChild.cloneNode(true);
  const opEl = row.querySelector('.op');
  const nameEl = row.querySelector('.header-name');
  const valEl = row.querySelector('.header-value');
  opEl.value = HEADER_OPS.includes(data.operation) ? data.operation : 'set';
  nameEl.value = data.header || '';
  valEl.value = data.value || '';
  row.dataset.op = opEl.value;

  opEl.addEventListener('change', () => {
    row.dataset.op = opEl.value;
    syncEditingFromForm();
  });
  nameEl.addEventListener('input', syncEditingFromForm);
  valEl.addEventListener('input', syncEditingFromForm);
  row.querySelector('.remove-row').addEventListener('click', () => {
    row.remove();
    syncEditingFromForm();
    updateEmptyHints();
  });

  container.appendChild(row);
  updateEmptyHints();
  setTimeout(() => nameEl.focus(), 30);
}

function updateEmptyHints() {
  $('[data-empty-hint="request"]').hidden = requestHeadersEl.children.length > 0;
  $('[data-empty-hint="response"]').hidden = responseHeadersEl.children.length > 0;
}

function readHeaderRows(container) {
  return Array.from(container.children).map(row => ({
    operation: row.querySelector('.op').value,
    header: row.querySelector('.header-name').value.trim(),
    value: row.querySelector('.header-value').value
  }));
}

function syncEditingFromForm() {
  if (!state.editing) return;
  state.editing.name = ruleNameEl.value;
  state.editing.matchType = ruleMatchTypeEl.value;
  state.editing.pattern = rulePatternEl.value;
  state.editing.enabled = ruleEnabledEl.checked;
  state.editing.resourceTypes = $$('.chip[data-on="true"]', resourceTypesEl).map(c => c.dataset.value);
  state.editing.requestHeaders = readHeaderRows(requestHeadersEl);
  state.editing.responseHeaders = readHeaderRows(responseHeadersEl);
  editTitleEl.textContent = ruleNameEl.value.trim() || 'Untitled rule';
  updatePreview();
}

function updatePreview() {
  const r = state.editing;
  if (!r) { previewBox.hidden = true; return; }
  const reqValid = (r.requestHeaders || []).filter(h => h.header.trim());
  const resValid = (r.responseHeaders || []).filter(h => h.header.trim());
  if (!reqValid.length && !resValid.length) {
    previewBox.hidden = true;
    return;
  }

  // Tabular alignment: pad direction tag + operation column.
  const rows = [
    ...reqValid.map(h => ['→ req', h.operation, h.header, h.value]),
    ...resValid.map(h => ['← res', h.operation, h.header, h.value])
  ];
  const opWidth = Math.max(...rows.map(r => r[1].length));
  const nameWidth = Math.min(28, Math.max(...rows.map(r => r[2].length)));

  const lines = rows.map(([dir, op, name, val]) => {
    const opStr = op.toUpperCase().padEnd(opWidth, ' ');
    if (op === 'remove') return `${dir}  ${opStr}  ${name}`;
    return `${dir}  ${opStr}  ${name.padEnd(nameWidth, ' ')}  ${val}`;
  });
  previewText.textContent = lines.join('\n');
  previewBox.hidden = false;
}

// =====================================================================
// Mutations
// =====================================================================
async function persistRules() {
  await saveRules(state.rules);
}

async function toggleRule(id, enabled) {
  const rule = state.rules.find(r => r.id === id);
  if (!rule) return;
  rule.enabled = enabled;
  rule.updatedAt = Date.now();
  const card = ruleListEl.querySelector(`.rule-card[data-id="${id}"]`);
  if (card) card.dataset.disabled = String(!enabled);
  await persistRules();
  updateMasterUi();
}

async function saveCurrentRule() {
  syncEditingFromForm();
  const r = state.editing;
  if (!r.name?.trim()) r.name = 'Untitled rule';
  if (!r.pattern?.trim()) {
    toast('Pattern is required');
    rulePatternEl.focus();
    return;
  }
  r.requestHeaders = (r.requestHeaders || []).filter(h => h.header.trim());
  r.responseHeaders = (r.responseHeaders || []).filter(h => h.header.trim());
  if (!r.requestHeaders.length && !r.responseHeaders.length) {
    toast('Add at least one header');
    return;
  }
  r.updatedAt = Date.now();

  if (state.editingExisting) {
    const idx = state.rules.findIndex(x => x.id === r.id);
    if (idx >= 0) state.rules[idx] = r;
  } else {
    state.rules.unshift(r);
  }
  await persistRules();
  toast(state.editingExisting ? 'Rule updated' : 'Rule created');
  closeEditor();
}

async function deleteCurrentRule() {
  if (!state.editing || !state.editingExisting) return;
  if (!confirm('Delete this rule? This cannot be undone.')) return;
  state.rules = state.rules.filter(r => r.id !== state.editing.id);
  await persistRules();
  toast('Rule deleted');
  closeEditor();
}

async function duplicateRule(id) {
  const original = state.rules.find(r => r.id === id);
  if (!original) return;
  const copy = newRule({
    ...JSON.parse(JSON.stringify(original)),
    name: `${original.name} (copy)`
  });
  copy.id = newRule().id;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  const idx = state.rules.findIndex(r => r.id === id);
  state.rules.splice(idx + 1, 0, copy);
  await persistRules();
  toast('Rule duplicated');
}

async function setMaster(on) {
  await saveSettings({ masterEnabled: on });
  state.settings.masterEnabled = on;
  updateMasterUi();
}

async function clearAll() {
  if (!confirm('Remove all rules? This cannot be undone.')) return;
  state.rules = [];
  await persistRules();
  toast('All rules removed');
  renderAll();
}

function exportRules() {
  const blob = new Blob([JSON.stringify({ rules: state.rules }, null, 2)], {
    type: 'application/json'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `modheaders-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importRules(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : parsed.rules;
    if (!Array.isArray(incoming)) throw new Error('Bad format');
    let added = 0;
    for (const r of incoming) {
      const merged = newRule({ ...r });
      merged.id = newRule().id;
      state.rules.unshift(merged);
      added++;
    }
    await persistRules();
    renderAll();
    toast(`Imported ${added} rule${added === 1 ? '' : 's'}`);
  } catch (err) {
    toast('Import failed — invalid file');
  }
}

// =====================================================================
// Toast
// =====================================================================
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
}

// =====================================================================
// Menu open/close (bulletproof)
// =====================================================================
function openMenu() {
  menuPopover.hidden = false;
  menuBtn.setAttribute('aria-expanded', 'true');
  // Defer the listener attachment by one frame so the click that opened the
  // menu does NOT immediately close it.
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onMenuPointerDown, true);
    document.addEventListener('keydown', onMenuKeyDown, true);
  });
}

function closeMenu() {
  if (menuPopover.hidden) return;
  menuPopover.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
  document.removeEventListener('pointerdown', onMenuPointerDown, true);
  document.removeEventListener('keydown', onMenuKeyDown, true);
}

function onMenuPointerDown(e) {
  // Clicks inside the popover or on the trigger keep the menu open
  // (toggling on the trigger is handled by its own click listener).
  if (e.target.closest('#menuPopover, #menuBtn')) return;
  closeMenu();
}

function onMenuKeyDown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeMenu();
  }
}

// =====================================================================
// Event wiring
// =====================================================================
function wireEvents() {
  // List view
  $('#addRuleBtn').addEventListener('click', () => openEditor(null));
  $('#emptyAddBtn').addEventListener('click', () => openEditor(null));
  searchEl.addEventListener('input', e => {
    state.search = e.target.value;
    renderRuleList();
  });
  masterToggleEl.addEventListener('change', e => setMaster(e.target.checked));

  // Menu — robust open/close. The opening click is allowed to finish before
  // we attach the outside-click listener, so a single click never opens-and-
  // closes. We also listen in the capture phase so nothing downstream can
  // swallow the close signal.
  menuBtn.addEventListener('click', () => {
    if (menuPopover.hidden) openMenu(); else closeMenu();
  });
  menuPopover.addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    closeMenu();
    if (action === 'export') exportRules();
    else if (action === 'import') importFileEl.click();
    else if (action === 'clear') clearAll();
  });
  importFileEl.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) importRules(file);
    importFileEl.value = '';
  });

  // Edit view
  $('#backBtn').addEventListener('click', closeEditor);
  $('#cancelBtn').addEventListener('click', closeEditor);
  $('#saveBtn').addEventListener('click', saveCurrentRule);
  deleteBtn.addEventListener('click', deleteCurrentRule);

  ruleNameEl.addEventListener('input', syncEditingFromForm);
  ruleMatchTypeEl.addEventListener('change', () => {
    syncEditingFromForm();
    updatePatternPlaceholder();
  });
  rulePatternEl.addEventListener('input', syncEditingFromForm);
  ruleEnabledEl.addEventListener('change', syncEditingFromForm);

  document.querySelectorAll('[data-add-header]').forEach(btn => {
    btn.addEventListener('click', () => addHeaderRow(btn.dataset.addHeader));
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    const inField = e.target.matches('input, select, textarea');
    if (e.key === 'Escape') {
      if (!menuPopover.hidden) closeMenu();
      else if (state.view === 'edit') closeEditor();
    }
    if (e.key === '/' && !inField && state.view === 'list') {
      e.preventDefault();
      searchEl.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's' && state.view === 'edit') {
      e.preventDefault();
      saveCurrentRule();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n' && state.view === 'list') {
      e.preventDefault();
      openEditor(null);
    }
  });
}

function updatePatternPlaceholder() {
  const t = ruleMatchTypeEl.value;
  rulePatternEl.placeholder =
    t === 'regex' ? '^https://api\\.example\\.com/.*' :
    t === 'domain' ? 'api.example.com' :
    '*://*.example.com/*';
}
