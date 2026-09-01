// ---- cross-page cache ----
// Search and filtering only see the rows the server sent. The other pages are
// fetched once in the background (same-origin, so the session cookie rides
// along), parsed, and their rows adopted into this grid -- hidden until a
// search or filter matches them.
//
// Their 预选 link cannot be reused: it carries index=N, the row's position in
// the server's CURRENT page, and every row on a page shares one eid. Clicking
// a cached row's link would act on whatever occupies that index here, so the
// action cell is replaced with a link to the page the row lives on.

import { CACHE_STORE_KEY, ALL_ROWS } from '../config.js';
import { state } from '../state.js';
import { parseInfoCell, dropLegacyRowStyling, captureRowValues } from './table.js';

const PAGE_CACHE = { pages: [], done: 0, total: 0, rows: [] };

// buildPager() removes the site's <select name="netui_row"> (and its form)
// when it replaces the pager with the styled jump select, but the cross-page
// cache still needs those option values to rebuild each page's URL. Snapshot
// them first so pagerPages() keeps working after the select is gone.
let PAGER_SNAPSHOT = null;

export function snapshotPager() {
  const sel = document.querySelector('select[name="netui_row"]');
  if (!sel || sel.options.length < 2) return;
  PAGER_SNAPSHOT = {
    opts: [...sel.options],
    cur: Math.max(0, sel.selectedIndex),
  };
}

export function pagerPages() {
  return PAGER_SNAPSHOT;
}

function pageUrl(opts, i) {
  const url = new URL(location.href);
  const value = opts[i].value;
  const grid = value.split(';')[0];
  url.searchParams.set('netui_row', value);
  const size = new URLSearchParams(location.search).get('netui_pagesize');
  if (size) {
    url.searchParams.set('netui_pagesize', size);
  } else if (opts.length > 1) {
    const step = Math.abs(parseInt(opts[1].value.split(';')[1], 10)
                        - parseInt(opts[0].value.split(';')[1], 10));
    if (step > 0) url.searchParams.set('netui_pagesize', grid + ';' + step);
  }
  return url.toString();
}

// The list the cache belongs to: the page URL without the paging offset, so
// every page of the same list reads as one view.
function cacheViewKey() {
  const url = new URL(location.href);
  url.searchParams.delete('netui_row');
  return url.pathname + url.search;
}

function persistPageCache(total, pages) {
  try {
    sessionStorage.setItem(CACHE_STORE_KEY, JSON.stringify({
      view: cacheViewKey(), total, pages,
    }));
  } catch (e) {}
}

// Re-adopts the stored rows for every page except the one now on screen
// (whose native rows are already in the grid). Returns true when a matching
// cache was found, so the caller skips the fetch pass entirely.
function restorePageCache(grid, cur) {
  let stored;
  try { stored = JSON.parse(sessionStorage.getItem(CACHE_STORE_KEY) || 'null'); }
  catch (e) { return false; }
  if (!stored || stored.view !== cacheViewKey()) return false;

  const model = state.gridModel.get(grid);
  if (!model) return false;
  const body = model.rows.length ? model.rows[0].tr.parentNode : grid.tBodies[0];
  if (!body) return false;

  Object.entries(stored.pages || {}).forEach(([i, htmls]) => {
    if (Number(i) === cur) return;
    (htmls || []).forEach((html) => {
      const tmp = document.createElement('tbody');
      tmp.innerHTML = html;
      const tr = tmp.firstElementChild;
      if (!tr) return;
      const rec = adoptForeignRow(tr, model, Number(i));
      if (rec) {
        body.appendChild(tr);
        model.rows.push(rec);
        PAGE_CACHE.rows.push(rec);
      }
    });
  });
  return true;
}

// Fetches every page and reports progress.
export async function buildPageCache(grid, onProgress) {
  const info = pagerPages();
  if (!info) return false;
  const { opts, cur } = info;

  // a cache built earlier this session for this same list: reuse it
  if (restorePageCache(grid, cur)) {
    PAGE_CACHE.total = opts.length;
    PAGE_CACHE.done = opts.length;
    PAGE_CACHE.pages = opts.map(() => true);
    onProgress(PAGE_CACHE);
    return true;
  }

  PAGE_CACHE.total = opts.length;
  PAGE_CACHE.done = 1;                 // the page we are on is already here
  PAGE_CACHE.pages = opts.map((_, i) => i === cur);
  onProgress(PAGE_CACHE);

  const store = {};
  for (let i = 0; i < opts.length; i++) {
    // human-ish pacing with a little jitter, so a burst of page fetches does
    // not read as a scraper
    await new Promise((r) => setTimeout(r, 300 + (Math.random() * 100 - 50)));
    try {
      const res = await fetch(pageUrl(opts, i), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      store[i] = readPageRows(doc, grid);
      if (i !== cur) adoptPage(grid, doc, i);
      PAGE_CACHE.pages[i] = true;
    } catch (e) {
      console.warn('[Beautiful PKU Elective] page', i + 1, 'not cached:', e.message);
      PAGE_CACHE.pages[i] = 'error';
    }
    PAGE_CACHE.done++;
    onProgress(PAGE_CACHE);
  }
  persistPageCache(opts.length, store);
  return true;
}

// Raw HTML of a fetched page's data rows, for parking in the cross-page cache.
function readPageRows(doc, grid) {
  const model = state.gridModel.get(grid);
  const src = doc.querySelector('table.datagrid');
  if (!model || !src) return [];
  return [...src.rows]
    .filter((tr) => !tr.querySelector('th') && tr.children.length >= model.shape.colCount)
    .map((tr) => tr.outerHTML);
}

// Pulls the data rows out of a fetched page and rebuilds each one to match
// this grid's structure, then appends it hidden.
function adoptPage(grid, doc, pageIndex) {
  const model = state.gridModel.get(grid);
  if (!model) return;
  const src = doc.querySelector('table.datagrid');
  if (!src) return;

  const rows = [...src.rows].filter((tr) =>
    !tr.querySelector('th') && tr.children.length >= model.shape.colCount);

  const body = model.rows.length ? model.rows[0].tr.parentNode : grid.tBodies[0];
  if (!body) return;

  rows.forEach((srcRow) => {
    const tr = document.importNode(srcRow, true);
    const rec = adoptForeignRow(tr, model, pageIndex);
    if (rec) {
      body.appendChild(tr);
      model.rows.push(rec);
      PAGE_CACHE.rows.push(rec);
    }
  });
}

// Rebuilds one fetched row so it matches the live grid: reorder 上课/考试信息,
// neutralise the page-bound action link, wrap cells, add the fold gutter, and
// merge the same columns into a scrolling pane.
function adoptForeignRow(tr, model, pageIndex) {
  const { iInfo, paneFirst, paneLast, paneWidths, paneOrder } = model.shape;

  dropLegacyRowStyling(tr);
  tr.classList.add('pku-row', 'pku-foreign');
  tr.dataset.pkuPage = String(pageIndex + 1);

  // 1. same 上课/考试信息 (with exam appended) + 备注 split the native rows got
  if (iInfo >= 0 && tr.children[iInfo]) {
    const src = tr.children[iInfo];
    const parts = parseInfoCell(src);
    src.innerHTML = parts.time;
    const n = document.createElement('td');
    n.className = 'datagrid';
    n.textContent = parts.note;
    tr.insertBefore(n, src.nextSibling);
  }

  // 2. keep the direct 预选/删除 link and its 意愿值 input on foreign rows
  //    (experiment: the action is page-bound, but leave it in place to see
  //    what happens instead of swapping in a "第N页" jump link)

  // 3. capture searchable/filterable values while the indices still match the
  //    original header order (the split above kept everything left of iInfo,
  //    and inserted its two new columns after it -- same as the native rows)
  const rec = { tr, i: model.rows.length, foreign: true, page: pageIndex + 1 };
  captureRowValues(model.shape.labels, rec);

  // 4. wrap each cell, add the fold gutter, then merge the pane
  [...tr.children].forEach((td) => {
    if (td.querySelector('.pku-cell')) return;
    const box = document.createElement('span');
    box.className = 'pku-cell';
    while (td.firstChild) box.appendChild(td.firstChild);
    td.appendChild(box);
  });

  const gutter = document.createElement('td');
  gutter.className = 'pku-foldcell' + (model.fold ? '' : ' pku-foldcell--empty');
  tr.insertBefore(gutter, tr.firstChild);

  if (paneFirst >= 0 && paneLast >= paneFirst) {
    const group = [...tr.children].slice(paneFirst, paneLast + 1);
    if (group.length) {
      group.forEach((c) => { c.style.removeProperty('width'); c.removeAttribute('width'); });
      const host = document.createElement('td');
      host.className = 'pku-scrollcell';
      const pane = document.createElement('div');
      pane.className = 'pku-hscroll';
      const inner = document.createElement('table');
      inner.className = 'pku-inner';
      const cg = document.createElement('colgroup');
      paneWidths.forEach((w) => {
        const col = document.createElement('col');
        col.style.width = w;
        cg.appendChild(col);
      });
      const irow = document.createElement('tr');
      // the native pane columns were reordered by paneOrder; a foreign row
      // arrives in DOM order and must be reshuffled to match, or its cells
      // land under the wrong colgroup widths
      const ordered = (paneOrder && paneOrder.length)
        ? paneOrder.map((k) => group[k])
        : group;
      ordered.forEach((c) => irow.appendChild(c));
      inner.append(cg, irow);
      pane.appendChild(inner);
      host.appendChild(pane);
      tr.insertBefore(host, tr.children[paneFirst] || null);
    }
  }

  const nameCol = model.shape.iName + 1;
  const cell = tr.children[nameCol];
  if (cell && !cell.hasAttribute('colspan')) cell.classList.add('pku-col-name');

  return rec;
}

// ---- show every page on one page ----
// Paging is server-side: netui_pagesize=<grid>;N sets rows per page and the
// grid only ever ships one page of rows. "Page 1 of 4" plus a 20-row page
// means asking for a large pagesize returns them all in one request. This
// redirects once, then leaves the flag so it cannot loop.
export function requestAllRows() {
  const pager = [...document.querySelectorAll('a[href*="netui_pagesize"]')];
  if (!pager.length) return false;

  const total = (document.body.textContent.match(/Page\s+\d+\s+of\s+(\d+)/) || [])[1];
  if (!total || Number(total) < 2) return false;

  const url = new URL(pager[0].href, location.href);
  const size = url.searchParams.get('netui_pagesize');   // e.g. "grid;20"
  if (!size) return false;
  const gridName = size.split(';')[0];

  // already asked for everything -> nothing more to do
  const current = new URL(location.href);
  if (current.searchParams.get('netui_pagesize') === gridName + ';' + ALL_ROWS) {
    return false;
  }

  current.searchParams.set('netui_pagesize', gridName + ';' + ALL_ROWS);
  current.searchParams.set('netui_row', gridName + ';0');
  location.replace(current.toString());
  return true;
}
