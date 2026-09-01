import { PKU_LOGO } from './config.js';
import {
  Root, Title, NavMenu, PageHero, Noticies,
  SectionHeads, Toolbar, CourseQuery, FilterToggle, Cache, Chevron,
  FilterPanel, Footer, Pager, Grid, Warnings, Fold, Timetable,
} from './style.js';

const STYLES = [
  Root, Title, NavMenu, PageHero, Noticies,
  SectionHeads, Toolbar, CourseQuery, FilterToggle, Cache, Chevron,
  FilterPanel, Footer, Pager, Grid, Warnings, Fold, Timetable,
].join('\n');

GM_addStyle(STYLES);

import {
  COL, NOTE_HEAD, findCol, parseInfoCell, headerCells, headText, cellText,
  dropLegacyRowStyling, slotsClash, DEFAULT_CREDIT_LIMIT,
  setLastOpCourse, consumeLastOpCourse, takeNavState, readCreditInfo,
  creditInfoText, reinsertRemainRandom, syncCreditInfo,
  captureRowModel, captureRowValues,
} from './table.js';
import { buildPager, setSearchPager, SEARCH_PAGE_SIZE, pagerState } from './pager.js';

// ---- nav order + active-page detection ----
const NAV = [
  { label: '选课计划', match: (u) => /electivePlan|courseQuery/.test(u) },
  { label: '选课结果', match: (u) => /showResults/.test(u) },
  { label: '预选',     match: (u) => /electiveWork/.test(u) },
  { label: '补退选',   match: (u) => /SupplyCancel/.test(u) },
  { label: '补选',     match: (u) => /SupplyOnly/.test(u) },
  { label: '帮助',     match: (u) => /HelpController/.test(u) },
  { label: '退出',     match: (u) => /logout/.test(u) },
];

function buildHeader() {
  const menu = document.querySelector('#menu');
  if (menu) {
    const orig = menu.closest('table');
    if (orig) orig.style.display = 'none';
  }

  const linkMap = {};
  document.querySelectorAll('#menu a').forEach((a) => {
    linkMap[a.textContent.replace(/\s+/g, '').trim()] = a.getAttribute('href');
  });

  const url = location.pathname + location.search;
  const active = NAV.find((n) => n.match(url)) || null;

  const header = document.createElement('header');
  header.className = 'pku-header';

  // --- title bar ---
  const titlebar = document.createElement('div');
  titlebar.className = 'pku-titlebar';
  const logo = document.createElement('img');
  logo.className = 'pku-logo';
  logo.src = PKU_LOGO;
  logo.alt = '北京大学';
  const title = document.createElement('h1');
  title.className = 'pku-title';
  title.textContent = '学生网上选课系统';
  titlebar.append(logo, title);

  // --- nav bar ---
  const nav = document.createElement('nav');
  nav.className = 'pku-nav';
  NAV.forEach((item) => {
    const href = linkMap[item.label];
    if (!href) return;
    const a = document.createElement('a');
    a.className = 'pku-nav-link' + (active && active.label === item.label ? ' active' : '');
    a.href = href;
    const label = document.createElement('span');
    label.className = 'pku-nav-label';
    label.textContent = item.label;
    a.appendChild(label);
    nav.appendChild(a);
  });

  header.append(titlebar, nav);
  document.body.prepend(header);

  console.log('[Beautiful PKU Elective] header built;', nav.children.length, 'links; active =',
    active ? active.label : 'none');
}

// ---- page hero ----
// The site renders one line like:
//   网上选课 >> 预选： 【xx学院 xxx， <span class=errmsg>选课时间为：…</span>】
// Keep the page name as the title and, per spec, only the 选课时间 field as
// the gray meta line — the name/department and the brackets are dropped.
function buildHero() {
  // Most pages put the breadcrumb in a <p class=pkuportal-remark>, but the
  // course query page uses a <td> with the same class -- and the class is
  // also on unrelated notes, so the breadcrumb is identified by its ">>".
  const remark = [...document.querySelectorAll('.pkuportal-remark')]
    .find((el) => el.textContent.includes('>>'));
  if (!remark) return null;

  const full = remark.textContent.replace(/\s+/g, ' ').trim();
  // page name = last segment of the ">>" breadcrumb, before the colon
  const crumb = full.split('>>').pop() || '';
  const title = crumb.split(/[：:]/)[0].replace(/[【\[].*$/, '').trim();
  if (!title) return null;

  const bracketMatch = full.match(/[【\[][^】\]]*[】\]]/);
  let meta = '';
  if (bracketMatch) {
    meta = bracketMatch[0]
      .replace(/^[【\[]/, '')
      .replace(/[】\]]$/, '')
      .trim();
  }

  const hero = document.createElement('section');
  hero.className = 'pku-hero';

  const head = document.createElement('div');
  head.className = 'pku-hero-head';
  const h2 = document.createElement('h2');
  h2.className = 'pku-hero-title';
  h2.textContent = title;
  head.appendChild(h2);
  if (meta) {
    const m = document.createElement('span');
    m.className = 'pku-hero-meta';
    const i = meta.search(/选课时间/);
    if (i >= 0) {
      m.textContent = meta.slice(0, i);
      const t = document.createElement('span');
      t.className = 'pku-hero-meta-time';
      t.textContent = meta.slice(i);
      m.appendChild(t);
    } else {
      m.textContent = meta;
    }
    head.appendChild(m);
  }

  const rule = document.createElement('div');
  rule.className = 'pku-hero-rule';
  hero.append(head, rule);

  (remark.closest('tr') || remark).remove();
  return hero;
}

// ---- notifications ----
// Each notice is a nested table row whose first cell holds warning.gif,
// error.gif or success.gif. They are merged into one bordered box, red copy
// turned bold black. An error card turns red and appends the operated course;
// a success card turns green with a light-green fill.
function buildNotices() {
  return collectNoticeCards(document);
}

function collectNoticeCards(root, onlyOutcomes = false) {
  const imgs = [...root.querySelectorAll(
    'img[src*="warning.gif"], img[src*="error.gif"], img[src*="success.gif"]')]
    .filter((img) => !onlyOutcomes || /(error|success)\.gif/.test(img.getAttribute('src') || ''));
  const cards = [];
  const outers = new Set();
  const seen = new Set();
  const seenText = new Set();

  imgs.forEach((img) => {
    const row = img.closest('tr');
    if (!row || seen.has(row)) return;
    seen.add(row);
    const src = img.getAttribute('src') || '';
    const isError = /error\.gif/.test(src);
    const isSuccess = /success\.gif/.test(src);

    const cells = [...row.children];
    // content cell = the one without the narrow icon image
    const content = cells.find((td) => !td.querySelector('img'));
    if (!content) return;

    // the site repeats the same notice before each list; keep only the first
    const text = content.textContent.replace(/[\s ]+/g, '').trim();
    if (text && seenText.has(text)) {
      const outer = row.closest('table')?.closest('tr');
      if (outer) outers.add(outer); else row.remove();
      return;
    }
    seenText.add(text);

    const card = document.createElement('section');
    card.className = 'pku-notice'
      + (isError ? ' pku-notice--error' : isSuccess ? ' pku-notice--success' : '');
    [...content.childNodes].forEach((n) => card.appendChild(n.cloneNode(true)));
    // .errmsg is the site's red emphasis -> bold
    card.querySelectorAll('.errmsg, font[color], [style*="color"]').forEach((el) => {
      const b = document.createElement('strong');
      b.innerHTML = el.innerHTML;
      el.replaceWith(b);
    });
    // error: name the course the failed operation was aimed at
    if (isError && LAST_OP_COURSE) {
      const name = document.createElement('span');
      name.className = 'pku-notice-course';
      name.textContent = '（' + LAST_OP_COURSE + '）';
      card.appendChild(name);
    }
    cards.push(card);

    // remove the original row, and the wrapper row of its nested table
    const outer = row.closest('table')?.closest('tr');
    if (outer) outers.add(outer); else row.remove();
  });

  outers.forEach((tr) => tr.remove());
  return cards;
}

// ---- plan action links ----
// The site ships these as attention.jpg + two links in their own row. The
// <a> nodes are returned for reuse as buttons -- MOVED by the caller, not
// cloned, so their hrefs and any handlers stay live -- and the icon row is
// dropped.
function takePlanLinks() {
  const img = document.querySelector('img[src*="attention.jpg"]');
  const row = img && img.closest('tr');
  if (!row) return [];

  const links = [...row.querySelectorAll('a[href]')];
  if (!links.length) return [];

  links.forEach((a) => a.removeAttribute('style'));
  row.remove();          // detaches the row; links already referenced above
  return links;
}

// The site drops a green 注：… line explaining the red clash colour; the
// reskin explains that in the toolbar legend instead, so the line goes.
function removeNoteLine() {
  [...document.querySelectorAll('span.pkuportal-remark, font.pkuportal-remark')]
    .forEach((el) => {
      if (/^注[：:]/.test(el.textContent.replace(/\s+/g, '').trim())) {
        const row = el.closest('tr');
        if (row) row.remove();
      }
    });
}

// ---- filter option values, read from the grid itself ----
// Facet label -> the grid column header it draws its values from.
// (开课学院 is the site's 开课单位 column.)
const FACETS = [
  { label: '课程类别', column: '课程类别' },
  { label: '学分',     column: '学分' },
  { label: '开课学院', column: '开课单位' },
  // 状态 is not a column: 已满/未满 follow from 限数/已选, and conflict is a
  // property of the chosen timetable, so its options are a fixed list.
  { label: '状态', options: ['已满', '未满', '冲突', '不冲突'] },
];

function columnValues(grid) {
  // Scoped to the OUTER table only. querySelectorAll would also return the
  // scrolling pane's nested table -- its rows have their own children, so
  // cells[idx] there lands on unrelated text (e.g. a 备注 string under
  // 课程类别). Rows and headers must come from the same level to line up.
  const outerRows = [...grid.rows].filter((tr) => !tr.closest('table.pku-inner'));
  const headRow = outerRows.find((tr) => tr.querySelector('th'));
  const heads = headRow
    ? [...headRow.children].map((th) => th.textContent.replace(/[\s\u00a0]+/g, '').trim())
    : [];
  const out = {};

  FACETS.forEach(({ column }) => {
    if (!column) return;          // fixed-option facet, nothing to scan
    const idx = heads.indexOf(column);
    if (idx < 0) { out[column] = []; return; }
    const seen = new Set();
    outerRows.forEach((tr) => {
      if (tr === headRow || tr.querySelector('th')) return;
      const cell = tr.children[idx];
      if (!cell) return;
      const v = cell.textContent.replace(/[\s\u00a0]+/g, ' ').trim();
      if (v) seen.add(v);
    });
    out[column] = [...seen].sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      const bothNum = !isNaN(na) && !isNaN(nb) &&
        /^[\d.]+$/.test(a) && /^[\d.]+$/.test(b);
      return bothNum ? na - nb : a.localeCompare(b, 'zh');
    });
  });

  return out;
}

function chevron() {
  const c = document.createElement('span');
  c.className = 'pku-chev';
  return c;
}

// ---- toolbar: search field, plan buttons, filter panel ----
// UI only for now: nothing here filters the table yet.
function buildToolbar(grid) {
  const links = takePlanLinks();

  const bar = document.createElement('div');
  bar.className = 'pku-toolbar';

  // search: label and box share one line, magnifier inside the box
  const srow = document.createElement('div');
  srow.className = 'pku-search-row';
  const label = document.createElement('label');
  label.className = 'pku-search-label';
  label.textContent = '搜索选课计划中的课程';
  label.setAttribute('for', 'pku-course-search');
  const sbox = document.createElement('div');
  sbox.className = 'pku-search-box';
  sbox.innerHTML = '<svg class="pku-search-icon" viewBox="0 0 16 16" ' +
    'fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">' +
    '<circle cx="6.8" cy="6.8" r="4.6"/><path d="M10.4 10.4 14 14"/></svg>';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pku-search-input';
  input.placeholder = '课程名称或ID';
  input.id = 'pku-course-search';
  sbox.appendChild(input);
  srow.append(label, sbox);

  // credit ceiling, on the same line; editable, 25 by default
  const climit = document.createElement('label');
  climit.className = 'pku-climit';
  climit.textContent = '学分上限 ';
  const cnum = document.createElement('input');
  cnum.type = 'number';
  cnum.min = '0';
  cnum.step = '1';
  // credit ceiling, remembered across page changes so a navigation does not
  // silently reset it back to the default
  let savedCredit = null;
  try { savedCredit = localStorage.getItem('pku-credit-limit'); } catch (e) {}
  cnum.value = savedCredit || String(DEFAULT_CREDIT_LIMIT);
  cnum.className = 'pku-climit-input';
  climit.appendChild(cnum);
  const ctally = document.createElement('span');
  ctally.className = 'pku-climit-tally';
  srow.append(climit, ctally);

  bar.appendChild(srow);

  // legend under the search, before the buttons: explains the clash / credit
  // colours. The 50px gap below it comes from .pku-actions-row's padding-top.
  const legend = document.createElement('div');
  legend.className = 'pku-search-legend';
  legend.textContent =
    '红色代表该课程时间与已经预选课程时间冲突，黄色代表时间不冲突但选择后学分将超出学分上限。颜色仅做参考，请以点击预选后的信息提示为准';
  bar.appendChild(legend);

  // buttons + filter toggle, one row
  const row = document.createElement('div');
  row.className = 'pku-actions-row';
  links.forEach((a) => { a.className = 'pku-btn'; row.appendChild(a); });

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'pku-filter-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  const tText = document.createElement('span');
  tText.textContent = '筛选条件';
  const tChev = chevron();
  toggle.append(tText, tChev);
  row.appendChild(toggle);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'pku-reset';
  reset.textContent = '重置筛选';
  row.appendChild(reset);
  bar.appendChild(row);

  // filter panel
  const panel = document.createElement('div');
  panel.className = 'pku-filters';

  const values = grid ? columnValues(grid) : {};
  FACETS.forEach(({ label: name, column, options }) => {
    const opts = options || values[column] || [];
    if (!opts.length) return;

    const facet = document.createElement('div');
    facet.className = 'pku-facet';
    facet.dataset.facetKey = column || name;   // 状态 has no column

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pku-facet-btn';
    btn.setAttribute('aria-expanded', 'false');
    const bText = document.createElement('span');
    bText.textContent = name;
    const bChev = chevron();
    btn.append(bText, bChev);

    const listWrap = document.createElement('div');
    listWrap.className = 'pku-facet-list';
    const list = document.createElement('ul');
    list.className = 'pku-facet-opts';

    opts.forEach((v) => {
      const li = document.createElement('li');
      const opt = document.createElement('label');
      opt.className = 'pku-opt';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = v;
      const dot = document.createElement('span');
      dot.className = 'pku-dot';
      const txt = document.createElement('span');
      txt.className = 'pku-opt-text';
      txt.textContent = v;
      opt.append(cb, dot, txt);
      li.appendChild(opt);
      list.appendChild(li);
    });

    listWrap.appendChild(list);
    facet.append(btn, listWrap);
    panel.appendChild(facet);

    let closeTimer = 0;
    btn.addEventListener('click', () => {
      const open = facet.classList.toggle('pku-facet--open');
      btn.setAttribute('aria-expanded', String(open));
      bChev.classList.toggle('pku-chev--open', open);

      // mark the closing phase so the list collapses fast and keeps its own
      // radius; the flag clears once it is gone
      clearTimeout(closeTimer);
      if (open) {
        facet.classList.remove('pku-facet--closing');
      } else {
        facet.classList.add('pku-facet--closing');
        closeTimer = setTimeout(() => facet.classList.remove('pku-facet--closing'), 120);
      }
    });
  });

  bar.appendChild(panel);   // its own line, below the button row

  let doneTimer = 0;
  toggle.addEventListener('click', () => {
    const open = !panel.classList.contains('pku-filters--open');
    panel.classList.toggle('pku-filters--open', open);
    toggle.setAttribute('aria-expanded', String(open));
    tChev.classList.toggle('pku-chev--open', open);

    // the panel clips itself while animating; drop the clip once open so the
    // facet dropdowns can overhang, and restore it before closing
    clearTimeout(doneTimer);
    bar.classList.toggle('pku-toolbar--above', open);
    if (open) {
      doneTimer = setTimeout(() => panel.classList.add('pku-filters--done'), 240);
    } else {
      panel.classList.remove('pku-filters--done');
      // collapse the facets too, so it reopens in a clean state
      panel.querySelectorAll('.pku-facet--open').forEach((f) => {
        f.classList.remove('pku-facet--open');
        f.querySelector('.pku-facet-btn')?.setAttribute('aria-expanded', 'false');
        f.querySelector('.pku-chev')?.classList.remove('pku-chev--open');
      });
    }
  });

  // ---- cross-page cache + progress ----
  const cache = document.createElement('div');
  cache.className = 'pku-cache';
  const track = document.createElement('div');
  track.className = 'pku-cache-track';
  const cacheLabel = document.createElement('span');
  cacheLabel.className = 'pku-cache-status';
  cacheLabel.textContent = '正在建立缓存';
  cache.append(track, cacheLabel);
  bar.appendChild(cache);

  // ---- live search and filtering ----
  const count = document.createElement('span');
  count.className = 'pku-result-count';
  row.appendChild(count);

  // gathers the current UI state into the shape rowMatches expects
  const readState = () => {
    const facets = {};
    panel.querySelectorAll('.pku-facet').forEach((f) => {
      const key = f.dataset.facetKey;
      if (!key) return;
      facets[key] = [...f.querySelectorAll('input[type="checkbox"]')]
        .filter((cb) => cb.checked).map((cb) => cb.value);
    });
    const lim = parseFloat(cnum.value);
    return {
      q: input.value.trim().toLowerCase(),
      facets,
      creditLimit: isNaN(lim) || lim <= 0 ? 0 : lim,
    };
  };

  const run = () => {
    const state = readState();
    const matching = applyFilter(grid, state);
    const total = (GRID_MODEL.get(grid) || { rows: [] }).rows.length;
    const filtering = state.q ||
      Object.values(state.facets).some((v) => v.length);
    count.textContent = filtering ? matching + ' / ' + total : '';

    // repurpose the built-in pager: server pages when the search is empty,
    // client-side 20-per-page search pages otherwise
    setSearchPager(filtering, matching);

    // running tally of what is already committed against the ceiling
    const committed = takenCredits();
    ctally.textContent = '已选 ' + fmtCredit(committed) +
      (state.creditLimit ? ' / ' + fmtCredit(state.creditLimit) : '');
    ctally.classList.toggle('pku-climit-tally--over',
      !!state.creditLimit && committed > state.creditLimit);
  };

  // re-run on demand (used once every grid has been modelled)
  bar.addEventListener('pku-refilter', run);

  // Build the cache of the other pages so search covers all of them. Rows
  // arrive progressively and the current filter is re-applied as they land.
  const paint = (st) => {
    if (!track.children.length) {
      for (let i = 0; i < st.total; i++) {
        const seg = document.createElement('span');
        seg.className = 'pku-cache-seg';
        track.appendChild(seg);
      }
    }
    st.pages.forEach((ok, i) => {
      const seg = track.children[i];
      if (!seg) return;
      seg.classList.toggle('pku-cache-seg--on', ok === true);
      seg.classList.toggle('pku-cache-seg--err', ok === 'error');
    });
    const loaded = st.pages.filter((x) => x === true).length;
    const done = loaded >= st.total;
    cacheLabel.textContent = done ? '缓存建立成功' : '正在建立缓存';
    cache.classList.toggle('pku-cache--done', done);
    run();
  };

  if (pagerPages()) {
    buildPageCache(grid, paint);
  } else {
    cache.remove();   // single page: nothing to cache
  }

  // typing settles for 500ms before the table is touched
  let typeTimer = 0;
  input.addEventListener('input', () => {
    clearPin();
    clearTimeout(typeTimer);
    pagerState.searchPage = 0;   // a new search starts back on the first page
    typeTimer = setTimeout(run, 500);
  });
  // Enter applies at once rather than waiting out the delay
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); clearPin(); clearTimeout(typeTimer); pagerState.searchPage = 0; run(); }
  });
  // changing the ceiling re-marks immediately and persists the new value
  cnum.addEventListener('input', () => {
    try { localStorage.setItem('pku-credit-limit', cnum.value); } catch (e) {}
    run();
  });
  // ticking a box applies immediately
  panel.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') { clearPin(); pagerState.searchPage = 0; run(); }
  });

  // clicking 重置筛选 clears every choice and the search box
  reset.addEventListener('click', () => {
    clearPin();
    input.value = '';
    panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
    });
    clearTimeout(typeTimer);
    run();
  });

  const rule = document.createElement('div');
  rule.className = 'pku-toolbar-rule';
  bar.appendChild(rule);

  return bar;
}

// ---- show every page on one page ----
// Paging is server-side: netui_pagesize=<grid>;N sets rows per page and the
// grid only ever ships one page of rows. "Page 1 of 4" plus a 20-row page
// means asking for a large pagesize returns them all in one request. This
// redirects once, then leaves the flag so it cannot loop.
const ALL_ROWS = 500;
const MERGE_PAGES = false;   // leave the site's paging alone for now
function requestAllRows() {
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

// ---- footer ----
// The site ends with a dark red 版权所有 strip in its own table; swap it for a
// full-width light blue sliver of similar height.
const FOOTER_MAIL = 'sermis@pku.edu.cn';
function buildFooter() {
  const cells = [...document.querySelectorAll('td')].filter((td) =>
    td.textContent.includes('版权所有'));
  if (!cells.length) return 0;

  const bar = document.createElement('div');
  bar.className = 'pku-footer';
  bar.append(document.createTextNode('版权所有\u00a9北京大学计算中心\u2003'));
  const mail = document.createElement('a');
  mail.href = 'mailto:' + FOOTER_MAIL;
  mail.textContent = FOOTER_MAIL;
  bar.appendChild(mail);

  const host = cells[0].closest('table') || cells[0];
  host.parentNode.insertBefore(bar, host);
  // drop the original strip (and its wrapper table, if that is all it held)
  cells.forEach((td) => {
    const t = td.closest('table');
    (t && t !== host ? t : td).remove();
  });
  if (host.isConnected) host.remove();
  return 1;
}

const GRID_MODEL = new WeakMap();

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
const PAGE_CACHE = { pages: [], done: 0, total: 0, rows: [] };

// buildPager() removes the site's <select name="netui_row"> (and its form)
// when it replaces the pager with the styled jump select, but the cross-page
// cache still needs those option values to rebuild each page's URL. Snapshot
// them first so pagerPages() keeps working after the select is gone.
let PAGER_SNAPSHOT = null;

function snapshotPager() {
  const sel = document.querySelector('select[name="netui_row"]');
  if (!sel || sel.options.length < 2) return;
  PAGER_SNAPSHOT = {
    opts: [...sel.options],
    cur: Math.max(0, sel.selectedIndex),
  };
}

function pagerPages() {
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

// The built cache is parked in sessionStorage so switching pages (a full
// reload that just changes netui_row) reuses it instead of re-fetching the
// whole list again.
const CACHE_STORE_KEY = 'pku-elective-page-cache';

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

  const model = GRID_MODEL.get(grid);
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
async function buildPageCache(grid, onProgress) {
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
  const model = GRID_MODEL.get(grid);
  const src = doc.querySelector('table.datagrid');
  if (!model || !src) return [];
  return [...src.rows]
    .filter((tr) => !tr.querySelector('th') && tr.children.length >= model.shape.colCount)
    .map((tr) => tr.outerHTML);
}

// Pulls the data rows out of a fetched page and rebuilds each one to match
// this grid's structure, then appends it hidden.
function adoptPage(grid, doc, pageIndex) {
  const model = GRID_MODEL.get(grid);
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
  const rec = { tr, i: model.rows.length, nat: model.rows.length, foreign: true, page: pageIndex + 1 };
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

// ---- filtering ----
// Reads the way people expect: within one facet the ticked options are OR'd
// (学分 2 or 4), across facets they are AND'd (学分 2 AND 数学科学学院), and a
// facet with nothing ticked places no constraint at all.
function rowMatches(r, state, taken) {
  if (state.q) {
    const terms = state.q.split(/\s+/).filter(Boolean);
    if (!terms.every((t) => r.q.includes(t))) return false;
  }

  for (const [key, chosen] of Object.entries(state.facets)) {
    if (!chosen.length) continue;                 // no constraint
    if (key === '状态') {
      // 状态 is the one list holding two independent questions, so the plain
      // OR-within-a-facet rule reads 未满 + 不冲突 as "either", which is
      // LOOSER than ticking one alone -- never what someone ticking both
      // means. Each question ORs its own options (已满 or 未满); the
      // questions themselves AND, exactly as separate facets would.
      for (const group of STATUS_GROUPS) {
        const picked = group.filter((opt) => chosen.includes(opt));
        if (!picked.length) continue;             // that question is unasked
        if (!picked.some((opt) => statusMatches(r, opt, taken))) return false;
      }
    } else if (!chosen.includes(r.facets[key])) {
      return false;
    }
  }
  return true;
}

// The two questions 状态 answers: how full the class is, and whether it
// clashes with what is already taken. Options within one group are
// alternatives; options from different groups are separate constraints.
const STATUS_GROUPS = [['已满', '未满'], ['冲突', '不冲突']];

function statusMatches(r, opt, taken) {
  switch (opt) {
    case '已满': return !!r.cap && r.cap.taken >= r.cap.limit;
    case '未满': return !!r.cap && r.cap.taken < r.cap.limit;
    case '冲突': return clashesWithTaken(r, taken);
    case '不冲突': return !clashesWithTaken(r, taken);
    default: return true;
  }
}

const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

function fmtCredit(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Names the first colliding meeting, e.g. "每周周三1~2节". Returns '' when the
// course is free of clashes.
function describeClash(r, taken) {
  if (!taken.length || !r.slots.length) return '';
  for (const a of r.slots) {
    for (const b of taken) {
      if (slotsClash(a, b)) {
        const day = DAY_NAMES[a.day] || '?';
        return a.parity + '周' + day + a.from + '~' + a.to + '节';
      }
    }
  }
  return '';
}

// A course conflicts if any of its meetings overlaps a meeting of a course
// already in the 已选列表.
function clashesWithTaken(r, taken) {
  if (!taken.length || !r.slots.length) return false;
  return r.slots.some((a) => taken.some((b) => slotsClash(a, b)));
}

// Credits already committed: summed from the 已选列表 grid.
function takenCredits() {
  const grids = [...document.querySelectorAll('table.datagrid')];
  let sum = 0;
  grids.slice(1).forEach((g) => {
    const m = GRID_MODEL.get(g);
    if (m) m.rows.forEach((r) => { if (!r.foreign) sum += r.credit || 0; });
  });
  return sum;
}

// Slots of every already-selected course, gathered from the second grid.
function takenSlots() {
  const grids = [...document.querySelectorAll('table.datagrid')];
  const out = [];
  grids.slice(1).forEach((g) => {
    const m = GRID_MODEL.get(g);
    if (m) m.rows.forEach((r) => out.push(...r.slots));
  });
  return out;
}

// Applies the current state to a grid: hides rows that do not match, then
// rebuilds the name groups over what is left so zebra striping, the thick
// rules and the fold controls all describe the visible table.

function applyFilter(grid, state) {
  const model = GRID_MODEL.get(grid);
  if (!model) return 0;
  const taken = takenSlots();
  const committed = takenCredits();
  const limit = state.creditLimit;

  const filtering = state.q ||
    Object.values(state.facets).some((v) => v.length);

  // Decide match/no-match first (and the clash/credit marking); visibility is
  // applied in the pagination pass below.
  const matching = [];
  model.rows.forEach((r) => {
    // With no search or facet chosen, show only the rows the server sent for
    // this page -- the cached rows from other pages stay hidden until a
    // search/filter actually reaches across pages.
    let ok = rowMatches(r, state, taken);
    if (!filtering && r.foreign) ok = false;
    if (ok) matching.push(r);

    // Marking only -- nothing is ever blocked. The server enforces the real
    // rules; this is a heads-up before the user clicks.
    const clash = describeClash(r, taken);
    r.clash = clash;
    r.tr.classList.toggle('pku-clash', !!clash);

    const over = !!limit && r.credit > 0 && committed + r.credit > limit;
    r.overCredit = over;
    r.tr.classList.toggle('pku-over-credit', over && !clash);

    const why = [];
    if (clash) why.push('时间冲突：' + clash);
    if (over) {
      why.push('学分超限：已选 ' + fmtCredit(committed) + ' + 本课 ' +
        fmtCredit(r.credit) + ' > ' + fmtCredit(limit));
    }
    if (why.length) r.tr.title = why.join('\n');
    else r.tr.removeAttribute('title');
  });

  // client-side pagination over the matching rows, in their (already
  // name-sorted) order: show only the 20 on the current search page.
  const pageStart = pagerState.searchPage * SEARCH_PAGE_SIZE;
  const onPage = new Set(matching.slice(pageStart, pageStart + SEARCH_PAGE_SIZE));
  model.rows.forEach((r) => {
    const visible = onPage.has(r);
    r.hiddenByFilter = !visible;
    r.tr.classList.toggle('pku-filtered-out', !visible);
  });

  // fold state is meaningless for rows that are filtered away; reset it so a
  // collapsed group does not keep hiding rows the filter just revealed
  model.rows.forEach((r) => {
    if (r.hiddenByFilter) return;
    clearTimeout(r._foldTimer);
    r._foldTimer = null;
    clearFold(r.tr);
    r.tr.classList.remove('pku-hidden');
  });

  restripe(model);
  return matching.length;
}

// Zebra and group rules are recomputed over the VISIBLE rows only, so the
// alternation never breaks where a filtered row used to be.
function restripe(model) {
  const visible = model.rows.filter((r) => !r.hiddenByFilter);
  let n = 0, prevName = null;
  visible.forEach((r) => {
    r.tr.classList.remove('pku-r-even', 'pku-r-odd', 'pku-group-start');
    r.tr.classList.add(n % 2 ? 'pku-r-odd' : 'pku-r-even');
    if (prevName !== null && r.name !== prevName) r.tr.classList.add('pku-group-start');
    prevName = r.name;
    n++;
  });

  // re-hang the fold controls over the visible groups
  if (!model.fold) return;
  model.groups.forEach((g) => {
    const vis = [g.leader, ...g.rows].filter((r) => !r.hiddenByFilter);
    const btn = g.button;
    if (!btn) return;
    // the control only makes sense with two or more visible rows
    btn.el.style.visibility = vis.length > 1 ? '' : 'hidden';
    // if the leader itself is filtered out, the group cannot be folded
    g.visible = vis;
  });
}

// Width Scheduling is here
function enhanceGrid(grid, opts) {
  const { fold = false, groupRules = false } = opts || {};
  const head = headerCells(grid);
  console.log("enchance grid")
  console.log(head.row);
  console.log("------------")
  if (!head) return 0;
  head.row.classList.add('pku-head-row');
  // the footer row carries the same legacy blue; let it inherit the page
  grid.querySelectorAll('tr.datagrid-footer').forEach((tr) => {
    tr.classList.remove('datagrid-footer');
  });

  const labels = head.cells.map(headText);
  const iName = findCol(labels, COL.name);
  const iInfo = findCol(labels, COL.info);
  if (iName < 0) return 0;

  const colCount = head.cells.length;
  const dataRows = [...grid.querySelectorAll('tr')].filter((tr) =>
    !tr.querySelector('th') && tr.children.length >= colCount);
  if (!dataRows.length) return 0;
  const tail = [...grid.querySelectorAll('tr')]
    .filter((tr) => tr !== head.row && !dataRows.includes(tr));

  // ---- split 上课/考试信息 (exam appended) into time + 备注 columns ----
  if (iInfo >= 0) {
    const noteTh = document.createElement('th');
    noteTh.className = 'datagrid';
    noteTh.textContent = NOTE_HEAD;
    head.row.insertBefore(noteTh, head.cells[iInfo].nextSibling);
    dataRows.forEach((tr) => {
      const src = tr.children[iInfo];
      const parts = parseInfoCell(src);
      if (src) src.innerHTML = parts.time;
      const n = document.createElement('td');
      n.className = 'datagrid';
      n.textContent = parts.note;
      tr.insertBefore(n, src ? src.nextSibling : null);
    });
    // footer/pager rows span the table, so widen their colspan by one
    tail.forEach((tr) => {
      const first = tr.firstElementChild;
      if (first && first.hasAttribute('colspan')) {
        const n = parseInt(first.getAttribute('colspan'), 10);
        if (!isNaN(n)) first.setAttribute('colspan', String(n + 1));
      }
    });
  }

  // ---- sort by course name, stable within a name ----
  const collator = new Intl.Collator('zh');
  const rows = dataRows.map((tr, i) => ({
    tr, i,
    name: cellText(tr, iName),
  })).sort((a, b) => collator.compare(a.name, b.name) || a.i - b.i);

  const parent = dataRows[0].parentNode;
  rows.forEach((r) => parent.appendChild(r.tr));
  tail.forEach((tr) => parent.appendChild(tr));

  // Snapshot each row's searchable/filterable values now: the fold column and
  // the scrolling pane are about to change every child index, so read them
  // while the header and cells still line up one-to-one.
  const modelLabels = captureRowModel(head.row, rows);

  // ---- strip the site's row styling, wrap cells, style the name ----
  rows.forEach((r) => {
    dropLegacyRowStyling(r.tr);
    r.tr.classList.add('pku-row');
    [...r.tr.children].forEach((td) => {
      if (td.querySelector('.pku-cell')) return;
      const box = document.createElement('span');
      box.className = 'pku-cell';
      while (td.firstChild) box.appendChild(td.firstChild);
      td.appendChild(box);
    });
  });

  // ---- zebra, fixed now while everything is unfolded ----
  // r.nat records the natural (name-sorted) position, so a pin can be undone.
  rows.forEach((r, n) => {
    r.nat = n;
    r.tr.classList.add(n % 2 ? 'pku-r-odd' : 'pku-r-even');
    r.newName = n === 0 || rows[n - 1].name !== r.name;
  });

  // ---- fold column, then the kept vertical rule ----
  const addFoldCell = (tr, tag) => {
    const c = document.createElement(tag);
    c.className = 'pku-foldcell' + (fold ? '' : ' pku-foldcell--empty');
    tr.insertBefore(c, tr.firstChild);
    return c;
  };
  addFoldCell(head.row, 'th');
  rows.forEach((r) => addFoldCell(r.tr, 'td'));
  tail.forEach((tr) => {
    const first = tr.firstElementChild;
    if (first && first.hasAttribute('colspan')) {
      const n = parseInt(first.getAttribute('colspan'), 10);
      if (!isNaN(n)) first.setAttribute('colspan', String(n + 1));
    } else {
      addFoldCell(tr, 'td');
    }
  });

  const nameCol = iName + 1;   // the fold cell shifted every column right
  [...grid.querySelectorAll('tr')].forEach((tr) => {
    const cell = tr.children[nameCol];
    if (cell && !cell.hasAttribute('colspan')) cell.classList.add('pku-col-name');
  });
  // fold the detail columns into one scrolling pane, then size what is left
  let paneFirst = -1, paneLast = -1, paneWidths = [], paneOrder = [];
  // Measured now, while every body cell still lines up with its heading --
  // the merge below replaces a run of columns with one, after which the
  // indices no longer agree.
  const measured = measureColumns(head.row, rows);

  collapseScrollColumns.last = null;
  if (collapseScrollColumns(grid, head.row, rows, measured)) {
    syncScrollPanes(grid);
    const info = collapseScrollColumns.last;
    if (info) ({ first: paneFirst, last: paneLast, widths: paneWidths, order: paneOrder } = info);
  }
  const pane = collapseScrollColumns.last;
  assignColumnWidths(grid, head.row, measured, pane);
  // the shares are derived from the table's real width, so a resize re-runs
  // them rather than leaving the layout right only at the width it loaded at
  onWidthChange(() => assignColumnWidths(grid, head.row, measured, pane));

  // ---- group by name and wire one fold control per group ----
  const groups = [];
  rows.forEach((r) => {
    if (r.newName) groups.push({ leader: r, rows: [] });
    const g = groups[groups.length - 1];
    if (r !== g.leader) g.rows.push(r);
  });

  let controls = 0;
  groups.forEach((g, gi) => {
    if (groupRules && gi > 0) g.leader.tr.classList.add('pku-group-start');
    if (!fold || !g.rows.length) return;
    const btn = foldButton();
    g.button = btn;
    g.leader.tr.firstElementChild.appendChild(btn.el);
    btn.onToggle((folded) => {
      g.leader.tr.classList.toggle('pku-f-name', folded);
      // Swapping a cell's text to 已折叠 changes its natural height, which
      // would resize the leader row the instant it happens -- a visible jump
      // before the rows below even start collapsing. Pin each cell to the
      // height it already has so only one animation is ever seen.
      lockCellHeights(g.leader.tr);
      // only rows the filter is showing take part in the fold
      const live = g.rows.filter((r) => !r.hiddenByFilter);
      // The mark stands in for the rows that are not on screen, so it is
      // shown for exactly as long as they are away: it lands with the click
      // that folds them, and is not taken back until they are fully out
      // again. The leader's cells are pinned above, so neither swap moves it.
      if (folded) {
        markFolded(g.leader, live);
        animateRows(live, true);
      } else {
        animateRows(live, false, () => markFolded(g.leader, []));
      }
    });
    controls++;
  });

  // hand the model to the toolbar: it filters rows and re-runs the folds.
  // shape[] records the per-row transforms so rows fetched from other pages
  // can be rebuilt to match this grid exactly.
  GRID_MODEL.set(grid, {
    rows, groups, fold, grid,
    shape: { iInfo, iName, colCount, paneFirst, paneLast, paneWidths, paneOrder,
              labels: modelLabels },
  });

  return controls;
}

// A CJK glyph occupies about a full em, Latin and digits about half, so text
// length in characters is a poor width proxy: 开课单位 needs roughly twice the
// room of a four-letter word. Measure in ems instead.
function textEm(str) {
  let em = 0;
  for (const ch of str) em += /[\u2e80-\uffef]/.test(ch) ? 1 : 0.55;
  return em;
}

// These columns are folded into a single horizontally scrolling pane, so the
// identity and action columns stay put while the detail columns scroll.
// Only these scroll; any column not listed stays fixed. Aliases cover the
// differing header names between pages.
const SCROLL_COLS = [
  '年级', '开课年级',
  '上课/考试信息', '上课时间', '教室信息',
  '考试时间', '备注', '自选P/NP',
];
const SCROLL_COL_EM = {
  '年级': 5, '开课年级': 6,
  '上课/考试信息': 24, '上课时间': 24, '教室信息': 24,
  '考试时间': 13, '备注': 22, '自选P/NP': 6,
};
// The order the pane lays its columns out in, overriding the DOM order the
// site ships. 上课/考试信息 is what a row is read for, so it leads; 年级 is a
// short tag that belongs near the end, just before 自选P/NP.
const SCROLL_ORDER = [
  '上课/考试信息', '上课时间', '教室信息', '考试时间',
  '备注',
  '年级', '开课年级',
  '自选P/NP',
];

// Merges the SCROLL_COLS cells of every row into one cell holding a nested
// table inside a scroller. The nested tables all use the same fixed column
// widths, so the columns still line up from row to row.
function collapseScrollColumns(grid, headRow, bodyRows, measured) {
  const labels = [...headRow.children].map(headText);
  const wanted = labels.map((l) => SCROLL_COLS.includes(l));

  // Only a contiguous run can be merged without reordering columns, so take
  // the LONGEST run of wanted columns; on a page where they are not adjacent
  // the biggest cluster scrolls and the strays stay fixed.
  let best = { start: -1, len: 0 }, run = 0;
  wanted.forEach((w, i) => {
    run = w ? run + 1 : 0;
    if (run > best.len) best = { start: i - run + 1, len: run };
  });
  if (best.len < 2) return false;

  const first = best.start, last = best.start + best.len - 1;
  const span = last - first + 1;
  const paneLabels = labels.slice(first, last + 1);

  // Order the pane's columns independently of the DOM order the site ships:
  // the time/exam info leads, 年级 sits second-last just before 自选P/NP.
  const rankOf = (l) => {
    const i = SCROLL_ORDER.indexOf(l);
    return i < 0 ? SCROLL_ORDER.length : i;
  };
  const order = paneLabels.map((_, k) => k)
    .sort((a, b) => rankOf(paneLabels[a]) - rankOf(paneLabels[b]) || a - b);

  // The pane's own columns are sized by the same rule as the outer ones.
  // 备注 is the exception the width rule names outright: it is always given
  // half of what its text asks for, however long that text runs.
  const paneEm = order.map((k) => {
    const l = paneLabels[k];
    const m = measured && measured[first + k];
    const w = m ? m.w : (SCROLL_COL_EM[l] || 8);
    return COL.note && COL.note.includes(l) ? w * COL_NOTE_K : w;
  });
  const widths = paneEm.map((w) => w.toFixed(2) + 'em');

  const convert = (row, tag) => {
    const group = [...row.children].slice(first, last + 1);
    if (!group.length) return;
    const ordered = order.map((k) => group[k]);
    // 维护选课计划 sets inline width on each th/td (some as percentages that
    // overflow 100%); clear them so the nested colgroup governs instead
    ordered.forEach((cell, i) => {
      cell.style.removeProperty('width');
      cell.removeAttribute('width');
      // the 上课/考试信息 cell grows to show every meeting line; mark it so it
      // can escape the two-line clamp the other pane cells keep
      if (COL.info.includes(paneLabels[order[i]])) cell.classList.add('pku-info-cell');
    });
    const host = document.createElement(tag);
    host.className = 'pku-scrollcell';
    const pane = document.createElement('div');
    pane.className = 'pku-hscroll';
    const inner = document.createElement('table');
    inner.className = 'pku-inner';
    const cg = document.createElement('colgroup');
    widths.forEach((w) => {
      const col = document.createElement('col');
      col.style.width = w;
      cg.appendChild(col);
    });
    const tr = document.createElement('tr');
    ordered.forEach((cell) => tr.appendChild(cell));   // move, keeps handlers
    inner.append(cg, tr);
    pane.appendChild(inner);
    host.appendChild(pane);
    row.insertBefore(host, row.children[first] || null);
  };

  convert(headRow, 'th');
  bodyRows.forEach((r) => convert(r.tr, 'td'));
  // what the outer allocation needs to know about the pane: what it wants
  // in total, and the point past which nothing is readable without scrolling
  collapseScrollColumns.last = {
    first, last, widths, order,
    em: paneEm.slice(),
    base: paneEm.slice(),   // what was measured; `em` is re-derived from it
    at: first,
    span,
    w: paneEm.reduce((a, b) => a + b, 0),
    floor: paneEm[0] || 8,
  };

  return true;
}

// Every row has its own scroller, so they are kept in step: scrolling one
// scrolls all of them, keeping the columns visually aligned.
function syncScrollPanes(grid) {
  const panes = [...grid.querySelectorAll('.pku-hscroll')];
  if (panes.length < 2) return;

  let syncing = false;
  const spread = (x) => {
    syncing = true;
    panes.forEach((p) => { if (Math.round(p.scrollLeft) !== Math.round(x)) p.scrollLeft = x; });
    requestAnimationFrame(() => { syncing = false; });
  };

  panes.forEach((pane) => {
    pane.addEventListener('scroll', () => {
      if (!syncing) spread(pane.scrollLeft);
    });
    // the scrollbars are hidden to keep the header aligned with the fixed
    // columns, so a mostly-horizontal wheel gesture drives the pane instead
    pane.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // leave vertical alone
      const max = pane.scrollWidth - pane.clientWidth;
      if (max <= 0) return;
      const next = Math.max(0, Math.min(max, pane.scrollLeft + e.deltaX));
      if (next !== pane.scrollLeft) {
        e.preventDefault();
        pane.scrollLeft = next;
        spread(next);
      }
    }, { passive: false });
  });
}

// Re-runs its callers when the window's WIDTH changes. Column shares are
// derived from the table's real width, so they have to be re-derived on a
// resize -- but not on a height-only one (a mobile toolbar sliding away),
// which changes nothing about the columns and would only cost a reflow.
const WIDTH_WATCH = [];
function onWidthChange(fn) {
  if (!WIDTH_WATCH.length) {
    let last = innerWidth, timer = 0;
    addEventListener('resize', () => {
      if (innerWidth === last) return;
      last = innerWidth;
      clearTimeout(timer);
      timer = setTimeout(() => WIDTH_WATCH.forEach((f) => {
        try { f(); } catch (e) {}
      }), 120);
    });
  }
  WIDTH_WATCH.push(fn);
}

// ---- column widths ----
// Sizing a column to its longest entry lets one freak value set it: a single
// nineteen-character 开课单位 among four-character ones, one 98em 上课信息.
// So each column is sized to the width that covers all but the longest few,
// and those few wrap instead.
const COL_KEEP = 0.85;    // width covering all but the top 15%
const COL_WIDE = 0.20;    // a column past this share of the table is reduced
const COL_NARROW = 0.05;  // a column below this share of the table is multiplied with short_field_multiply to prevent it from being reduced as much
const COL_WIDE_K = 0.65;  // ...to this much of itself, so long text folds
const COL_HEAD_K = 1.5;   // never narrower than 1.5x its own heading
const COL_NOTE_K = 0.5;   // 备注 is always half its own W, however wide
const COL_HOLD = { '课程号': 3 };   // gives up width 3x more grudgingly
const SHORT_FIELD_MULTIPLY = 5; // multiplys fields below 5% to stop super short fields from folding
const COL_CODES = ['课程号', '课程班号'];   // class-code columns never fold

// What one cell needs is its longest LINE, not the sum of its text: a cell
// listing three meetings on three lines is only as wide as the widest one.
function cellEm(td) {
  if (!td) return 0;
  let best = 0;
  (td.innerHTML || '').split(/<br\s*\/?>/i).forEach((frag) => {
    const box = document.createElement('div');
    box.innerHTML = frag;
    const t = box.textContent.replace(/\s+/g, ' ').trim();
    if (t) best = Math.max(best, textEm(t));
  });
  return best;
}

// The longest line of a cell, as text -- used to decide how many lines a
// column may fold into. Mirrors cellEm but returns the string, not its ems.
function cellLineText(td) {
  if (!td) return '';
  let best = '';
  (td.innerHTML || '').split(/<br\s*\/?>/i).forEach((frag) => {
    const box = document.createElement('div');
    box.innerHTML = frag;
    const t = box.textContent.replace(/\s+/g, ' ').trim();
    if (t.length > best.length) best = t;
  });
  return best;
}

// How many lines a column may fold into. Numeric and very short fields stay
// on one line; the rest may fold to two. Only the cell values decide -- the
// header text is never consulted here.
function columnTarget(label, texts) {
  if (COL_CODES.includes(label)) return 1;
  if (texts.length && texts.every((t) => /^[\d./\s]+$/.test(t))) return 1;
  const longest = texts.reduce((m, t) => Math.max(m, t.length), 0);
  if (longest <= 4) return 1;
  return 2;
}

// The width that covers all but the longest few entries. Under five entries
// there is no distribution to speak of, so the second longest is the honest
// answer -- the longest being the value we are deliberately not trusting.
function keepEm(vals) {
  if (!vals.length) return 0;
  const v = vals.slice().sort((a, b) => a - b);
  if (v.length < 5) return v[Math.max(0, v.length - 2)];
  return v[Math.min(v.length - 1, Math.floor(COL_KEEP * v.length))];
}

// Measured while the header and the body cells still line up one-to-one --
// before the scrolling columns are merged into a single pane.
function measureColumns(headRow, bodyRows) {
  return [...headRow.children].map((th, c) => {
    const gutter = th.classList.contains('pku-foldcell');
    const label = gutter ? '' : headText(th);
    const vals = [];
    const texts = [];
    bodyRows.forEach((r) => {
      const td = r.tr ? r.tr.children[c] : r.children[c];
      const e = cellEm(td);
      if (e) vals.push(e);
      const t = cellLineText(td);
      if (t) texts.push(t);
    });
    // Headings are allowed to wrap, so this is not "fit the heading on one
    // line" -- it is a floor that keeps a column with terse values from
    // ending up narrower than the word naming it.
    return {
      label,
      gutter,
      w: Math.max(keepEm(vals), textEm(label) * COL_HEAD_K),
      target: columnTarget(label, texts),
    };
  });
}

// Take `need` em out of these columns in proportion to their width, so every
// column loses the same fraction and a narrow one is not gutted to spare a
// wide one. A column stops at its own floor; 课程号 resists three times as
// hard, so it is the last thing to start clipping.
function shrinkCols(cols, need) {
  for (let pass = 0; pass < 24 && need > 0.01; pass++) {
    const live = cols.filter((c) => c.w > c.min + 0.01);
    const pool = live.reduce((a, c) => a + c.w / (c.hold || 1), 0);
    if (pool <= 0) break;
    let took = 0;
    live.forEach((c) => {
      const cut = Math.min(need * (c.w / (c.hold || 1)) / pool, c.w - c.min);
      c.w -= cut;
      took += cut;
    });
    if (took <= 0.001) break;
    need -= took;
  }
  return need;
}

// Every row carries its own copy of the pane's colgroup, so they are all
// rewritten together -- that is what keeps the scrolling columns lined up
// from row to row. `widths` is mutated in place: the grid model hands the
// same array to rows fetched from other pages.
function setPaneWidths(grid, pane) {
  pane.em.forEach((w, k) => { pane.widths[k] = w.toFixed(2) + 'em'; });
  grid.querySelectorAll('table.pku-inner > colgroup').forEach((cg) => {
    [...cg.children].forEach((col, k) => {
      if (pane.widths[k]) col.style.width = pane.widths[k];
    });
  });
}

function assignColumnWidths(grid, headRow, measured, pane) {
  const cells = [...headRow.children];
  const fs = parseFloat(getComputedStyle(grid).fontSize) || 13;
  const padEm = 20 / fs;              // 10px of cell padding either side
  const px = grid.getBoundingClientRect().width
    || (grid.parentElement && grid.parentElement.clientWidth) || 0;
  if (!px || !measured) return;
  // A resize re-runs all of this, so start from what was measured rather
  // than from the widths the last run left behind, or they compound.
  if (pane && pane.base) {
    pane.em = pane.base.slice();
    pane.w = pane.base.reduce((a, b) => a + b, 0);
  }

  // One entry per column the table actually shows: the merged pane stands in
  // for the run of scrolling columns behind it.
  const cols = [];
  cells.forEach((th, i) => {
    if (th.classList.contains('pku-foldcell')) return;
    if (th.classList.contains('pku-scrollcell')) {
      cols.push({ th, pane: true, label: '', w: pane.w, hold: 1, target: 2 });
    } else {
      const m = measured[pane && i > pane.at ? i + pane.span - 1 : i];
      cols.push({ th, pane: false, label: m ? m.label : '', w: m ? m.w : 4,
                  hold: 1, target: m ? m.target : 1 });
    }
  });
  if (!cols.length) return;

  const room = px / fs - cols.length * padEm;
  if (room <= 0) return;

  // Wide columns are pulled in so their text folds rather than running the
  // table off the page. Reduced columns are then left alone for as long as
  // possible: cutting them again is what makes rows grow ultra tall.
  cols.forEach((c) => {
    c.hold = COL_HOLD[c.label] || 1;
    if (c.hold == 1 && c.w < COL_NARROW) {c.hold = SHORT_FIELD_MULTIPLY; }
    const W = c.w;                       // measured width, pre-reduction
    if (c.w > COL_WIDE * room) { c.w *= COL_WIDE_K; c.reduced = true; }
    c.full = c.w;
    // the floor is the width that fits on `target` lines (with 10% headroom);
    // a one-line column therefore refuses to shrink at all
    c.min = (W * 1.1) / (c.target || 1);
  });
  // the pane may shrink until its first column is fully in view -- past that
  // there is nothing left to read without scrolling
  const paneCol = cols.find((c) => c.pane);
  if (paneCol) paneCol.min = Math.min(paneCol.w, pane.floor);

  let total = cols.reduce((a, c) => a + c.w, 0);
  if (total <= room) {
    // Everything fits, so nothing has to scroll -- and a pane that does not
    // scroll is not a unit any more. Its columns take their share of the
    // slack one by one, like every other column. Treated as a block it drew
    // a share sized by its whole width and parked all of it after its last
    // column, as dead space at the end of the scroll.
    const extra = room - total;
    const pool = total || 1;
    cols.forEach((c) => {
      if (!c.pane) { c.w += extra * (c.w / pool); return; }
      pane.em = pane.em.map((w) => w + extra * (w / pool));
      c.w = pane.em.reduce((a, b) => a + b, 0);
    });
    if (pane && pane.em) setPaneWidths(grid, pane);
  } else {
    let need = total - room;
    // The pane goes first -- it scrolls, so width taken from it costs
    // nothing that cannot be scrolled back into view.
    if (paneCol) {
      const cut = Math.min(need, paneCol.w - paneCol.min);
      paneCol.w -= cut;
      need -= cut;
    }
    // then the columns that have not been reduced yet, down to the same
    // treatment the wide ones already had
    need = shrinkCols(cols.filter((c) => !c.reduced && !c.pane), need);
    // and only once everything sits at that width does it all give together
    if (need > 0.01) {
      cols.forEach((c) => { c.min = 1; });
      shrinkCols(cols, need);
    }
  }

  // Written as percentages of what was allocated, so the table still fills
  // its width between resizes; the shares themselves are re-derived on one.
  const sum = cols.reduce((a, c) => a + c.w, 0) || 1;
  cols.forEach((c) => {
    c.th.removeAttribute('width');
    c.th.style.setProperty('width', (c.w / sum * 100).toFixed(2) + '%', 'important');
  });

  cells.forEach((th) => {
    if (th.classList.contains('pku-dscrollcell')) return;
    if (!th.querySelector('.pku-head')) {
      const box = document.createElement('span');
      box.className = 'pku-head';
      while (th.firstChild) box.appendChild(th.firstChild);
      th.appendChild(box);
    }
  });
}

// Freezes a row's cells at their current height, so later content changes
// cannot reflow it. Measured before anything is edited.
function lockCellHeights(tr) {
  // Pin the cells themselves (not the .pku-cell wrappers) so the pin survives
  // markFolded's innerHTML swap to 已折叠 and the leader row does not jump. A
  // table cell's `height` acts as its minimum, so it keeps the row tall even
  // after the text inside shrinks to one line.
  [...tr.children].forEach((td) => {
    if (td.style.height) return;   // already pinned
    td.style.height = td.getBoundingClientRect().height + 'px';
  });
}

// Fold animation: the ROW animates, the text inside it does not.
//
// Each cell's content already sits in a single wrapper -- .pku-cell for an
// ordinary column, .pku-hscroll for the horizontal pane. armFold pins every
// wrapper to the height its cell is showing right now, and the fold then
// moves only the box around the text: the wrapper's height, and the cell's
// vertical padding. The wrapper's width never moves, so the text is laid out
// once and the shrinking box merely clips it -- nothing re-wraps, nothing
// changes font metrics, and the rows below follow the collapse the whole way
// down instead of jumping at the end.
const FOLD_MS = 240;   // keep in step with the transition in the stylesheet

// The one element inside a cell that holds everything the cell shows.
function foldBox(td) {
  return td.querySelector(':scope > .pku-cell, :scope > .pku-hscroll');
}

// Pin a row's wrappers at the height they are showing, and hand them back
// with that height so the fold has both ends of the animation.
function armFold(tr) {
  // Read everything before writing anything: the first pinned wrapper would
  // otherwise be in the row's height by the time the next cell is measured.
  const h = tr.getBoundingClientRect().height;
  const cells = [...tr.children].map((td) => {
    const cs = getComputedStyle(td);
    return {
      box: foldBox(td),
      pad: (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0),
    };
  });

  // What is left of the row once this cell's padding and the hairline the
  // class is about to drop are taken out -- so cell padding plus wrapper
  // still adds up to exactly the height the row has now. A cell shorter than
  // its row is pinned to the same total, which costs nothing (the wrapper
  // draws no background) and keeps every cell on one schedule.
  const boxes = [];
  cells.forEach((c) => {
    if (!c.box) return;   // the empty fold gutter: only its padding animates
    boxes.push({ el: c.box, h: Math.max(0, h - c.pad) });
  });
  tr.classList.add('pku-fold');
  boxes.forEach((b) => { b.el.style.height = b.h + 'px'; });
  return boxes;
}

// Hand the row back to plain CSS: no pinned heights, no fold classes.
function clearFold(tr) {
  tr.classList.remove('pku-fold', 'pku-fold--anim', 'pku-fold--shut');
  [...tr.children].forEach((td) => {
    const box = foldBox(td);
    if (box) box.style.removeProperty('height');
  });
}

function animateRows(rows, folded, onDone) {
  if (!rows.length) { if (onDone) onDone(); return; }

  // a toggle mid-fold abandons the run in flight and starts a fresh one
  rows.forEach((r) => { clearTimeout(r._foldTimer); r._foldTimer = null; });

  // Measure and arm while the rows are OPEN, in both directions: unfolding
  // puts them back at full size first, so their text is laid out once, up
  // front, and only the box that clips it ever moves.
  rows.forEach((r) => {
    clearFold(r.tr);
    r.tr.classList.remove('pku-hidden');
  });
  const armed = rows.map((r) => armFold(r.tr));

  // The start state, still untransitioned: folding starts from the heights
  // armFold just pinned, unfolding from fully closed.
  if (!folded) {
    rows.forEach((r) => r.tr.classList.add('pku-fold--shut'));
    armed.forEach((boxes) => boxes.forEach((b) => { b.el.style.height = '0px'; }));
  }
  void rows[0].tr.getBoundingClientRect().height;   // commit it

  requestAnimationFrame(() => {
    rows.forEach((r) => {
      r.tr.classList.add('pku-fold--anim');
      r.tr.classList.toggle('pku-fold--shut', folded);
    });
    armed.forEach((boxes) => boxes.forEach((b) => {
      b.el.style.height = folded ? '0px' : b.h + 'px';
    }));

    // One timer for the whole group, stored on every row so a quick
    // re-toggle clears it. Folded rows only leave the table once the
    // collapse has already taken their height to zero, so nothing jumps;
    // onDone fires there, with the group settled.
    const timer = setTimeout(() => {
      rows.forEach((r) => {
        if (folded) r.tr.classList.add('pku-hidden');
        clearFold(r.tr);
        r._foldTimer = null;
      });
      if (onDone) onDone();
    }, FOLD_MS + 30);
    rows.forEach((r) => { r._foldTimer = timer; });
  });
}

// A fold toggle: chevron points down when open, right when folded.
function foldButton() {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pku-fold-btn';
  el.setAttribute('aria-expanded', 'true');
  const chev = chevron();
  el.appendChild(chev);
  let folded = false;
  return {
    el,
    folded: () => folded,
    onToggle(fn) {
      el.addEventListener('click', () => {
        folded = !folded;
        el.setAttribute('aria-expanded', String(!folded));
        chev.classList.toggle('pku-chev--open', folded);
        fn(folded);
      });
    },
  };
}

// While rows are folded away, show 已折叠 in the columns whose values differ
// between them, so nothing distinguishing is silently hidden.
function markFolded(leader, hiddenRows) {
  const row = leader.tr;
  row.querySelectorAll('[data-pku-orig]').forEach((cell) => {
    cell.innerHTML = cell.getAttribute('data-pku-orig');
    cell.removeAttribute('data-pku-orig');
  });
  if (!hiddenRows.length) return;

  const norm = (el) => el.textContent.replace(/[\s\u00a0]+/g, " ").trim();
  const mark = (cell, others, force) => {
    const base = norm(cell);
    if (!force && !others.some((o) => o && norm(o) !== base)) return;
    cell.setAttribute("data-pku-orig", cell.innerHTML);
    cell.innerHTML = '<span class="pku-cell pku-folded-mark">\u5df2\u6298\u53e0</span>';
  };
  const innerOf = (cell) =>
    cell ? [...cell.querySelectorAll("table.pku-inner > tr > *")] : [];

  for (let c = 0; c < row.children.length; c++) {
    const mine = row.children[c];
    if (!mine || mine.classList.contains("pku-foldcell")) continue;
    if (mine.classList.contains("pku-col-name")) continue;   // the name stays

    // The scrolling pane holds a nested row, so compare its cells one by one.
    // Replacing the pane wholesale would destroy the nested table.
    if (mine.classList.contains("pku-scrollcell")) {
      innerOf(mine).forEach((cell, k) => {
        mark(cell, hiddenRows.map((r) => innerOf(r.tr.children[c])[k]));
      });
      continue;
    }

    // 意愿值 (the per-row input) and the 预选/删除 action are row-specific:
    // the leader's own value/action does not stand for the folded rows, so
    // they always read 已折叠 rather than silently showing one row's.
    if (mine.querySelector('input') ||
        mine.querySelector('a[href*="electCourse.do"], a[href*="cancelCourse.do"]')) {
      mark(mine, [], true);
      continue;
    }

    mark(mine, hiddenRows.map((r) => r.tr.children[c]));
  }
}

// ---- section heads ----
// The site renders each list as:
//   <tr><td> <img arrow> <font class=subTitle>TITLE</font>
//            <span class=errmsg>NOTE</span> </td></tr>
//   <tr><td> <table class=datagrid> … </table> </td></tr>
// Rebuild that as one flex head and move it into the grid's own cell, so it
// sticks only for the length of its table.
function buildSectionHeads() {
  const heads = [...document.querySelectorAll('font.subTitle')];
  let built = 0;
  let tookActions = false;

  heads.forEach((label) => {
    const titleRow = label.closest('tr');
    if (!titleRow) return;

    // The grid may sit in the title's own row (维护选课计划) or in a later one
    // (预选). Look inside first, then walk forward.
    let grid = titleRow.querySelector('table.datagrid');
    if (!grid) {
      let gridRow = titleRow.nextElementSibling;
      while (gridRow && !gridRow.querySelector('table.datagrid')) {
        gridRow = gridRow.nextElementSibling;
      }
      grid = gridRow && gridRow.querySelector('table.datagrid');
    }
    const cell = grid && grid.closest('td, th');
    if (!cell) return;

    // when the grid shares the title's cell, the title text must be lifted
    // out before the row is removed, or the grid would go with it
    const sharesRow = titleRow.contains(grid);

    const note = titleRow.querySelector('.errmsg');

    const line = document.createElement('div');
    line.className = 'pku-section-headline';
    const h3 = document.createElement('h3');
    h3.className = 'pku-section-title';
    h3.textContent = label.textContent.replace(/\s+/g, ' ').trim();
    line.appendChild(h3);
    if (note) {
      const n = document.createElement('span');
      n.className = 'pku-section-note';
      n.textContent = note.textContent.replace(/\s+/g, ' ').trim();
      line.appendChild(n);
    }
    // the credit / willingness tally goes on both 预选 titles when present
    const creditTxt = creditInfoText();
    if (creditTxt) {
      const ci = document.createElement('span');
      ci.className = 'pku-credit-info';
      ci.textContent = creditTxt;
      line.appendChild(ci);
    }
    // Both go straight into the grid's cell, in order, so the title's sticky
    // containing block is that cell and it stays pinned for the whole table.
    cell.prepend(line);
    let toolbar = null;
    if (!built) {
      toolbar = buildToolbar(grid);
      line.after(toolbar);
      tookActions = true;
    }

    if (sharesRow) {
      // drop just the old label, note and arrow, keeping the row (and grid)
      label.remove();
      if (note) {
        const holder = note.closest('b') || note;
        holder.remove();
      }
      cell.querySelectorAll('img[src*="arrow_red"]').forEach((i) => i.remove());
    } else {
      titleRow.remove();
    }

    // Wrap the title, toolbar and table in one block so the title's sticky
    // containing block ends at the last data row -- above the pager, which
    // now lives outside the table -- and the title scrolls up right there.
    const body = document.createElement('div');
    body.className = 'pku-section-body';
    body.appendChild(line);
    if (toolbar) body.appendChild(toolbar);
    body.appendChild(grid);
    cell.prepend(body);

    built++;
  });

  return { built, tookActions };
}

// The 选课结果 timetable keeps the site's own table but gets a reskin title:
// 学期课程表 as the section title, and the 请注意… export note as its subtitle.
function buildTimetableHead() {
  const table = document.getElementById('classAssignment');
  if (!table) return;
  const caption = table.querySelector('caption.course');
  const titleText = caption
    ? caption.textContent.replace(/\s+/g, ' ').trim()
    : '学期课程表';

  const noteP = [...document.querySelectorAll('p.pkuportal-remark')]
    .find((el) => /请注意/.test(el.textContent));

  const cell = table.closest('td, th');
  if (!cell) return;

  const line = document.createElement('div');
  line.className = 'pku-section-headline';
  const h3 = document.createElement('h3');
  h3.className = 'pku-section-title';
  h3.textContent = titleText;
  line.appendChild(h3);

  if (noteP) {
    const n = document.createElement('span');
    n.className = 'pku-section-note';
    [...noteP.childNodes].forEach((node) => n.appendChild(node.cloneNode(true)));
    n.querySelectorAll('a').forEach((a) => a.classList.add('pku-timetable-export'));
    line.appendChild(n);
  }

  cell.prepend(line);
  if (caption) caption.remove();
  if (noteP) {
    const row = noteP.closest('tr');
    if (row) row.remove();
  }
}

// A datagrid that has no section title (e.g. 查看选课结果's course list) has no
// title strip for its sticky column header to sit under, so it would pin with a
// gap. Mark those grids so their header pins flush under the nav instead.
function markNoTitleGrids() {
  document.querySelectorAll('table.datagrid').forEach((grid) => {
    const cell = grid.closest('td, th');
    const hasTitle = cell && cell.querySelector('.pku-section-headline');
    if (!hasTitle) grid.classList.add('pku-no-title');
  });
}

// The heads pin below the nav, whose height differs per breakpoint, so it is
// measured instead of hardcoded.
// Two sticky offsets, both measured rather than hardcoded: the title strip
// pins under the nav, and the grid's column headers pin under the title strip.
// The nav's height differs per breakpoint, so this re-runs on resize.
function trackStickyOffsets() {
  const nav = document.querySelector('.pku-nav');
  if (!nav) return;
  const header = document.querySelector('.pku-header');
  const root = document.documentElement;

  // What the strips below have to clear is whichever bar is really pinned at
  // the top, and that differs by breakpoint: wide, .pku-header sticks (logo
  // and tabs on one row) and the nav is a static child of it; narrow, the
  // header is display:contents and the nav sticks on its own. Measuring the
  // nav in the wide layout comes up exactly 1px short -- align-items:stretch
  // sizes it to the header's CONTENT box, which excludes the header's own
  // bottom border: the very separator this offset exists to clear.
  const topBar = () =>
    (header && getComputedStyle(header).position === 'sticky') ? header : nav;

  // Both offsets are rounded UP. A fractional height rounded down pins the
  // sticky element a fraction of a pixel too high, and what it covers there
  // is the 1px separator along the bottom of the bar above it -- clipped to
  // a sliver, or gone. Half a pixel of gap is invisible; half a pixel of
  // overlap is not.
  const apply = () => {
    const navH = Math.ceil(topBar().getBoundingClientRect().height);
    root.style.setProperty('--pku-stick-top', navH + 'px');

    // tallest title strip wins, so both grids' headers line up consistently
    let titleH = 0;
    document.querySelectorAll('.pku-section-headline').forEach((el) => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > titleH) titleH = h;
    });
    root.style.setProperty('--pku-head-top', (navH + titleH) + 'px');

  };

  apply();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(apply);
    ro.observe(nav);
    if (header) ro.observe(header);   // the wide layout's sticky bar
    document.querySelectorAll('.pku-section-headline').forEach((el) => ro.observe(el));
    document.querySelectorAll('table.datagrid tr.pku-head-row').forEach((el) => ro.observe(el));
  } else {
    addEventListener('resize', apply);
  }
  // web fonts can land after this runs and change the measured heights
  addEventListener('load', apply);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(apply);
}

// ---- floating timetable ----
// The site renders 学期课程表 as a 8-column grid: a 节数 column then one
// column per weekday, each cell holding a course as four <br>-separated
// lines -- name, room, "(备注：...) 每周", and an exam line. Almost none of
// that survives in a window this size, so the cell is boiled down to the two
// lines worth reading at a glance: the name tagged with its week pattern,
// and when the exam is. Two courses clashing in one period arrive in a
// single cell ruled off by a row of dashes, and stay that way here.

// "第一节" -> "一". The 节 is the same on every row, so it is only noise.
function ttPeriod(txt) {
  return (txt || '').replace(/\s+/g, '').replace(/^第/, '').replace(/节$/, '');
}

// One course's lines -> the two the window shows.
function ttCourse(lines) {
  const name = lines[0];
  if (!name) return null;
  // The pattern is the last word of the 备注 line. It cannot be matched
  // anywhere in the block: a 备注 that spells out a 双周 习题课 timetable
  // would otherwise override the 每周 the course itself runs on.
  let freq = '';
  lines.forEach((l) => {
    const m = l.match(/(每周|单周|双周)\s*$/);
    if (m) freq = m[1];
  });
  return {
    name: name + (freq ? '(' + freq + ')' : ''),
    exam: lines.slice(1).find((l) => /考试/.test(l)) || '',
  };
}

function ttCell(td) {
  if (!td) return null;
  const host = td.querySelector('span') || td;
  // Split on the <br>s rather than reading textContent: the line breaks are
  // the only thing separating one field from the next.
  const lines = (host.innerHTML || '').split(/<br\s*\/?>/i)
    .map((frag) => {
      const box = document.createElement('div');
      box.innerHTML = frag;
      return box.textContent.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
  if (!lines.length) return null;

  // a run of dashes divides two courses sharing the period
  const blocks = [[]];
  lines.forEach((l) => {
    if (/^[–—―_-]{3,}$/.test(l)) blocks.push([]);
    else blocks[blocks.length - 1].push(l);
  });
  const courses = blocks.filter((b) => b.length).map(ttCourse).filter(Boolean);
  if (!courses.length) return null;

  // The colours are load-bearing -- they are what tells one course from the
  // next -- so they come across as they are. A clash is written as red bold
  // text on no background at all, which carries over the same way.
  const tint = td.querySelector('font[color]');
  return {
    courses,
    bg: td.style.backgroundColor || '',
    fg: tint ? tint.getAttribute('color') : (td.style.color || ''),
    bold: !!host.querySelector('b, strong'),
  };
}

function readTimetable(table) {
  const rows = [...table.rows];
  const head = rows.find((r) => r.classList.contains('course-header'))
    || rows.find((r) => r.cells.length > 1);
  if (!head) return null;
  const days = [...head.cells].slice(1).map((c) => c.textContent.trim());
  const body = rows.filter((r) => r !== head && r.cells.length > 1);
  if (!days.length || !body.length) return null;

  return {
    days,
    rows: body.map((tr) => ({
      label: ttPeriod(tr.cells[0].textContent),
      cells: days.map((_, i) => ttCell(tr.cells[i + 1])),
    })),
  };
}

const ttBox = (cls, text) => {
  const el = document.createElement('div');
  el.className = cls;
  const fit = document.createElement('div');
  fit.className = 'pku-tt-fit';
  fit.textContent = text || '';
  el.appendChild(fit);
  return el;
};

function ttBodyCell(cell) {
  const el = document.createElement('div');
  el.className = 'pku-tt-cell';
  if (!cell) return el;
  // set as !important: the stylesheet's own white cell background carries
  // one, and a plain inline value would lose to it
  if (cell.bg) el.style.setProperty('background-color', cell.bg, 'important');
  if (cell.fg) el.style.setProperty('color', cell.fg, 'important');
  if (cell.bold) el.style.setProperty('font-weight', '700', 'important');

  const fit = document.createElement('div');
  fit.className = 'pku-tt-fit';
  cell.courses.forEach((c, i) => {
    if (i) {
      const sep = document.createElement('div');
      sep.className = 'pku-tt-sep';
      fit.appendChild(sep);
    }
    const name = document.createElement('div');
    name.className = 'pku-tt-name';
    name.textContent = c.name;
    fit.appendChild(name);
    if (c.exam) {
      const exam = document.createElement('div');
      exam.className = 'pku-tt-exam';
      exam.textContent = c.exam;
      fit.appendChild(exam);
    }
  });
  el.appendChild(fit);
  return el;
}

// Scale each cell's text down until it fits. The text is laid out once, at
// the grid's own font size, and a transform is all that ever changes -- so
// resizing the window re-scales rather than re-wrapping, and a cell that
// already fits is left alone.
function fitTimetable(grid) {
  const fits = [...grid.querySelectorAll('.pku-tt-fit')];
  fits.forEach((f) => f.style.removeProperty('transform'));
  // one read pass, then one write pass: interleaving them would re-layout
  // the whole grid once per cell
  const ks = fits.map((f) => {
    const cell = f.parentElement;
    const roomH = cell.clientHeight, roomW = cell.clientWidth;
    // Height is what a wrapping cell runs out of; width is what the
    // no-wrap weekday headings run out of. Whichever binds, binds.
    const needH = f.offsetHeight, needW = f.scrollWidth;
    if (!roomH || !roomW || !needH || !needW) return 1;
    return Math.max(0.25, Math.min(1, roomH / needH, roomW / needW));
  });
  fits.forEach((f, i) => {
    if (ks[i] < 0.999) f.style.transform = 'scale(' + ks[i].toFixed(3) + ')';
  });
}

function renderTimetable(model, startOpen) {
  const win = document.createElement('div');
  win.className = 'pku-tt';
  const body = document.createElement('div');
  body.className = 'pku-tt-body';
  const grid = document.createElement('div');
  grid.className = 'pku-tt-grid';
  body.appendChild(grid);

  // A weekday with nothing on it, or a period nobody has a class in, is kept
  // -- a timetable missing 星期三 reads as an error -- but shrinks to just
  // its own label, so the space goes to the rows and columns doing work.
  // A period where two courses clash needs room for both, so it takes double.
  const dayUsed = model.days.map((_, c) => model.rows.some((r) => r.cells[c]));
  const rowUsed = model.rows.map((r) => r.cells.some(Boolean));
  const rowBig = model.rows.map((r) => r.cells.some((c) => c && c.courses.length > 1));

  grid.style.gridTemplateColumns =
    'max-content ' + dayUsed.map((u) => (u ? '1fr' : 'max-content')).join(' ');
  grid.style.gridTemplateRows =
    'var(--pku-tt-head-h) ' +
    rowUsed.map((u, i) => (!u ? 'max-content' : rowBig[i] ? '2fr' : '1fr')).join(' ');

  grid.appendChild(ttBox('pku-tt-head', ''));
  model.days.forEach((d) => grid.appendChild(ttBox('pku-tt-head', d)));
  model.rows.forEach((row) => {
    grid.appendChild(ttBox('pku-tt-side', row.label));
    row.cells.forEach((c) => grid.appendChild(ttBodyCell(c)));
  });

  const bar = document.createElement('div');
  bar.className = 'pku-tt-bar';
  const chev = document.createElement('button');
  chev.type = 'button';
  chev.className = 'pku-tt-chev';
  chev.title = '收起课程表';
  chev.setAttribute('aria-expanded', 'true');
  chev.appendChild(chevron());
  bar.appendChild(chev);

  const grip = document.createElement('div');
  grip.className = 'pku-tt-grip';
  grip.title = '拖动调整大小';

  win.append(body, bar, grip);

  // ---- geometry ----
  // The window is anchored by its TOP-RIGHT corner, which is the bar's own
  // corner: the bar then stays put both when the table folds into it and
  // when the grip pulls the opposite corner around.
  const MARGIN = 16;
  const lim = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fitW = (w) => lim(w, innerWidth * 0.25, innerWidth * 0.9);
  const fitH = (h) => lim(h, innerHeight * 0.2, innerHeight * 0.9);

  const pref = ttPref();
  let W = fitW(pref.w || innerWidth * 0.44);
  let H = fitH(pref.h || innerHeight * 0.5);
  let right = MARGIN;
  let top = Math.max(MARGIN, innerHeight - H - MARGIN);
  // Open where the timetable is the thing you are working against -- picking
  // courses, or ordering 预选 -- and out of the way everywhere else. A fold
  // the user performed themselves outranks that: it is a standing choice.
  let shut = (typeof pref.shut === 'boolean') ? pref.shut : !startOpen;

  let pending = 0;
  const refit = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => fitTimetable(grid));
  };
  const size = () => {
    body.style.width = (shut ? 0 : W) + 'px';
    body.style.height = H + 'px';
    // the base size tracks the window, so a bigger one is genuinely more
    // readable rather than the same small type in more space
    grid.style.fontSize = lim(H / 34, 7, 15).toFixed(2) + 'px';
    refit();
  };
  const place = () => {
    win.style.right = Math.round(right) + 'px';
    win.style.top = Math.round(top) + 'px';
  };

  // ---- fold: the grid keeps its width, the clip box loses its ----
  let foldTimer = 0;
  chev.addEventListener('click', () => {
    // Pin the grid to the width it is laid out for, so the clip box can
    // close over it without squeezing anything inside. Measured while it is
    // open; while it is shut there is nothing to measure, so W less the
    // border it will get back is what it reopens to.
    grid.style.width =
      (shut ? Math.max(0, W - 1) : grid.getBoundingClientRect().width) + 'px';
    shut = !shut;
    saveTtPref({ shut });
    chev.setAttribute('aria-expanded', String(!shut));
    chev.title = shut ? '展开课程表' : '收起课程表';
    win.classList.add('pku-tt--anim');
    win.classList.toggle('pku-tt--shut', shut);
    requestAnimationFrame(() => { body.style.width = (shut ? 0 : W) + 'px'; });
    clearTimeout(foldTimer);
    foldTimer = setTimeout(() => {
      win.classList.remove('pku-tt--anim');
      if (!shut) grid.style.removeProperty('width');
    }, 280);
  });

  // ---- drag by the bar ----
  const drag = (e, onMove) => {
    e.preventDefault();
    const move = (ev) => onMove(ev);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      win.classList.remove('pku-tt--dragging', 'pku-tt--sizing');
      refit();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  // Anywhere on the window is a handle -- the table included. Only the two
  // controls that mean something else are exempt.
  win.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pku-tt-chev, .pku-tt-grip')) return;
    const x0 = e.clientX, y0 = e.clientY, r0 = right, t0 = top;
    win.classList.add('pku-tt--dragging');
    drag(e, (ev) => {
      right = lim(r0 - (ev.clientX - x0), 0, innerWidth - 40);
      top = lim(t0 + (ev.clientY - y0), 0, innerHeight - 40);
      place();
    });
  });

  // ---- resize by the L, bottom-left: left widens, down heightens ----
  grip.addEventListener('pointerdown', (e) => {
    const x0 = e.clientX, y0 = e.clientY, w0 = W, h0 = H;
    win.classList.add('pku-tt--sizing');
    drag(e, (ev) => {
      W = fitW(w0 - (ev.clientX - x0));
      H = fitH(h0 + (ev.clientY - y0));
      size();
    });
    addEventListener('pointerup', () => saveTtPref({ w: W, h: H }), { once: true });
  });

  addEventListener('resize', () => {
    W = fitW(W);
    H = fitH(H);
    right = lim(right, 0, innerWidth - 40);
    top = lim(top, 0, innerHeight - 40);
    place();
    size();
  });

  if (shut) {
    // start folded with no animation, the grid already pinned so the first
    // unfold has a width to travel back out to
    win.classList.add('pku-tt--shut');
    grid.style.width = Math.max(0, W - 1) + 'px';
  }
  place();
  size();
  if (ttStale()) applyTimetableStale(win);
  return win;
}

// The timetable is wanted on every page, but only 选课结果 actually renders
// one. Elsewhere it is fetched once in the background and parked in
// sessionStorage, so moving between pages costs nothing and the window is
// there the moment the page is.
const TT_CACHE = 'pku-timetable';
// Size and fold state are the user's, not the page's, so they live in
// localStorage and carry across every page of the site. Once the window has
// been folded or opened by hand that choice outranks the per-page default.
const TT_PREF = 'pku-timetable-pref';
// Set while the floating timetable is stale: a 预选 changed the taken list,
// and only 选课结果 re-reads the real table, so the window is blurred until then.
const TT_STALE = 'pku-timetable-stale';

function ttPref() {
  try { return JSON.parse(localStorage.getItem(TT_PREF) || 'null') || {}; }
  catch (e) { return {}; }
}
function saveTtPref(patch) {
  try {
    localStorage.setItem(TT_PREF, JSON.stringify(
      Object.assign(ttPref(), patch)));
  } catch (e) {}
}

function cacheTimetable(model) {
  try { sessionStorage.setItem(TT_CACHE, JSON.stringify(model)); } catch (e) {}
}

function cachedTimetable() {
  try {
    const m = JSON.parse(sessionStorage.getItem(TT_CACHE) || 'null');
    return (m && m.days && m.rows && m.rows.length) ? m : null;
  } catch (e) { return null; }
}

function ttStale() {
  try { return sessionStorage.getItem(TT_STALE) === '1'; }
  catch (e) { return false; }
}
function setTtStale(on) {
  try {
    if (on) sessionStorage.setItem(TT_STALE, '1');
    else sessionStorage.removeItem(TT_STALE);
  } catch (e) {}
}

// Blur the window and lay the "go refresh" notice over the grid. Idempotent,
// so a second 预选 while it is already blurred does not stack a second layer.
function applyTimetableStale(win) {
  if (!win || win.querySelector('.pku-tt-stale')) return;
  win.classList.add('pku-tt--stale');
  const overlay = document.createElement('div');
  overlay.className = 'pku-tt-stale';
  const main = document.createElement('div');
  main.className = 'pku-tt-stale-main';
  main.textContent = '请前往选课结果界面刷新课程表。';
  const sub = document.createElement('div');
  sub.className = 'pku-tt-stale-sub';
  sub.textContent = '受限于网站设计，只有跳转至选课结果界面才能读取课程表，保证课程表准确性。';
  overlay.append(main, sub);
  const body = win.querySelector('.pku-tt-body');
  if (body) body.appendChild(overlay);
}

// A 预选 has gone through: flag the timetable stale and blur it right away.
function markTimetableStale() {
  setTtStale(true);
  applyTimetableStale(document.querySelector('.pku-tt'));
}

// 选课结果's own URL, taken from the site's menu rather than guessed.
function resultsUrl() {
  const a = [...document.querySelectorAll('a[href]')]
    .find((el) => /showResults/i.test(el.getAttribute('href') || ''));
  return a ? a.href : null;
}

// Open where the timetable is what you are working against: choosing courses
// to add to the plan, and ordering 预选. Everywhere else it waits, folded.
function timetableStartsOpen() {
  return /courseQuery|electiveWork/i.test(location.href);
}

function mountTimetable(model) {
  if (!model || document.querySelector('.pku-tt')) return false;
  document.body.appendChild(renderTimetable(model, timetableStartsOpen()));
  requestAnimationFrame(() => {
    const grid = document.querySelector('.pku-tt-grid');
    if (grid) fitTimetable(grid);
  });
  return true;
}

function buildTimetable() {
  if (document.querySelector('.pku-tt')) return false;

  // This page has the real thing: read it and cache it for the others. It
  // is left in place rather than replaced -- buildTimetableHead has already
  // given it a section title and hung the 导出 link off it, so pulling the
  // table out would strand both. On its own page the inline table is the
  // better view anyway; the window is here, folded, like everywhere else.
  const src = document.querySelector('table#classAssignment');
  if (src) {
    const model = readTimetable(src);
    if (!model) return false;
    cacheTimetable(model);
    setTtStale(false);   // the real table was just read: it is fresh again
    return mountTimetable(model);
  }

  const cached = cachedTimetable();
  if (cached) return mountTimetable(cached);

  // nothing to hand: pull 选课结果 in the background and mount when it lands
  const url = resultsUrl();
  if (!url) return false;
  fetch(url, { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table#classAssignment');
      const model = table && readTimetable(table);
      if (!model) return;
      cacheTimetable(model);
      mountTimetable(model);
    })
    .catch(() => {});
  return 'fetching';
}

// ---- course query page ----
// The page's own script clears 课程号 / 课程名 / 上课时间 every time a course
// type is picked: chgConExpDep is bound to the change of every radio. The
// type and the search terms are independent, so that wipes work for no
// reason. Snapshot the fields before its handler runs -- a capture listener
// beats the jQuery ones bound to the radios themselves -- and put them back
// after. 清空条件 is left alone: clearing is exactly what that button is for.
const Q_TEXT = ['courseID', 'courseName'];
const Q_SEL = ['courseDay', 'courseTime'];

function keepQueryFields() {
  // Bound to the FORM, not to #kcfl: buildQueryForm lifts the radios out of
  // that cell into the segmented selector, and a listener left on the cell
  // would stop hearing them.
  const form = document.getElementById('qyForm');
  if (!form || !document.getElementById('kcfl')) return false;

  const snap = () => ({
    text: Q_TEXT.map((id) => (document.getElementById(id) || {}).value || ''),
    sel: Q_SEL.map((id) => (document.getElementById(id) || {}).value || ''),
  });
  const restore = (was) => {
    Q_TEXT.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el && !el.value && was.text[i]) el.value = was.text[i];
    });
    Q_SEL.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el || el.value || !was.sel[i]) return;
      // selectize owns the <select>, so go through it or its own box, which
      // is what is actually on screen, would keep showing 请选择
      if (el.selectize) el.selectize.setValue(was.sel[i], true);
      else el.value = was.sel[i];
    });
  };

  form.addEventListener('change', (e) => {
    if (!e.target || e.target.type !== 'radio') return;
    const was = snap();
    setTimeout(() => restore(was), 0);
  }, true);
  return true;
}

// Search without being asked: shortly after typing stops, and at once when a
// filter moves -- but a filter only re-runs a search that is already showing
// something, so the first search stays the user's own decision.
function wireQueryAutoSearch() {
  const form = document.getElementById('qyForm');
  const go = document.getElementById('b_query');
  if (!form || !go) return false;

  const val = (id) => ((document.getElementById(id) || {}).value || '').trim();
  // the site's own precondition: a type picked and one starred field filled.
  // Firing without it would raise the page's alert instead of searching.
  const ready = () => !!form.querySelector('input[type=radio]:checked')
    && !!(val('courseID') || val('courseName') || val('deptID'));
  let typed = 0;
  const fire = () => { if (ready()) go.click(); };

  Q_TEXT.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      clearTimeout(typed);
      typed = setTimeout(fire, 500);
    });
  });

  // Every filter re-runs the search, whether or not anything is on screen
  // yet -- changing a filter IS the request. Only `ready` holds it back, and
  // only because firing without it raises the page's own alert.
  ['deptID'].concat(Q_SEL).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', fire);
  });
  // on the form rather than #kcfl, whose radios buildQueryForm moves out,
  // and queued so it lands after the search terms have been put back
  form.addEventListener('change', (e) => {
    if (e.target && e.target.type === 'radio') setTimeout(fire, 0);
  });
  return true;
}

// ---- course query form ----
// Everything here MOVES the page's own controls rather than rebuilding them:
// they are what the form submits, and the site's scripts hold references to
// them by id. The nested layout tables they came out of are hidden behind
// the new block.

function buildQueryForm() {
  const form = document.getElementById('qyForm');
  const types = document.getElementById('kcfl');
  if (!form || !types) return false;
  if (form.querySelector('.pku-qtypes')) return false;

  // Only the course type is rebuilt. The filters below keep the page's own
  // one-line layout and its own dropdowns: they already read the way they
  // should, and driving selectize from a stand-in only added a second thing
  // that could disagree with the value the form actually submits.
  const shell = document.createElement('div');
  shell.className = 'pku-qform';

  const seg = document.createElement('div');
  seg.className = 'pku-qtypes';
  seg.setAttribute('role', 'radiogroup');
  const radios = [...types.querySelectorAll('input[type=radio]')];
  radios.forEach((radio) => {
    const label = document.createElement('label');
    label.className = 'pku-qtype';
    const cap = radio.nextElementSibling;
    const text = (cap && cap.tagName === 'SPAN') ? cap.textContent.trim() : radio.value;
    label.appendChild(radio);                      // moved, handlers intact
    const name = document.createElement('span');
    name.textContent = text;
    label.appendChild(name);
    if (cap && cap.tagName === 'SPAN') cap.remove();
    seg.appendChild(label);
  });
  // they are radios, so exclusivity is the browser's; this only paints it
  const paint = () => radios.forEach((r) =>
    r.parentElement.classList.toggle('pku-qtype--on', r.checked));
  seg.addEventListener('change', paint);
  seg.addEventListener('click', () => setTimeout(paint, 0));
  paint();

  shell.appendChild(seg);
  form.prepend(shell);

  // the cell the radios came out of is empty now; the table around it holds
  // nothing else, so it goes rather than leaving a blank strip
  const table = types.closest('table');
  if (table && !table.contains(shell)) table.style.display = 'none';
  // the selectize demo script's leftovers, never part of the site
  document.querySelectorAll('.theme-selector').forEach((el) => el.remove());
  return true;
}

// ---- background 预选 / 意愿值 ----
// The site's 预选 link navigates away (electCourse.do -> redirect), which drops
// the reskin's filters/folds and flickers. Intercept it: run the site's own
// validation (setEleHref), then fetch the URL in the background and fold the
// result back in place. 意愿值 修改 already posts via $.ajax; wrapping it only
// keeps the visible tally in sync.
function wireActions() {
  if (typeof window.setEleHref === 'function') {
    const orig = window.setEleHref;
    window.setEleHref = function (herfAdd, tagIdEle, courseName, classNo, index, seqNo) {
      const ok = orig.apply(this, arguments);
      if (ok) {
        // the user confirmed the 预选: the taken list is about to change, so
        // the floating timetable's clash/credit marks go stale
        markTimetableStale();
        setLastOpCourse(courseName);
        clearPin();               // 预选 resets the pinned-course preference
        runElect(herfAdd.href);   // setEleHref appended &random before returning true
      }
      return false;               // never navigate away
    };
  }
  if (typeof window.resetRandom === 'function') {
    const orig = window.resetRandom;
    window.resetRandom = function () {
      orig.apply(this, arguments);   // sync $.ajax: the DOM is already updated
      syncCreditInfo();
    };
  }
  // 取消 (unselect) is a bare link gated by confirmCancel(), which is not a
  // global we can wrap as reliably as setEleHref. Catch the click after the
  // inline handler has run: if the default navigation was NOT prevented, the
  // dialog was accepted and the taken list is about to change. A cancelled
  // dialog returns false and prevents the navigation, so it is skipped.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest
      ? e.target.closest('a[href*="cancelCourse.do"]') : null;
    if (a && !e.defaultPrevented) markTimetableStale();
  });
}

function runElect(url) {
  fetch(url, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then((html) => applyElectResult(new DOMParser().parseFromString(html, 'text/html')))
    .catch((e) => {
      console.warn('[Beautiful PKU Elective] 预选 request failed; falling back to navigation:', e);
      location.assign(url);
    });
}

function applyElectResult(doc) {
  // 1. read the fresh tally straight from the response, and re-surface it
  readCreditInfo(doc);
  reinsertRemainRandom();
  syncCreditInfo();

  // 2. swap in the updated 已选列表 (the toolbar only references grid[0], so
  //    replacing the second grid is safe), then rebuild its pager
  refreshElectedGrid(doc);
  buildPager();
  reinsertRemainRandom();
  syncCreditInfo();

  // 3. the operation's own notice -- a failure names the course, a success
  //    confirms it -- resurfaced as a card. (true = only errors/successes,
  //    not the informational warnings the page repeats on every load.)
  const cards = collectNoticeCards(doc, true);
  if (cards.length) {
    const anchor = document.querySelector('.pku-notice:last-of-type')
      || document.querySelector('.pku-hero')
      || document.querySelector('.pku-header');
    const frag = document.createDocumentFragment();
    cards.forEach((c) => frag.appendChild(c));
    if (anchor) anchor.after(frag); else document.body.prepend(frag);
  }

  // 4. re-mark clash/credit now that the taken list changed
  document.querySelectorAll('.pku-toolbar').forEach((bar) => {
    bar.dispatchEvent(new Event('pku-refilter'));
  });
}

function refreshElectedGrid(doc) {
  const live = [...document.querySelectorAll('table.datagrid')];
  const fresh = [...doc.querySelectorAll('table.datagrid')];
  if (live.length < 2 || fresh.length < 2) return;
  const liveGrid = live[1];
  const freshGrid = fresh[1];
  if (!liveGrid.parentNode) return;
  const imported = document.importNode(freshGrid, true);
  liveGrid.parentNode.replaceChild(imported, liveGrid);
  try {
    enhanceGrid(imported, { fold: false, groupRules: true });
  } catch (e) {
    console.warn('[Beautiful PKU Elective] 已选列表 refresh failed:', e);
  }
}

// The course name a 第N页 jump pinned to the first row, until the user touches
// the search/filter again.
let PINNED_NAME = null;

// Re-sort the grid's rows back into the natural (name-sorted) order recorded
// at load. Footer/pager rows stay last; the header row is never moved.
function restoreNaturalOrder(grid) {
  const model = GRID_MODEL.get(grid);
  if (!model) return;
  const order = model.rows.slice().sort((a, b) => (a.nat ?? 0) - (b.nat ?? 0));
  const first = order.find((r) => r.tr.isConnected);
  if (!first) { model.rows = order; return; }
  const parent = first.tr.parentNode;
  const dataSet = new Set(model.rows.map((r) => r.tr));
  const tailRows = [...parent.children]
    .filter((tr) => !dataSet.has(tr) && !tr.querySelector('th'));
  order.forEach((r) => parent.appendChild(r.tr));
  tailRows.forEach((tr) => parent.appendChild(tr));
  model.rows = order;
  restripe(model);
}

function clearPin() {
  if (!PINNED_NAME) return;
  PINNED_NAME = null;
  document.querySelectorAll('table.datagrid').forEach(restoreNaturalOrder);
}

// Move the named course's row to the very first data row of the list, and keep
// the row model in the same order so the zebra striping stays correct.
function pinCourse(name) {
  if (!name) return;
  const norm = (s) => (s || '').replace(/[\s ]+/g, '').trim();
  const grid = document.querySelector('table.datagrid');
  if (!grid) return;
  const model = GRID_MODEL.get(grid);
  const target = model ? model.rows.find((r) => {
    const cell = r.tr.querySelector('.pku-col-name .pku-cell');
    return cell && norm(cell.textContent) === norm(name) && !r.hiddenByFilter;
  }) : null;
  if (!target) return;
  const idx = model.rows.indexOf(target);
  if (idx > 0) { model.rows.splice(idx, 1); model.rows.unshift(target); }
  const header = grid.querySelector('tr.pku-head-row');
  if (header) header.after(target.tr);
  else target.tr.parentNode.insertBefore(target.tr, target.tr.parentNode.firstChild);
  restripe(model);
}

// Land on the list, right where the sticky title starts sticking under the
// header, rather than the page top.
function scrollToList() {
  const title = document.querySelector('.pku-section-headline');
  if (!title) return;
  const nav = document.querySelector('.pku-nav');
  const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
  const top = title.getBoundingClientRect().top + window.scrollY - navH - 4;
  window.scrollTo(0, Math.max(0, top));
}

// Re-applies a page-jump intent: keep the search field, pin the clicked course
// on top (overriding any ranking), and scroll to the list.
function restoreNav(nav) {
  if (!nav) return;
  if (nav.q) {
    const input = document.getElementById('pku-course-search');
    if (input) input.value = nav.q;
    document.querySelectorAll('.pku-toolbar').forEach((bar) => {
      bar.dispatchEvent(new Event('pku-refilter'));
    });
  }
  if (nav.pin) {
    PINNED_NAME = nav.pin;
    pinCourse(nav.pin);
  }
  scrollToList();
}

function buildPage() {
  buildHeader();
  removeNoteLine();
  // a page reload after 预选 must still name the course in the error box
  try { LAST_OP_COURSE = sessionStorage.getItem('pku-last-op-course') || null; } catch (e) {}
  const nav = takeNavState();
  // if this navigates, the page reloads with every row and runs again
  // NOTE: the all-rows redirect is disabled on purpose -- it interfered with
  // the site's own pager. Paging is left exactly as the site does it; flip
  // MERGE_PAGES to re-enable the single-page load.
  if (MERGE_PAGES && requestAllRows()) return;
  const hero = buildHero();
  const notices = buildNotices();
  consumeLastOpCourse();   // the error box (if any) has used the name

  if (hero || notices.length) {
    // insert after the header so the reskinned blocks lead the page
    const anchor = document.querySelector('.pku-header');
    const frag = document.createDocumentFragment();
    if (hero) frag.appendChild(hero);
    notices.forEach((card) => frag.appendChild(card));
    if (anchor) anchor.after(frag); else document.body.prepend(frag);
  }

  let folds = 0;
  // 选课结果 is a read-only record, so it uses the plain grid: no folding.
  // Elsewhere the first list folds (预选's 可选列表, 维护选课计划's 选课计划列表)
  // and any later list on the page shows every row.
  const url = location.pathname + location.search;
  const foldable = !/showResults/.test(url);
  document.querySelectorAll('table.datagrid').forEach((grid, i) => {
    const opts = { fold: foldable && i === 0, groupRules: true };
    try { folds += enhanceGrid(grid, opts); }
    catch (e) { console.warn('[Beautiful PKU Elective] grid skipped:', e); }
  });

  readCreditInfo();
  snapshotPager();
  const pagers = buildPager();
  reinsertRemainRandom();
  buildFooter();

  const sections = buildSectionHeads();
  buildTimetableHead();
  markNoTitleGrids();

  // 状态's 冲突 test needs the already-selected grid modelled too, so the
  // first pass runs only once every grid has been through enhanceGrid AND the
  // toolbar that owns the run() handler has been built by buildSectionHeads.
  document.querySelectorAll('.pku-toolbar').forEach((bar) => {
    bar.dispatchEvent(new Event('pku-refilter'));
  });

  // pages with plan links but no list title still get the styled buttons,
  // standing on their own rather than inside a section head
  if (!sections.tookActions) {
    const links = takePlanLinks();
    if (links.length) {
      const host = document.createElement('div');
      host.className = 'pku-section-head pku-section-head--bare';
      const row = document.createElement('div');
      row.className = 'pku-actions-row';
      links.forEach((a) => { a.className = 'pku-btn'; row.appendChild(a); });
      host.appendChild(row);
      const after = document.querySelector('.pku-notice:last-of-type')
        || document.querySelector('.pku-hero');
      if (after) after.after(host);
    }
  }

  trackStickyOffsets();
  keepQueryFields();
  buildQueryForm();
  wireQueryAutoSearch();
  const timetable = buildTimetable();
  wireActions();
  restoreNav(nav);

  console.log('[Beautiful PKU Elective] hero =', !!hero, '; notices =', notices.length,
    '; sections =', sections.built, '; fold controls =', folds,
    '; pager =', pagers, '; timetable =', timetable);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildPage);
} else {
  buildPage();
}

// ele.js is loaded at the very end of the document, so it attaches its
// yellow-hover handlers after buildPage has run. Clear them once more when
// the page is fully loaded.
addEventListener('load', () => {
  document.querySelectorAll('table.datagrid tr.pku-row')
    .forEach(dropLegacyRowStyling);
});
