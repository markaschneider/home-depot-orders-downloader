'use strict';

const $ = id => document.getElementById(id);
const DELAY_MS = 1800;
const RECEIPT_TIMEOUT_MS = 65000;
const DOWNLOAD_TIMEOUT_MS = 30000;
let receipts = [];
let sourceTabId = null;
let running = false;
let cancelRequested = false;
let receiptTabId = null;
const DEFAULT_FOLDER = 'homedepot_receipts';
let downloadFolder = DEFAULT_FOLDER;
let groupEnabled = false;
let groupField = 'po';
const GROUP_FIELDS = ['po', 'project', 'purchaser', 'origin', 'payment'];
const FILTER_FIELDS = [...GROUP_FIELDS];
let filterOptions = Object.fromEntries(FILTER_FIELDS.map(key => [key, { enabled: false, text: '' }]));
let filterError = '';
let scanInProgress = false;
const GROUP_LABELS = { po: 'PO/Job', project: 'Project', purchaser: 'Purchaser', origin: 'Origin', payment: 'Payment' };
const GROUP_FALLBACKS = { po: 'No_PO_Job_Name', project: 'No_Project', purchaser: 'No_Purchaser', origin: 'No_Origin', payment: 'No_Payment' };
function selectedGroupField() { return document.querySelector('input[name="groupField"]:checked')?.value || 'po'; }
function updateGroupControls() {
  const enabled = $('groupEnabled').checked;
  $('groupOptions').hidden = !enabled;
  $('groupLabelText').textContent = enabled ? 'Separate into subfolders based on:' : 'Separate into subfolders...';
  $('groupEnabled').setAttribute('aria-expanded', String(enabled));
}

function updateFilterOptions(expanded) {
  $('filterOptionsBody').hidden = !expanded;
  $('filterOptionsToggle').setAttribute('aria-expanded', String(expanded));
  $('filterOptionsToggleText').textContent = expanded ? 'Collapse' : 'Expand';
}
function loadFilterControls() {
  for (const field of FILTER_FIELDS) {
    document.querySelector(`[data-filter-enabled="${field}"]`).checked = filterOptions[field].enabled;
    document.querySelector(`[data-filter-text="${field}"]`).value = filterOptions[field].text;
  }
}
function readFilterControls() {
  return Object.fromEntries(FILTER_FIELDS.map(field => [field, {
    enabled: document.querySelector(`[data-filter-enabled="${field}"]`).checked,
    text: document.querySelector(`[data-filter-text="${field}"]`).value
  }]));
}
function recordField(record, field) {
  let value = record.fields?.[field] || '';
  if (field === 'po' && /^(add\s+po\s*\/\s*job\s+name|add\s+po\s*\/\s*job)$/i.test(value.trim())) value = '';
  if (!value && field === 'po') value = record.poName || '';
  if (!value && field === 'origin') value = record.origin || '';
  return String(value).trim();
}
function activeFilters() {
  return FILTER_FIELDS.filter(f => filterOptions[f].enabled);
}
function matchingReceipts() {
  return receipts.filter(record => activeFilters().every(field =>
    recordField(record, field).toLocaleLowerCase().includes(filterOptions[field].text.trim().toLocaleLowerCase())
  ));
}
function refreshFilterCount() {
  const enabled = activeFilters();
  filterError = '';
  for (const field of enabled) {
    const needle = filterOptions[field].text.trim();
    if (!needle) { filterError = `Enter text for the checked ${GROUP_LABELS[field]} filter.`; break; }
    if (receipts.length && receipts.some(record => !recordField(record, field))) {
      // Missing values can be legitimate, particularly PO/Job placeholders.
      // Only block when the field is entirely absent from every record.
      if (!receipts.some(record => recordField(record, field))) {
        filterError = `No ${GROUP_LABELS[field]} values available. Enable the column in Home Depot Table Settings, then Scan orders.`;
        break;
      }
    }
  }
  const count = filterError ? 0 : matchingReceipts().length;
  $('filterCount').textContent = filterError || (receipts.length
    ? enabled.length ? `${count} of ${receipts.length} orders match ${enabled.length} active filter${enabled.length === 1 ? '' : 's'}.` : `All ${receipts.length} discovered orders will be downloaded.`
    : enabled.length ? 'Scan orders to calculate matches.' : 'No filters applied.');
  setButtons();
}
async function saveFilters() {
  filterOptions = readFilterControls();
  await chrome.storage.local.set({ filterOptions });
  refreshFilterCount();
}

function updateSaveOptions(expanded) {
  $('saveOptionsBody').hidden = !expanded;
  $('saveOptionsToggle').setAttribute('aria-expanded', String(expanded));
  $('saveOptionsToggleText').textContent = expanded ? 'Collapse' : 'Expand';
}

// Only paths relative to the browser's Downloads directory are allowed.
function normalizeBaseFolder(value) {
  const segments = value.trim().replace(/\\/g, '/').split('/').filter(Boolean);
  if (!segments.length || segments.some(part => part === '.' || part === '..' || !/^[a-zA-Z0-9_. -]+$/.test(part))) {
    throw new Error('Enter a relative Downloads subfolder using letters, numbers, spaces, periods, underscores or hyphens.');
  }
  return segments.join('/');
}
function categoryFolderName(record, field) {
  // The purchase-history table is authoritative for the optional columns;
  // query strings can provide a fallback for some fields.
  let value = record.fields?.[field] || '';
  if (field === 'po' && /^(add\s+po\s*\/\s*job\s+name|add\s+po\s*\/\s*job)$/i.test(value.trim())) value = '';
  if (!value && field === 'po') value = record.poName || '';
  if (!value && field === 'origin') value = record.origin || '';
  value = String(value).trim();
  if (!value || /^[-—–]+$/.test(value)) return GROUP_FALLBACKS[field];
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned.slice(0, 100) : GROUP_FALLBACKS[field];
}
async function restoreSettings() {
  const saved = await chrome.storage.local.get(['downloadFolder', 'groupByPo', 'groupEnabled', 'groupField', 'saveOptionsExpanded', 'filterOptionsExpanded', 'filterOptions']);
  downloadFolder = saved.downloadFolder || DEFAULT_FOLDER;
  // Upgrade the prior checkbox setting once; older preferences remain respected.
  groupEnabled = typeof saved.groupEnabled === 'boolean' ? saved.groupEnabled : saved.groupByPo === true;
  groupField = GROUP_FIELDS.includes(saved.groupField) ? saved.groupField : 'po';
  $('folder').value = downloadFolder;
  $('groupEnabled').checked = groupEnabled;
  document.querySelector(`input[name="groupField"][value="${groupField}"]`).checked = true;
  updateGroupControls();
  updateSaveOptions(saved.saveOptionsExpanded !== false);
  updateFilterOptions(saved.filterOptionsExpanded !== false);
  if (saved.filterOptions && typeof saved.filterOptions === 'object') {
    for (const f of FILTER_FIELDS) {
      filterOptions[f] = { enabled: saved.filterOptions[f]?.enabled === true, text: typeof saved.filterOptions[f]?.text === 'string' ? saved.filterOptions[f].text : '' };
    }
  }
  loadFilterControls();
  refreshFilterCount();
}
async function persistSettings() {
  try {
    const folder = normalizeBaseFolder($('folder').value);
    downloadFolder = folder;
    groupEnabled = $('groupEnabled').checked;
    groupField = selectedGroupField();
    await chrome.storage.local.set({ downloadFolder: folder, groupEnabled, groupField });
    $('folder').setCustomValidity('');
    status('Download preferences saved.');
  } catch (e) {
    $('folder').setCustomValidity(e.message);
    $('folder').reportValidity();
    throw e;
  }
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function status(message) { $('status').textContent = message; }
function log(message, failure = false) {
  const item = document.createElement('div');
  item.className = `entry ${failure ? 'fail' : 'success'}`;
  item.textContent = message;
  $('log').prepend(item);
}
function setButtons() {
  const unavailable = running || receipts.length === 0 || Boolean(filterError) || matchingReceipts().length === 0;
  $('test').disabled = unavailable;
  $('all').disabled = unavailable;
  $('scan').disabled = running;
  $('scan').textContent = scanInProgress ? 'Scanning…' : 'Scan orders';
  $('cancel').hidden = !running;
}
function isHistory(url) {
  try { const u = new URL(url); return /(^|\.)homedepot\.com$/i.test(u.hostname) && /purchase.history|purchase-history|purchasehistory|orders-purchases/i.test(u.pathname); }
  catch { return false; }
}

// Executed independently on each page, because Home Depot may re-render or navigate.
// Click only a numbered pagination control positioned beside the "Viewing x-y of n" footer.
function historyPage(action, pageNumber) {
  // Read the user-selected columns from the current table view.
  // Home Depot may implement the table with <tr> or ARIA rows.
  const cellsOf = row => [...row.querySelectorAll('td, th, [role="cell"], [role="columnheader"]')]
    .filter(el => !el.parentElement?.closest('td, th, [role="cell"], [role="columnheader"]'));
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const normHeading = s => clean(s).toLowerCase().replace(/[^a-z]/g, '');
  const headerKeys = {
    'pojob': 'po', 'pojobname': 'po', 'project': 'project',
    'purchaser': 'purchaser', 'origin': 'origin', 'payment': 'payment'
  };
  const headings = [...document.querySelectorAll('thead tr, [role="rowgroup"] [role="row"], tr, [role="row"]')]
    .find(row => {
      const hs = cellsOf(row).map(c => normHeading(c.textContent));
      return hs.some(h => h === 'payment') && hs.some(h => h === 'origin' || h === 'pojob');
    });
  const headerNames = headings ? cellsOf(headings).map(c => headerKeys[normHeading(c.textContent)] || null) : [];
  const entries = [...document.querySelectorAll('a[href*="order-details"]')]
    .map(a => {
      const row = a.closest('tr, [role="row"]');
      const columns = row ? cellsOf(row) : [];
      const fields = {};
      if (headerNames.length && headerNames.length === columns.length) {
        headerNames.forEach((key, i) => { if (key) fields[key] = clean(columns[i].innerText || columns[i].textContent); });
      }
      return { url: a.href, fields };
    }).filter(e => e.url);
  // The footer often spans several nested elements, so don't require a leaf node.
  const rangeRegex = /Viewing\s+(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)/i;
  const viewing = [...document.querySelectorAll('body *')]
    .filter(el => {
      const t = clean(el.textContent);
      return t.length < 180 && rangeRegex.test(t);
    })
    .sort((a,b) => (a.textContent || '').length - (b.textContent || '').length)[0];
  const match = clean(viewing?.textContent).match(rangeRegex);
  const range = match ? { from: +match[1], to: +match[2], total: +match[3] } : null;
  if (action === 'read') return { entries, range };
  if (!viewing || !range) return { clicked: false, reason: 'Could not identify the Viewing x-y of n pagination footer.' };

  const footerRect = viewing.getBoundingClientRect();
  const targets = [...document.querySelectorAll('button, a, [role="button"], [role="link"]')]
    .filter(el => el.textContent.trim() === String(pageNumber))
    .filter(el => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' &&
        Math.abs((r.top+r.bottom)/2 - (footerRect.top+footerRect.bottom)/2) < 110 &&
        r.left >= footerRect.left;
    })
    .sort((a,b) => Math.abs(a.getBoundingClientRect().top-footerRect.top)-Math.abs(b.getBoundingClientRect().top-footerRect.top));
  if (!targets.length) return { clicked: false, reason: `Couldn't locate pagination page ${pageNumber}.` };
  targets[0].click();
  return { clicked: true };
}

async function onHistoryTab(tabId, action, pageNumber) {
  const result = await chrome.scripting.executeScript({
    target: { tabId }, func: historyPage, args: [action, pageNumber ?? null]
  });
  return result?.[0]?.result;
}

async function waitForHistoryChange(tabId, oldRange, expectedPage, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await pause(500);
    try {
      const data = await onHistoryTab(tabId, 'read');
      const range = data?.range;
      if (range && range.from !== oldRange.from &&
          Math.ceil(range.from / (oldRange.to - oldRange.from + 1)) === expectedPage &&
          data.entries.length) return data;
    } catch (_) { /* Navigation might briefly prevent injection. */ }
  }
  throw new Error(`Page ${expectedPage} did not load within 25 seconds.`);
}

async function scan(showMissingHistoryDialog = false) {
  if (running) return;
  running = true;
  scanInProgress = true;
  setButtons();
  status('Searching for Home Depot Purchase History…');
  $('ordersDiscoveredRow').hidden = false;
  $('source').textContent = 'Scanning the current date range…';
  $('found').textContent = '…';
  await pause(0);
  let tab;
  const gathered = new Map();
  let scannedPages = 0;
  let expectedTotal = null;
  let historyTabMissing = false;
  try {
    const tabs = await chrome.tabs.query({});
    const candidates = tabs.filter(t => isHistory(t.url || ''));
    candidates.sort((a,b) => Number(Boolean(b.active)) - Number(Boolean(a.active)) || (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (!candidates.length) {
      historyTabMissing = true;
      if (showMissingHistoryDialog && !$('missingHistoryDialog').open) $('missingHistoryDialog').showModal();
      throw new Error('No Purchase History tab found. Sign in and open Home Depot Purchase History.');
    }
    tab = candidates[0];
    status('Reading receipt links from Purchase History…');
    let current = await onHistoryTab(tab.id, 'read');
    if (!current?.entries?.length) throw new Error('No receipt links found. Wait for the purchase list to load.');

    // A range such as "Viewing 1-20 of 26" establishes that there are two pages.
    let firstRange = current.range;
    let pageSize = firstRange ? firstRange.to - firstRange.from + 1 : current.entries.length;
    let firstPage = firstRange ? Math.floor((firstRange.from-1) / 20) + 1 : 1;
    // A refresh should scan the entire range even if the prior scan left us on page 2.
    if (firstPage > 1) {
      status('Returning to purchase-history page 1…');
      const response = await onHistoryTab(tab.id, 'click', 1);
      if (!response?.clicked) throw new Error(response?.reason || 'Unable to return to page 1. Select page 1 manually, then refresh.');
      current = await waitForHistoryChange(tab.id, firstRange, 1);
      firstRange = current.range;
      pageSize = firstRange ? firstRange.to - firstRange.from + 1 : current.entries.length;
      firstPage = 1;
    }
    expectedTotal = firstRange?.total ?? null;
    const totalPages = firstRange ? Math.ceil(firstRange.total / pageSize) : 1;
    if (totalPages > 100) throw new Error('Too many pages to scan automatically; please narrow the date range.');

    // If the user started on page 2+, scan from their current page to the end.
    // Do not claim to have included earlier pages.
    for (let page = firstPage; page <= totalPages; page++) {
      if (!current?.entries?.length) throw new Error(`No receipt URLs on page ${page}.`);
      current.entries.forEach(entry => {
        const existing = gathered.get(entry.url);
        gathered.set(entry.url, { url: entry.url, fields: { ...(existing?.fields || {}), ...entry.fields } });
      });
      scannedPages++;
      status(`Scanning purchase-history page ${page} of ${totalPages}…`);
      $('found').textContent = gathered.size;
      if (page === totalPages) break;
      const nextPage = page + 1;
      const response = await onHistoryTab(tab.id, 'click', nextPage);
      if (!response?.clicked) throw new Error(response?.reason || `Cannot select page ${nextPage}.`);
      current = await waitForHistoryChange(tab.id, current.range, nextPage);
    }

    receipts = [...gathered.values()].map(entry => {
      const url = entry.url;
      try {
        const u = new URL(url);
        const number = u.searchParams.get('orderNumber');
        const date = u.searchParams.get('salesDate');
        if (!number || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^[\w-]+$/.test(number)) return null;
        if (!/(^|\.)homedepot\.com$/i.test(u.hostname)) return null;
        return { url, number, date, fields: entry.fields, poName: u.searchParams.get('POJobName'), origin: u.searchParams.get('orderOrigin'), filename: `${date}_homedepot_order_${number}.html` };
      } catch { return null; }
    }).filter(Boolean);
    sourceTabId = tab.id;
    $('found').textContent = receipts.length;
    const partial = firstPage > 1 ? ` Started at page ${firstPage}; earlier pages were not scanned.` : '';
    const mismatch = expectedTotal !== null && firstPage === 1 && receipts.length !== expectedTotal
      ? ` Warning: found ${receipts.length} links but Home Depot reports ${expectedTotal} purchases.` : '';
    $('source').textContent = `${receipts.length} distinct orders across ${scannedPages} page(s).${partial}${mismatch}`;
    status(mismatch ? 'Scan incomplete. Check the page count before downloading.' : 'Ready. Choose a test or download all.');
  } catch (e) {
    // Never quietly offer a partial set as though all pages were discovered.
    receipts = [];
    sourceTabId = null;
    if (historyTabMissing) {
      $('ordersDiscoveredRow').hidden = true;
      $('source').textContent = 'Purchase History tab not found. See instructions.';
      status('');
    } else {
      $('ordersDiscoveredRow').hidden = false;
      $('found').textContent = '0';
      $('source').textContent = `Scan stopped after ${scannedPages} page(s), ${gathered.size} links seen. ${e.message || e}`;
      status(`Scan failed: ${e.message || e}`);
    }
  } finally {
    running = false;
    scanInProgress = false;
    refreshFilterCount();
  }
}

// The content script runs in the Home Depot receipt tab, after its app has rendered.
function readRenderedReceipt(expectedOrder) {
  const text = document.body?.innerText || '';
  const actual = new URL(location.href).searchParams.get('orderNumber');
  // Both online orders and in-store receipts can use either heading.
  const escapedOrder = expectedOrder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`\\b(?:ORDER|RECEIPT)\\s*#\\s*${escapedOrder}(?![A-Za-z0-9-])`, 'i');
  const receiptShown = heading.test(text);
  const sumsShown = /Subtotal\s*:/i.test(text) && /Total\s*:/i.test(text);
  if (actual !== expectedOrder || !receiptShown || !sumsShown) return null;
  return document.documentElement.outerHTML;
}

async function captureReceipt(record) {
  if (!receiptTabId) throw new Error('Receipt tab is unavailable.');
  await chrome.tabs.update(receiptTabId, { url: record.url });
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
  let lastError = '';
  while (Date.now() < deadline) {
    if (cancelRequested) throw new Error('Cancelled');
    await pause(850);
    try {
      const answer = await chrome.scripting.executeScript({
        target: { tabId: receiptTabId },
        func: readRenderedReceipt,
        args: [record.number]
      });
      if (answer?.[0]?.result) return answer[0].result;
    } catch (e) { lastError = String(e.message || e); }
  }
  throw new Error(`Receipt did not render within 65 seconds${lastError ? ` (${lastError})` : ''}`);
}

function blobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to encode HTML for download.'));
    reader.readAsDataURL(blob);
  });
}

async function saveHtml(record, html, folder, groupingEnabled, groupingField) {
  // A data URL avoids blob-URL ownership issues between tab/extension contexts.
  const url = await blobAsDataUrl(new Blob([html], {type: 'text/html;charset=utf-8'}));
  const id = await chrome.downloads.download({
    url,
    filename: `${folder}/${groupingEnabled ? `${categoryFolderName(record, groupingField)}/` : ''}${record.filename}`,
    conflictAction: 'overwrite',
    saveAs: false
  });
  if (typeof id !== 'number') throw new Error('Chrome did not accept download.');
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const results = await chrome.downloads.search({ id });
    const download = results[0];
    if (download?.state === 'complete') return;
    if (download?.state === 'interrupted') throw new Error(`Download interrupted: ${download.error || 'unknown reason'}`);
    await pause(350);
  }
  throw new Error('Download did not finish within 30 seconds.');
}

async function run(limit) {
  if (running || receipts.length === 0) return;
  try { await persistSettings(); }
  catch { return; }
  refreshFilterCount();
  if (filterError || matchingReceipts().length === 0) {
    status(filterError || 'No orders match the selected filters.');
    return;
  }
  // Require the selected field to be available rather than silently sorting
  // every purchase into a misleading Unspecified folder.
  if (groupEnabled) {
    const available = receipts.some(r => {
      const raw = r.fields?.[groupField] || (groupField === 'po' ? r.poName : groupField === 'origin' ? r.origin : '');
      return raw && !/^(add\s+po\s*\/\s*job\s+name)$/i.test(raw.trim());
    });
    if (!available) {
      status(`No ${GROUP_LABELS[groupField]} values found. Enable that column in Home Depot Table Settings and click Scan orders.`);
      return;
    }
  }
  // Freeze settings for the entire batch to avoid mid-download destination changes.
  const batchFolder = downloadFolder;
  const batchGroupEnabled = groupEnabled;
  const batchGroupField = groupField;
  running = true;
  cancelRequested = false;
  setButtons();
  $('folder').disabled = true;
  $('groupEnabled').disabled = true;
  document.querySelectorAll('[data-filter-enabled], [data-filter-text]').forEach(el => el.disabled = true);
  document.querySelectorAll('input[name="groupField"]').forEach(el => el.disabled = true);
  const items = matchingReceipts().slice(0, limit);
  let success = 0, failures = 0, completed = 0;
  $('log').replaceChildren();
  $('progress').max = items.length;
  $('progress').value = 0;
  $('counter').textContent = `0 / ${items.length}`;
  $('ok').textContent = '0 saved';
  $('failed').textContent = '0 failed';
  try {
    // Separate inactive tab; keep user's Purchase History tab intact.
    const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
    receiptTabId = tab.id;
    for (const item of items) {
      if (cancelRequested) break;
      $('current').textContent = item.filename;
      status(`Loading receipt ${completed + 1} of ${items.length}…`);
      try {
        const html = await captureReceipt(item);
        status(`Saving receipt ${completed + 1} of ${items.length}…`);
        await saveHtml(item, html, batchFolder, batchGroupEnabled, batchGroupField);
        success++;
        log(`Saved: ${batchFolder}/${batchGroupEnabled ? `${categoryFolderName(item, batchGroupField)}/` : ''}${item.filename}`);
      } catch (e) {
        if (cancelRequested) break;
        failures++;
        log(`Failed: ${item.filename} — ${e.message || e}`, true);
      }
      completed++;
      $('progress').value = completed;
      $('counter').textContent = `${completed} / ${items.length}`;
      $('ok').textContent = `${success} saved`;
      $('failed').textContent = `${failures} failed`;
      await chrome.storage.local.set({ lastSummary: { success, failures, completed, total: items.length, timestamp: Date.now() } });
      if (!cancelRequested && completed < items.length) await pause(DELAY_MS);
    }
    status(cancelRequested ? `Cancelled: ${success} saved, ${failures} failed.` : `Finished: ${success} saved, ${failures} failed.`);
  } catch (e) {
    status(`Stopped: ${e.message || e}`);
    log(`Stopped: ${e.message || e}`, true);
  } finally {
    const id = receiptTabId;
    receiptTabId = null;
    if (id !== null) { try { await chrome.tabs.remove(id); } catch {} }
    $('current').textContent = '';
    running = false;
    $('folder').disabled = false;
    $('groupEnabled').disabled = false;
    document.querySelectorAll('[data-filter-enabled], [data-filter-text]').forEach(el => el.disabled = false);
    document.querySelectorAll('input[name="groupField"]').forEach(el => el.disabled = false);
    setButtons();
  }
}

$('filterOptionsToggle').addEventListener('click', async () => {
  const expanded = $('filterOptionsToggle').getAttribute('aria-expanded') !== 'true';
  updateFilterOptions(expanded);
  try { await chrome.storage.local.set({ filterOptionsExpanded: expanded }); }
  catch (error) { status(`Could not save panel preference: ${error.message || error}`); }
});
document.querySelectorAll('[data-filter-enabled]').forEach(el => el.addEventListener('change', () => saveFilters().catch(e => status(`Could not save filters: ${e.message || e}`))));
document.querySelectorAll('[data-filter-text]').forEach(el => el.addEventListener('input', () => saveFilters().catch(e => status(`Could not save filters: ${e.message || e}`))));
$('saveOptionsToggle').addEventListener('click', async () => {
  const expanded = $('saveOptionsToggle').getAttribute('aria-expanded') !== 'true';
  updateSaveOptions(expanded);
  try { await chrome.storage.local.set({ saveOptionsExpanded: expanded }); }
  catch (error) { status(`Could not save panel preference: ${error.message || error}`); }
});
$('folder').addEventListener('change', () => persistSettings().catch(() => {}));
$('groupEnabled').addEventListener('change', () => { updateGroupControls(); persistSettings().catch(() => {}); });
document.querySelectorAll('input[name="groupField"]').forEach(el => el.addEventListener('change', () => persistSettings().catch(() => {}))); 
$('scan').addEventListener('click', () => scan(true));
$('test').addEventListener('click', () => run(2));
$('all').addEventListener('click', () => run(matchingReceipts().length));
$('cancel').addEventListener('click', () => { cancelRequested = true; status('Cancellation requested…'); });
restoreSettings().then(scan).catch(e => { status(`Could not load settings: ${e.message || e}`); scan(); });

$('detailsButton').addEventListener('click', () => $('detailsDialog').showModal());
$('detailsClose').addEventListener('click', () => $('detailsDialog').close());
$('detailsDialog').addEventListener('click', event => {
  if (event.target === $('detailsDialog')) $('detailsDialog').close();
});

$('instructionsButton').addEventListener('click', () => $('instructionsDialog').showModal());
$('instructionsClose').addEventListener('click', () => $('instructionsDialog').close());
$('instructionsDialog').addEventListener('click', event => {
  if (event.target === $('instructionsDialog')) $('instructionsDialog').close();
});

$('missingHistoryClose').addEventListener('click', () => $('missingHistoryDialog').close());
$('missingHistoryFullInstructions').addEventListener('click', () => {
  $('missingHistoryDialog').close();
  $('instructionsDialog').showModal();
});
$('missingHistoryDialog').addEventListener('click', event => {
  if (event.target === $('missingHistoryDialog')) $('missingHistoryDialog').close();
});

$('compatibilityDate').addEventListener('click', () => $('compatibilityDialog').showModal());
$('compatibilityClose').addEventListener('click', () => $('compatibilityDialog').close());
$('compatibilityDialog').addEventListener('click', event => {
  if (event.target === $('compatibilityDialog')) $('compatibilityDialog').close();
});
