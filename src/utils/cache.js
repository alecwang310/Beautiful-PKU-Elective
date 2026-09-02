// ---- cross-page cache ----
// Search and filtering only see the rows the server sent. The other pages are
// read once in the background (same-origin, so the session cookie rides
// along), parsed, and their rows adopted into this grid -- hidden until a
// search or filter matches them.
//
// One page per request, walked in order, and every one of them goes through
// the gate in utils/net.js: one request at a time, over a second apart,
// dropped when the user navigates away, and stopped altogether the moment the
// site answers with its 系统提示 page. The reads are what the anti-bot
// machinery is there for -- a burst of them right after a page load is what
// was getting the session thrown out.

import { CACHE_STORE_KEY, LAST_VIEW_KEY, ALL_ROWS } from '../config.js';
import { state } from '../state.js';
import { parseInfoCell, dropLegacyRowStyling, captureRowValues } from './table.js';
import { gatedFetch, isBlocked } from './net.js';

const PAGE_CACHE = { pages: [], done: 0, total: 0, rows: [], blocked: false };

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

// ---- when the cache is (re)built ----
// The stored cache is keyed by the list it was read from, so walking between
// the server pages of one list reuses it and nothing is re-fetched. Leaving
// that list is different: while the user was on 选课结果 or 补退选 a class can
// fill up, and the 预选 they just made is not in the cached pages at all. So
// every page load records which list it is, and a load that finds a DIFFERENT
// list recorded -- i.e. the user has been elsewhere and come back -- throws
// the stored cache away, which makes buildPageCache fetch every page again.
export function dropPageCacheOnReentry() {
  const now = cacheViewKey();
  let last = null;
  try { last = sessionStorage.getItem(LAST_VIEW_KEY); } catch (e) {}
  if (last !== null && last !== now) {
    try { sessionStorage.removeItem(CACHE_STORE_KEY); } catch (e) {}
  }
  try { sessionStorage.setItem(LAST_VIEW_KEY, now); } catch (e) {}
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
  PAGE_CACHE.blocked = false;

  // the session is already in trouble: ask for nothing, and say so
  if (isBlocked()) return stopCache(opts, cur, onProgress);
  onProgress(PAGE_CACHE);

  const store = {};
  for (let i = 0; i < opts.length; i++) {
    try {
      // The gate paces this: one request at a time, well over a second apart,
      // and longer still after a page load. No sleeping here.
      const { text } = await gatedFetch(pageUrl(opts, i));
      const doc = new DOMParser().parseFromString(text, 'text/html');
      store[i] = readPageRows(doc, grid);
      if (i !== cur) adoptPage(grid, doc, i);
      PAGE_CACHE.pages[i] = true;
    } catch (e) {
      // A refusal is about the session, not about this page: the ones after it
      // would be refused too, and asking anyway is what a script that has
      // stopped noticing would do.
      if (e.blocked) return stopCache(opts, cur, onProgress);
      console.warn('[Beautiful PKU Elective] page', i + 1, 'not cached:', e.message);
      PAGE_CACHE.pages[i] = 'error';
    }
    PAGE_CACHE.done++;
    onProgress(PAGE_CACHE);
  }
  persistPageCache(opts.length, store);
  return true;
}

// Give up on the rest of the list: every page but the one on screen is marked
// as unread, so the bar shows what happened rather than filling in silence.
function stopCache(opts, cur, onProgress) {
  PAGE_CACHE.blocked = true;
  PAGE_CACHE.pages = opts.map((_, i) => (i === cur ? true : 'error'));
  onProgress(PAGE_CACHE);
  return false;
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
// wrap cells, add the fold gutter, and merge the same columns into a
// scrolling pane.
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

  // 2. the direct 预选/删除 link and its 意愿值 input carry over as they are

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
  // more than one page to fold together, or there is nothing to do
  const total = (document.body.textContent.match(/Page\s+\d+\s+of\s+(\d+)/) || [])[1];
  if (!total || Number(total) < 2) return false;

  // The grid's name -- the "grid" half of "grid;20" -- is what netui_pagesize
  // has to be addressed to. The site's own pager links carry netui_row but
  // NOT netui_pagesize, so the name is read from a netui_row value instead:
  // the 跳转到 <select> when it is still here, otherwise a pager link.
  const sel = document.querySelector('select[name="netui_row"]');
  const link = document.querySelector('a[href*="netui_row"]');
  const sample = (sel && sel.options.length && sel.options[0].value)
    || (link && new URL(link.href, location.href).searchParams.get('netui_row'));
  const gridName = sample && sample.split(';')[0];
  if (!gridName) return false;

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
