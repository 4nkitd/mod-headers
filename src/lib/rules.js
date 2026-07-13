// Pure helpers for rule shape + DNR translation. Imported by both the
// service worker and the side panel, so it must stay free of DOM access.

export const HEADER_OPS = ['set', 'append', 'remove'];
export const MATCH_TYPES = ['url', 'domain', 'regex'];

export const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other'
];

export function newRule(partial = {}) {
  const now = Date.now();
  return {
    id: cryptoId(),
    enabled: true,
    name: 'Untitled rule',
    matchType: 'url',
    pattern: '*://*/*',
    resourceTypes: [],
    requestHeaders: [],
    responseHeaders: [],
    createdAt: now,
    updatedAt: now,
    ...partial
  };
}

export function cryptoId() {
  // Short, sortable-ish id. Crypto is available in both SW and side panel.
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeHeaderEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map(h => ({
      header: String(h.header || '').trim(),
      operation: HEADER_OPS.includes(h.operation) ? h.operation : 'set',
      value: h.operation === 'remove' ? '' : String(h.value ?? '')
    }))
    .filter(h => h.header.length > 0);
}

export function toDnrRule(rule, dnrId) {
  const requestHeaders = sanitizeHeaderEntries(rule.requestHeaders).map(h =>
    h.operation === 'remove'
      ? { header: h.header, operation: 'remove' }
      : { header: h.header, operation: h.operation, value: h.value }
  );
  const responseHeaders = sanitizeHeaderEntries(rule.responseHeaders).map(h =>
    h.operation === 'remove'
      ? { header: h.header, operation: 'remove' }
      : { header: h.header, operation: h.operation, value: h.value }
  );

  if (!requestHeaders.length && !responseHeaders.length) return null;

  const action = { type: 'modifyHeaders' };
  if (requestHeaders.length) action.requestHeaders = requestHeaders;
  if (responseHeaders.length) action.responseHeaders = responseHeaders;

  const condition = {};
  const pattern = (rule.pattern || '').trim();

  if (rule.matchType === 'regex') {
    condition.regexFilter = pattern || '.*';
  } else if (rule.matchType === 'domain') {
    const domain = pattern.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) return null;
    condition.requestDomains = [domain.toLowerCase()];
  } else {
    condition.urlFilter = pattern || '*';
  }

  const types =
    Array.isArray(rule.resourceTypes) && rule.resourceTypes.length
      ? rule.resourceTypes.filter(t => ALL_RESOURCE_TYPES.includes(t))
      : ALL_RESOURCE_TYPES;
  condition.resourceTypes = types;

  return {
    id: dnrId,
    priority: 1,
    action,
    condition
  };
}

export function summarizeRule(rule) {
  const reqCount = (rule.requestHeaders || []).filter(h => h.header).length;
  const resCount = (rule.responseHeaders || []).filter(h => h.header).length;
  const parts = [];
  if (reqCount) parts.push(`${reqCount} request`);
  if (resCount) parts.push(`${resCount} response`);
  if (!parts.length) return 'No headers configured';
  return parts.join(' · ') + (reqCount + resCount === 1 ? ' header' : ' headers');
}
