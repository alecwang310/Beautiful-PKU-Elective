// ---- column widths ----
// Sizing and the horizontally-scrolling "detail pane". Columns are measured in
// ems (a CJK glyph is ~1em, Latin ~0.55), the long tail of values is allowed
// to wrap, and a run of detail columns is merged into one nested table that
// scrolls while the identity/action columns stay put.

import {
  COL, COL_KEEP, COL_WIDE, COL_NARROW, COL_WIDE_K, COL_HEAD_K, COL_NOTE_K,
  COL_HOLD, SHORT_FIELD_MULTIPLY, COL_CODES, SCROLL_COLS, SCROLL_COL_EM,
  SCROLL_ORDER,
} from '../config.js';
import { headText } from '../utils/table.js';

// A CJK glyph occupies about a full em, Latin and digits about half, so text
// length in characters is a poor width proxy: 开课单位 needs roughly twice the
// room of a four-letter word. Measure in ems instead.
function textEm(str) {
  let em = 0;
  for (const ch of str) em += /[⺀-￯]/.test(ch) ? 1 : 0.55;
  return em;
}

// Merges the SCROLL_COLS cells of every row into one cell holding a nested
// table inside a scroller. The nested tables all use the same fixed column
// widths, so the columns still line up from row to row.
export function collapseScrollColumns(grid, headRow, bodyRows, measured) {
  const labels = [...headRow.children].map(headText);
  const wanted = labels.map((l) => SCROLL_COLS.includes(l));

  // Decide what to merge: there are a few targets, we take the longest cluster that is all next to each other 
  // to merge into one scrollable pane, and leave others fixed.
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
  // the 上课/考试时间 info leads, 年级 sits second-last just before 自选P/NP.
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
export function syncScrollPanes(grid) {
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
export function onWidthChange(fn) {
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
// there is no distribution to speak of, so we use the second longest entry
function keepEm(vals) {
  if (!vals.length) return 0;
  const v = vals.slice().sort((a, b) => a - b);
  if (v.length < 5) return v[Math.max(0, v.length - 2)];
  return v[Math.min(v.length - 1, Math.floor(COL_KEEP * v.length))];
}

// Measured while the header and the body cells still line up one-to-one --
// before the scrolling columns are merged into a single pane.
export function measureColumns(headRow, bodyRows) {
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
// wide one. A column stops at its own floor; 课程号 and entries shorter than 5%
// resists three times as hard, so less clipping for them.
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

export function assignColumnWidths(grid, headRow, measured, pane) {
  const cells = [...headRow.children];
  const fs = parseFloat(getComputedStyle(grid).fontSize) || 13;
  const padEm = 20 / fs;              // 10px of cell padding either side
  const px = grid.getBoundingClientRect().width
    || (grid.parentElement && grid.parentElement.clientWidth) || 0;
  if (!px || !measured) return;
  // A resize re-runs all of this.
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

  // We use this strategy: each column has its own min target: if any shrinking is needed, the scroll pane gets cut first, then, we
  // shrink the rows that haven't reached this min target, then after everything reached this
  // target, they all shrink together, and the shrink is weighed: long rows shrink more, some 
  // specific rows like 课程号 shrinks 3x less
  cols.forEach((c) => {
    c.hold = COL_HOLD[c.label] || 1;
    if (c.hold == 1 && c.w < COL_NARROW) { c.hold = SHORT_FIELD_MULTIPLY; }
    const W = c.w;                       // measured width, pre-reduction
    if (c.w > COL_WIDE * room) { c.w *= COL_WIDE_K; c.reduced = true; }
    c.full = c.w;
    // the floor is the width that fits on `target` lines (with 10% headroom);
    // a one-line column therefore refuses to shrink at all
    c.min = (W * 1.1) / (c.target || 1);
  });
  // the scrolling pane may shrink until its first column is fully in view -- past that
  // there is nothing left to read without scrolling, so we don't keep shrinking
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
