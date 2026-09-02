// ---- Beautiful PKU Elective: entry ----
// Bootstrap only. Every feature lives in its own module; this file injects
// the stylesheet and orchestrates the build for the current page.

import {
  Root, Title, NavMenu, PageHero, Noticies,
  SectionHeads, Toolbar, CourseQuery, FilterToggle, Cache, Chevron,
  FilterPanel, Footer, Pager, Grid, Warnings, Fold, Timetable, ErrorPage,
} from './static/layout.js';

const STYLES = [
  Root, Title, NavMenu, PageHero, Noticies,
  SectionHeads, Toolbar, CourseQuery, FilterToggle, Cache, Chevron,
  FilterPanel, Footer, Pager, Grid, Warnings, Fold, Timetable, ErrorPage,
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
import { isBlocked, kickedDocument, markBlocked } from './utils/net.js';
import { buildErrorPage } from './ui/error-page.js';
import { markTimetableStale } from './utils/timetable.js';

// ---- when the site stops answering ----
// The gate in utils/net.js shuts the moment a background read comes back as a
// login page or a 限流 notice, and says so here. Without this the script would
// just quietly stop filling the search and the timetable, and the reason (the
// session is gone -- the site wants a fresh login) would only be visible in
// the console.
let blockedShown = false;
function showBlockedNotice(why) {
  if (blockedShown || document.querySelector('.pku-notice--blocked')) return;
  // the 系统提示 page already says it, larger and on its own
  if (document.querySelector('.pku-err')) return;
  blockedShown = true;
  const card = document.createElement('div');
  card.className = 'pku-notice pku-notice--error pku-notice--blocked';
  const head = document.createElement('div');
  head.innerHTML = '<strong>' + (why || '选课网站拒绝了本脚本的后台请求') + '</strong>';
  const body = document.createElement('div');
  body.textContent = '本脚本已停止一切后台读取（跨页搜索缓存、课程表刷新），'
    + '页面本身不受影响。请重新登录选课网站；如果反复出现，可以先关闭本脚本再选课。';
  card.append(head, body);
  const anchor = document.querySelector('.pku-notice:last-of-type')
    || document.querySelector('.pku-hero')
    || document.querySelector('.pku-header');
  if (anchor) anchor.after(card); else document.body.prepend(card);
}
addEventListener('pku-blocked', (e) => showBlockedNotice(e.detail && e.detail.why));

// Phase one builds the top-of-page chrome -- header, title, notices -- and
// paints it immediately. Phase two (the grid reskin) is the heavy part: sorting
// rows, measuring columns, forced reflows. If it ran in the same task it would
// hold the chrome's paint back, so the title and notices would seem to lag.
function buildPage() {
  buildHeader();
  // The site's 系统提示 page: the session is gone and every link on it leads
  // back here until the user logs in again. There is no list to reskin and
  // nothing to read in the background -- asking for anything from here is both
  // useless and exactly what a script that has stopped noticing would do.
  if (kickedDocument()) {
    // the reskin first: it says the same thing in the page's own words, so the
    // blocked notice would only repeat it (showBlockedNotice steps aside)
    buildErrorPage();
    markBlocked('选课网站提示会话超时或尚未登录');
    // whatever the user logs back in as, the stored timetable was read under
    // the session that just ended: it comes back blurred, asking to be read
    // again
    markTimetableStale();
    return;
  }
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

  // Let the chrome paint on this frame, then reskin the grids on the next.
  requestAnimationFrame(() => requestAnimationFrame(buildPageContent));
}

function buildPageContent() {
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
  if (isBlocked()) showBlockedNotice();
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
