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

// ---- filter option values, read from the row MODEL ----
// Not from the grid's DOM: the cross-page cache adopts the rest of the list
// after the toolbar is built, so a DOM read would freeze the options at
// whatever the server happened to send for the page on screen. The model is
// where the cached rows land too, and captureRowValues has already pulled each
// row's facet values out of it (utils/table.js), so reading from there is both
// simpler and complete.
function facetValues(grid) {
  const model = appState.gridModel.get(grid);
  const out = {};
  FACETS.forEach(({ column }) => {
    if (!column) return;          // fixed-option facet, nothing to scan
    const seen = new Set();
    if (model) {
      model.rows.forEach((r) => {
        const v = r.facets && r.facets[column];
        if (v) seen.add(v);
      });
    }
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

  // Every facet is built once and then kept in step with the row model:
  // options are re-read as the cross-page cache lands, and each button carries
  // its own selection ("开课学院：马克思主义…") so the panel can stay closed.
  const facetCtl = [];

  const optionRow = (v) => {
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
    return li;
  };

  FACETS.forEach(({ label: name, column, options }) => {
    const facet = document.createElement('div');
    facet.className = 'pku-facet';
    facet.dataset.facetKey = column || name;   // 状态 has no column

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pku-facet-btn';
    btn.setAttribute('aria-expanded', 'false');
    const bText = document.createElement('span');
    bText.className = 'pku-facet-name';
    bText.textContent = name;
    const bChev = chevron();
    btn.append(bText, bChev);

    const listWrap = document.createElement('div');
    listWrap.className = 'pku-facet-list';
    const list = document.createElement('ul');
    list.className = 'pku-facet-opts';
    (options || []).forEach((v) => list.appendChild(optionRow(v)));

    listWrap.appendChild(list);
    facet.append(btn, listWrap);
    panel.appendChild(facet);
    // a facet whose options are read from the rows starts empty and is filled
    // by syncFacets below; one with a fixed list is already complete
    facet.hidden = !options;
    facetCtl.push({ facet, btn, bText, list, name, column, fixed: !!options });

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

  // Re-reads the option lists from the row model, keeping whatever is ticked.
  // Called once at build time and again every time cached rows arrive, so a
  // 开课学院 that only appears on page 3 is offered as soon as page 3 is here.
  const syncFacets = () => {
    const values = grid ? facetValues(grid) : {};
    facetCtl.forEach((f) => {
      if (f.fixed) return;
      const want = values[f.column] || [];
      const have = [...f.list.querySelectorAll('input[type="checkbox"]')];
      if (have.length === want.length &&
          have.every((cb, i) => cb.value === want[i])) return;
      const on = new Set(have.filter((cb) => cb.checked).map((cb) => cb.value));
      f.list.textContent = '';
      want.forEach((v) => {
        const li = optionRow(v);
        if (on.has(v)) li.querySelector('input').checked = true;
        f.list.appendChild(li);
      });
      f.facet.hidden = !want.length;
    });
  };

  // The closed button says what the facet is filtering on, and turns blue while
  // it is filtering anything -- the panel spends most of its life shut, so the
  // state has to be readable from the button alone.
  const paintFacets = () => {
    facetCtl.forEach((f) => {
      const on = [...f.list.querySelectorAll('input[type="checkbox"]')]
        .filter((cb) => cb.checked).map((cb) => cb.value);
      f.facet.classList.toggle('pku-facet--on', on.length > 0);
      f.bText.textContent = on.length ? f.name + '：' + on.join('、') : f.name;
      f.btn.title = on.length ? f.name + '：' + on.join('、') : '';
    });
  };

  syncFacets();   // the rows the server sent; the cache adds to them later

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
  // One segment per server page, filled as that page lands. The reads are
  // paced by the gate and arrive a second or two apart, so this is a real
  // measure of a real wait -- which is exactly when a progress bar earns its
  // place.
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
    paintFacets();
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
  // arrive progressively and the current filter is re-applied as they land --
  // and so are the filter options, which grow with them.
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
    cacheLabel.textContent = st.blocked ? '缓存已暂停（网站限流）'
      : done ? '缓存建立成功'
      : st.pages.some((x) => x === 'error') ? '部分页面读取失败'
      : '正在建立缓存';
    cache.classList.toggle('pku-cache--done', done);
    cache.classList.toggle('pku-cache--err', !!st.blocked);
    syncFacets();
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
