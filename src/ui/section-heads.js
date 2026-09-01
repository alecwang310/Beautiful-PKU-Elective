// ---- section heads + sticky offsets ----
import { creditInfoText } from '../utils/table.js';
import { buildToolbar } from './toolbar.js';

// The site renders each list as:
//   <tr><td> <img arrow> <font class=subTitle>TITLE</font>
//            <span class=errmsg>NOTE</span> </td></tr>
//   <tr><td> <table class=datagrid> … </table> </td></tr>
// Rebuild that as one flex head and move it into the grid's own cell, so it
// sticks only for the length of its table.
export function buildSectionHeads() {
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
export function buildTimetableHead() {
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
export function markNoTitleGrids() {
  document.querySelectorAll('table.datagrid').forEach((grid) => {
    const cell = grid.closest('td, th');
    const hasTitle = cell && cell.querySelector('.pku-section-headline');
    if (!hasTitle) grid.classList.add('pku-no-title');
  });
}

// The heads pin below the nav, whose height differs per breakpoint, so it is
// measured instead of hardcoded. Two sticky offsets, both measured rather than
// hardcoded: the title strip pins under the nav, and the grid's column headers
// pin under the title strip. This re-runs on resize.
export function trackStickyOffsets() {
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
