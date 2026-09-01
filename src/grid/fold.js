// ---- fold ----
// Collapsing a name group: rows animate shut and the leader keeps a 已折叠
// mark over the columns whose values differ between them. Pure DOM
// manipulation -- it does not know about filtering or the row model.

import { FOLD_MS } from '../config.js';
import { chevron } from '../ui/dom.js';

// Freezes a row's cells at their current height, so later content changes
// cannot reflow it. Measured before anything is edited.
export function lockCellHeights(tr) {
  // Pin the cells themselves (not the .pku-cell wrappers) so the pin survives
  // markFolded's innerHTML swap to 已折叠 and the leader row does not jump. A
  // table cell's `height` acts as its minimum, so it keeps the row tall even
  // after the text inside shrinks to one line.
  [...tr.children].forEach((td) => {
    if (td.style.height) return;   // already pinned
    td.style.height = td.getBoundingClientRect().height + 'px';
  });
}

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
export function clearFold(tr) {
  tr.classList.remove('pku-fold', 'pku-fold--anim', 'pku-fold--shut');
  [...tr.children].forEach((td) => {
    const box = foldBox(td);
    if (box) box.style.removeProperty('height');
  });
}

export function animateRows(rows, folded, onDone) {
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
export function foldButton() {
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
export function markFolded(leader, hiddenRows) {
  const row = leader.tr;
  row.querySelectorAll('[data-pku-orig]').forEach((cell) => {
    cell.innerHTML = cell.getAttribute('data-pku-orig');
    cell.removeAttribute('data-pku-orig');
  });
  if (!hiddenRows.length) return;

  const norm = (el) => el.textContent.replace(/[\s ]+/g, " ").trim();
  const mark = (cell, others, force) => {
    const base = norm(cell);
    if (!force && !others.some((o) => o && norm(o) !== base)) return;
    cell.setAttribute("data-pku-orig", cell.innerHTML);
    cell.innerHTML = '<span class="pku-cell pku-folded-mark">已折叠</span>';
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
