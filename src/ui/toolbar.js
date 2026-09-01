// ---- toolbar: search field, plan buttons, filter panel ----
import { FACETS, DEFAULT_CREDIT_LIMIT } from '../config.js';
import { isPlanPage } from '../router.js';
import { state as appState, pagerState } from '../state.js';
import { chevron } from './dom.js';
import { applyFilter, takenCredits, fmtCredit } from '../grid/filter.js';
import { setSearchPager } from '../utils/pager.js';
import { pagerPages, buildPageCache } from '../utils/cache.js';

// ---- plan action links ----
// The site ships these as attention.jpg + two links in their own row. The
// <a> nodes are returned for reuse as buttons -- MOVED by the caller, not
// cloned, so their hrefs and any handlers stay live -- and the icon row is
// dropped.
export function takePlanLinks() {
  const img = document.querySelector('img[src*="attention.jpg"]');
  const row = img && img.closest('tr');
  if (!row) return [];

  const links = [...row.querySelectorAll('a[href]')];
  if (!links.length) return [];

  links.forEach((a) => a.removeAttribute('style'));
  row.remove();          // detaches the row; links already referenced above
  return links;
}

// ---- filter option values, read from the grid itself ----
function columnValues(grid) {
  // Scoped to the OUTER table only. querySelectorAll would also return the
  // scrolling pane's nested table -- its rows have their own children, so
  // cells[idx] there lands on unrelated text (e.g. a 备注 string under
  // 课程类别). Rows and headers must come from the same level to line up.
  const outerRows = [...grid.rows].filter((tr) => !tr.closest('table.pku-inner'));
  const headRow = outerRows.find((tr) => tr.querySelector('th'));
  const heads = headRow
    ? [...headRow.children].map((th) => th.textContent.replace(/[\s ]+/g, '').trim())
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
      const v = cell.textContent.replace(/[\s ]+/g, ' ').trim();
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

export function buildToolbar(grid) {
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

  // credit ceiling (only where clash/credit marking happens — not on the
  // read-only 维护选课计划 page): editable, 25 by default
  const isPlan = isPlanPage();
  let cnum = null, ctally = null;
  if (!isPlan) {
    const climit = document.createElement('label');
    climit.className = 'pku-climit';
    climit.textContent = '学分上限 ';
    cnum = document.createElement('input');
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
    ctally = document.createElement('span');
    ctally.className = 'pku-climit-tally';
    srow.append(climit, ctally);
  }

  bar.appendChild(srow);

  if (!isPlan) {
    // legend under the search, before the buttons: explains the clash / credit
    // colours. The 50px gap below it comes from .pku-actions-row's padding-top.
    const legend = document.createElement('div');
    legend.className = 'pku-search-legend';
    legend.textContent =
      '红色代表该课程时间与已经预选课程时间冲突，黄色代表时间不冲突但选择后学分将超出学分上限。颜色仅做参考，请以点击预选后的信息提示为准';
    bar.appendChild(legend);
  }

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
    const lim = cnum ? parseFloat(cnum.value) : 0;
    return {
      q: input.value.trim().toLowerCase(),
      facets,
      creditLimit: isNaN(lim) || lim <= 0 ? 0 : lim,
    };
  };

  const run = () => {
    const filterState = readState();
    const matching = applyFilter(grid, filterState);
    const total = (appState.gridModel.get(grid) || { rows: [] }).rows.length;
    const filtering = filterState.q ||
      Object.values(filterState.facets).some((v) => v.length);
    count.textContent = filtering ? matching + ' / ' + total : '';

    // repurpose the built-in pager: server pages when the search is empty,
    // client-side 20-per-page search pages otherwise
    setSearchPager(filtering, matching);

    // running tally of what is already committed against the ceiling
    if (ctally) {
      const committed = takenCredits();
      ctally.textContent = '已选 ' + fmtCredit(committed) +
        (filterState.creditLimit ? ' / ' + fmtCredit(filterState.creditLimit) : '');
      ctally.classList.toggle('pku-climit-tally--over',
        !!filterState.creditLimit && committed > filterState.creditLimit);
    }
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
    clearTimeout(typeTimer);
    pagerState.searchPage = 0;   // a new search starts back on the first page
    typeTimer = setTimeout(run, 500);
  });
  // Enter applies at once rather than waiting out the delay
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(typeTimer); pagerState.searchPage = 0; run(); }
  });
  // changing the ceiling re-marks immediately and persists the new value
  if (cnum) cnum.addEventListener('input', () => {
    try { localStorage.setItem('pku-credit-limit', cnum.value); } catch (e) {}
    run();
  });
  // ticking a box applies immediately
  panel.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') { pagerState.searchPage = 0; run(); }
  });

  // clicking 重置筛选 clears every choice and the search box
  reset.addEventListener('click', () => {
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
