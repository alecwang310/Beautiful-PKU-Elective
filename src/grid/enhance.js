// ---- grid enhancement ----
// Turns one site grid into the reskinned table
// Sort by name
// Split 上课/考试信息 into 上课/考试信息 + 备注, 
// Fold 上课/考试信息，备注，年级，P/NP列 into a scrolling pane,
// Size the columns, and allow rows with the same class name to fold.
// Build the row model that state.gridModel presents.

import { COL, NOTE_HEAD, findCol } from '../config.js';
import {
  headerCells, headText, cellText, parseInfoCell, captureRowModel,
  dropLegacyRowStyling,
} from '../utils/table.js';
import { foldButton, lockCellHeights, markFolded, animateRows } from './fold.js';
import {
  measureColumns, collapseScrollColumns, syncScrollPanes, assignColumnWidths,
  onWidthChange,
} from './width.js';
import { state } from '../state.js';

export function enhanceGrid(grid, opts) {
  const { fold = false, groupRules = false } = opts || {};
  const head = headerCells(grid);
  if (!head) return 0;
  head.row.classList.add('pku-head-row');
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
  rows.forEach((r, n) => {
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
  // For resied windows
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
      // Here, we fix the row height even after the text changes to 已折叠, to avoid complex animation syncing
      // If anyone can resize the row height after text changes to 已折叠 with all the animations being smooth, 
      // they are very welcom to do so
      lockCellHeights(g.leader.tr);
      // only rows the filter is showing take part in the fold
      const live = g.rows.filter((r) => !r.hiddenByFilter);
      // Display 已折叠 the moment the fold starts, and only after unfold finishes
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
  state.gridModel.set(grid, {
    rows, groups, fold, grid,
    shape: { iInfo, iName, colCount, paneFirst, paneLast, paneWidths, paneOrder,
              labels: modelLabels },
  });

  return controls;
}
