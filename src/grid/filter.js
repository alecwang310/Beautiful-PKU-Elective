// ---- filtering ----
// Decides which rows match the toolbar's state, marks clashes/credit overruns,
// and applies the result to a grid (hide non-matches, restripe, re-hang folds).

import { STATUS_GROUPS, DAY_NAMES, SEARCH_PAGE_SIZE } from '../config.js';
import { slotsClash } from '../utils/table.js';
import { state as appState, pagerState } from '../state.js';
import { clearFold } from './fold.js';

export function rowMatches(r, state, taken) {
  if (state.q) {
    const terms = state.q.split(/\s+/).filter(Boolean);
    if (!terms.every((t) => r.q.includes(t))) return false;
  }

  for (const [key, chosen] of Object.entries(state.facets)) {
    if (!chosen.length) continue;                 
    if (key === '状态') {
      for (const group of STATUS_GROUPS) {
        const picked = group.filter((opt) => chosen.includes(opt));
        if (!picked.length) continue;
        if (!picked.some((opt) => statusMatches(r, opt, taken))) return false;
      }
    } else if (!chosen.includes(r.facets[key])) {
      return false;
    }
  }
  return true;
}

function statusMatches(r, opt, taken) {
  switch (opt) {
    case '已满': return !!r.cap && r.cap.taken >= r.cap.limit;
    case '未满': return !!r.cap && r.cap.taken < r.cap.limit;
    case '冲突': return clashesWithTaken(r, taken);
    case '不冲突': return !clashesWithTaken(r, taken);
    default: return true;
  }
}

export function fmtCredit(n) {
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
export function takenCredits() {
  const grids = [...document.querySelectorAll('table.datagrid')];
  let sum = 0;
  grids.slice(1).forEach((g) => {
    const m = appState.gridModel.get(g);
    if (m) m.rows.forEach((r) => { if (!r.foreign) sum += r.credit || 0; });
  });
  return sum;
}

// Slots of every already-selected course, gathered from the second grid.
export function takenSlots() {
  const grids = [...document.querySelectorAll('table.datagrid')];
  const out = [];
  grids.slice(1).forEach((g) => {
    const m = appState.gridModel.get(g);
    if (m) m.rows.forEach((r) => out.push(...r.slots));
  });
  return out;
}

// Applies the current state to a grid: hides rows that do not match, then
// rebuilds the name groups over what is left so zebra striping, the thick
// rules and the fold controls all describe the visible table.
export function applyFilter(grid, state) {
  const model = appState.gridModel.get(grid);
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

  // Client-side pagination over the matching rows, in their (already
  // name-sorted) order: show only the 20 on the current search page.
  //
  // This belongs to searching ONLY. A search reaches across the cross-page
  // cache, so its results need a pager of their own; with no search running,
  // the rows in the grid are exactly the ones the server chose to send and
  // the site's own paging already decided how many that is. Slicing them too
  // would cap every list at 20 -- including 维护选课计划, which ships its whole
  // plan in one page and has no pager to walk past the cap with.
  // A list with no pager (nothing for setSearchPager to repurpose) also gets
  // every match: paging it would hide results behind controls that are not
  // on the page.
  const paged = filtering && !!pagerState.pagerCtl;
  const pageStart = pagerState.searchPage * SEARCH_PAGE_SIZE;
  const onPage = new Set(paged
    ? matching.slice(pageStart, pageStart + SEARCH_PAGE_SIZE)
    : matching);
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
export function restripe(model) {
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
