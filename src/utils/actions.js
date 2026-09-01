// ---- background 预选 / 意愿值 ----
// The site's 预选 link navigates away (electCourse.do -> redirect), which drops
// the reskin's filters/folds and flickers. Intercept it: run the site's own
// validation (setEleHref), then fetch the URL in the background and fold the
// result back in place. 意愿值 修改 already posts via $.ajax; wrapping it only
// keeps the visible tally in sync.

import { markTimetableStale } from './timetable.js';
import {
  readCreditInfo, reinsertRemainRandom, syncCreditInfo
} from './table.js';
import { collectNoticeCards } from '../ui/notices.js';
import { buildPager } from './pager.js';
import { enhanceGrid } from '../grid/enhance.js';
import { refilter } from '../events.js';

export function wireActions() {
  // setEleHref / resetRandom are defined by the site's own JS (ele.js), which
  // loads after this script runs. Wrap them once they exist — try now, then
  // again on load — so a 预选 still blurs the timetable even when the site's
  // functions are not defined yet at buildPage time.
  let eleWrapped = false;
  const wrapEle = () => {
    if (eleWrapped || typeof window.setEleHref !== 'function') return;
    eleWrapped = true;
    const orig = window.setEleHref;
    window.setEleHref = function (herfAdd, tagIdEle, courseName, classNo, index, seqNo) {
      const ok = orig.apply(this, arguments);
      if (ok) {
        // the user confirmed the 预选: the taken list is about to change, so
        // the floating timetable's clash/credit marks go stale
        markTimetableStale();
        runElect(herfAdd.href);   // setEleHref appended &random before returning true
      }
      return false;               // never navigate away
    };
  };
  let resetWrapped = false;
  const wrapReset = () => {
    if (resetWrapped || typeof window.resetRandom !== 'function') return;
    resetWrapped = true;
    const orig = window.resetRandom;
    window.resetRandom = function () {
      orig.apply(this, arguments);   // sync $.ajax: the DOM is already updated
      syncCreditInfo();
    };
  };
  wrapEle();
  wrapReset();
  addEventListener('load', () => { wrapEle(); wrapReset(); });

  // 预选 and 取消 are both plain links gated by an inline confirm handler
  // (setEleHref / confirmCancel). Wrapping those globals is not enough on its
  // own: a userscript that declares any @grant runs in a sandbox where
  // `window.setEleHref = …` writes into the SANDBOX, so the page's own inline
  // onclick keeps calling the untouched original and the wrap above never
  // fires. Catch the click after the inline handler has run instead: if the
  // default navigation was NOT prevented, the dialog was accepted and the
  // taken list is about to change. A cancelled dialog returns false, which
  // prevents the navigation, so it is skipped -- and so is a click the wrap
  // above did handle, since that returns false too (markTimetableStale is
  // idempotent either way).
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest
      ? e.target.closest('a[href*="cancelCourse.do"], a[href*="electCourse.do"]')
      : null;
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
  refilter();
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
