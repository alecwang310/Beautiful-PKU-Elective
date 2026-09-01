// ---- Beautiful PKU Elective: entry ----
// Bootstrap only. Every feature lives in its own module; this file injects
// the stylesheet and orchestrates the build for the current page.

import {
  Root, Title, NavMenu, PageHero, Noticies,
  SectionHeads, Toolbar, CourseQuery, FilterToggle, Cache, Chevron,
  FilterPanel, Footer, Pager, Grid, Warnings, Fold, Timetable,
} from './static/layout.js';

const STYLES = [
  Root, Title, NavMenu, PageHero, Noticies,
  SectionHeads, Toolbar, CourseQuery, FilterToggle, Cache, Chevron,
  FilterPanel, Footer, Pager, Grid, Warnings, Fold, Timetable,
].join('\n');

GM_addStyle(STYLES);

import { isResultsPage, isPlanPage } from './router.js';
import {readCreditInfo, reinsertRemainRandom,
  dropLegacyRowStyling,
} from './utils/table.js';
import { enhanceGrid } from './grid/enhance.js';
import { refilter } from './events.js';
import { buildPager } from './utils/pager.js';
import { snapshotPager, requestAllRows, dropPageCacheOnReentry } from './utils/cache.js';
import { buildHeader } from './ui/header.js';
import { buildHero } from './ui/hero.js';
import { buildNotices, removeNoteLine } from './ui/notices.js';
import { buildFooter } from './ui/footer.js';
import {
  buildSectionHeads, buildTimetableHead, markNoTitleGrids, trackStickyOffsets,
} from './ui/section-heads.js';
import { takePlanLinks } from './ui/toolbar.js';
import { keepQueryFields, buildQueryForm, wireQueryAutoSearch } from './utils/query.js';
import { buildTimetable } from './utils/timetable.js';
import { wireActions } from './utils/actions.js';

function buildPage() {
  buildHeader();
  removeNoteLine();
  // On 维护选课计划 the list should show every row on one page (no paging),
  // like the original site. requestAllRows redirects once to raise the page
  // size; when it returns true we return so the reloaded page re-runs.
  if (isPlanPage() && requestAllRows()) return;
  // Runs after the redirect above, so the recorded view is the one actually
  // shown. Coming back to a list from anywhere else drops its stored cross-page
  // cache, so the toolbar rebuilds it from scratch instead of reusing rows that
  // may have moved on while the user was away.
  dropPageCacheOnReentry();
  const hero = buildHero();
  const notices = buildNotices();

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
  const foldable = !isResultsPage();
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
  refilter();

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
