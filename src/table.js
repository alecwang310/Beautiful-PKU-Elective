// ---- grid: one flat table, sorted by name, foldable by name ----
// Zebra striping is assigned once, over the sorted-and-unfolded order, and
// never recomputed, so folding never restripes the table.
// Column headers vary by page: 预选 says 课程名 / 上课/考试信息, while
// 维护选课计划 says 课程名称 / 上课时间. Each entry lists the aliases to try.
// This is used to split out 备注 and affects layout calculation.

// ---- credit / willingness tally, shown beside each 预选 list title ----
// The values come from the 已选列表 footer (当前已选总学分 and 剩余意愿值), which
// buildPager() removes, so they are read up front and re-surfaced in the titles.
let CREDIT_INFO = null;     // { credit: string|null, remain: string|null }
let LAST_OP_COURSE = null;  // name of the course just operated on (for errors like time collisions, so the user can see which course just had a collision) 

export const COL = {
  id: ['课程号'],
  name: ['课程名', '课程名称'],
  teacher: ['教师'],
  info: ['上课/考试信息', '上课时间', '教室信息'],
  note: ['备注'],
};

export const NOTE_HEAD = '备注';

export const FILTER_COLS = {
  '课程类别': ['课程类别'],
  '学分': ['学分'],
  '开课单位': ['开课单位'],
};

export const DEFAULT_CREDIT_LIMIT = 25;

export function findCol(labels, aliases) {
  for (const a of aliases) {
    const i = labels.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}
// Reads the 上课/考试信息 cell's lines, honouring its <br> separators rather
// than collapsing them into one run of text.
function infoLines(cell) {
  if (!cell) return [];
  return (cell.innerHTML || '')
    .split(/<br\s*\/?>/i)
    .map((frag) => {
      // run each line through a detached node so HTML entities decode the
      // way the browser already decoded them in the live DOM -- stripping
      // tags off the raw string leaves "&amp;" (and friends) as literal glyphs
      const box = document.createElement("div");
      box.innerHTML = frag;
      return box.textContent.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

// Meeting lines sort by day then start period, earliest in the week first.
// Lines parseSlots cannot read (e.g. a bare note) fall to the bottom, keeping
// their relative order.
function byWeek(a, b) {
  const sa = parseSlots(a)[0], sb = parseSlots(b)[0];
  if (sa && sb) {
    if (sa.day !== sb.day) return sa.day - sb.day;
    if (sa.from !== sb.from) return sa.from - sb.from;
    return 0;
  }
  if (sa) return -1;
  if (sb) return 1;
  return 0;
}

// Splits the 上课/考试信息 cell into: sorted class-meeting lines with the exam
// line appended underneath (each on its own <br> line), and the 备注. The 备注
// runs from its 备注： marker to the end of the line, so an unclosed paren or
// quote (a server typo) cannot swallow the rest of the cell.
export function parseInfoCell(cell) {
  const lines = infoLines(cell);
  const cls = [];
  const examLines = [];
  const notes = [];
  for (const line of lines) {
    if (/考试(?:时间|方式)/.test(line)) {
      const cleaned = line.replace(/[；;]\s*$/, '').trim();
      if (cleaned) examLines.push(cleaned);
      continue;
    }
    const ni = line.search(/[(（]\s*备注\s*[:：]?/);
    if (ni >= 0) {
      let note = line.slice(ni)
        .replace(/^[(（]\s*备注\s*[:：]?\s*/, '')
        .replace(/[)）]+$/g, '').trim();
      if (note) notes.push(note);
      const rest = line.slice(0, ni).trim();
      if (rest) cls.push(rest);
      continue;
    }
    cls.push(line);
  }
  cls.sort(byWeek);
  return { time: [...cls, ...examLines].join('<br>'), note: notes.join('；') };
}

export function headerCells(grid) {
  const row = grid.querySelector('tr.datagrid-header') || grid.querySelector('tr:has(th)');
  return row ? { row, cells: [...row.children] } : null;
}

export function headText(th) {
  return th.textContent.replace(/[\s ]+/g, '').trim();
}

export function cellText(row, i) {
  const c = i >= 0 && row.children[i];
  return c ? c.textContent.replace(/[\s ]+/g, ' ').trim() : '';
}

// ele.js (the js script the website has) swaps a row's className to datagrid-all on mouseover, which paints
// it yellow-green. Those handlers are dropped so hover is ours alone.
export function dropLegacyRowStyling(row) {
  row.onmouseover = null;
  row.onmouseout = null;
  row.classList.remove('datagrid-even', 'datagrid-odd', 'datagrid-all');
  row.removeAttribute('bgcolor');
  [...row.children].forEach((c) => {
    c.classList.remove('datagrid', 'gridStyle-tr-data', 'gridStyle-tr-alt-data');
    c.removeAttribute('bgcolor');
    c.style.removeProperty('background-color');
  });
}

// opts.fold      - group rows by course name behind a fold control
// opts.groupRules - draw a rule where the course name changes
// The 已选列表 grid takes the plain defaults: no folding, ordinary row
// separators only.
// ---- row model, for search and filtering ----
// Meeting slots, used for conflict detection. Rooms are skipped because a
// room number runs straight into the next week range ("一教101" + "1~16周").
function parseSlots(text) {
  const t = text.replace(/[\s\u00a0]+/g, '');
  const DAYS = '一二三四五六日';
  return [...t.matchAll(/(每周|双周|单周)?周([一二三四五六日])(\d{1,2})~(\d{1,2})节/g)]
    .map((m) => ({
      parity: m[1] || '每周',
      day: DAYS.indexOf(m[2]),
      from: parseInt(m[3], 10),
      to: parseInt(m[4], 10),
    }));
}

// Two slots clash when they share a day, overlap in periods, and their week
// parities can coincide (双周 and 单周 never do).
export function slotsClash(a, b) {
  if (a.day !== b.day) return false;
  if (a.from > b.to || b.from > a.to) return false;
  if ((a.parity === '双周' && b.parity === '单周') ||
      (a.parity === '单周' && b.parity === '双周')) return false;
  return true;
}

// "80 / 35" -> { limit: 80, taken: 35 }
export function parseCapacity(text) {
  const m = text.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { limit: +m[1], taken: +m[2] } : null;
}

// The operated course name must survive the 预选 page reload, so it is kept in
// sessionStorage until the next page reads it for the error box.
export function setLastOpCourse(name) {
  LAST_OP_COURSE = name;
  try { sessionStorage.setItem('pku-last-op-course', name); } catch (e) {}
}
export function consumeLastOpCourse() {
  LAST_OP_COURSE = null;
  try { sessionStorage.removeItem('pku-last-op-course'); } catch (e) {}
}

export function takeNavState() {
  let s = null;
  try { s = JSON.parse(sessionStorage.getItem('pku-nav') || 'null'); } catch (e) {}
  try { sessionStorage.removeItem('pku-nav'); } catch (e) {}
  return s;   // null when there was no pending jump
}

export function readCreditInfo(root = document) {
  const credit = [...root.querySelectorAll('font.pkuportal-remark')]
    .find((f) => /当前已选总学分/.test(f.textContent));
  const remain = root.getElementById('remainRandom');
  if (!credit && !remain) { CREDIT_INFO = null; return; }
  CREDIT_INFO = {
    credit: credit ? (credit.textContent.match(/[\d.]+/) || [null])[0] : null,
    remain: remain ? remain.textContent.trim() : null,
  };
}

export function creditInfoText() {
  if (!CREDIT_INFO) return null;
  const c = CREDIT_INFO.credit != null ? CREDIT_INFO.credit : '0';
  const r = CREDIT_INFO.remain != null ? CREDIT_INFO.remain : '0';
  return '已选 ' + c + ' 学分，剩余意愿点数：' + r;
}

// buildPager removes the site's <span id="remainRandom">, but resetRandom (the
// site's own AJAX 修改 handler) writes to it. Re-insert a hidden copy so that
// update keeps working, then push the fresh value into the visible titles.
export function reinsertRemainRandom() {
  if (document.getElementById('remainRandom')) return;
  const span = document.createElement('span');
  span.id = 'remainRandom';
  span.hidden = true;
  span.textContent = (CREDIT_INFO && CREDIT_INFO.remain) || '0';
  document.body.appendChild(span);
  // catch any change to the value (resetRandom's $.ajax writes it) and refresh
  // the visible tally, even if the resetRandom wrapper was not installed
  if (typeof MutationObserver === 'function') {
    new MutationObserver(() => syncCreditInfo()).observe(span, {
      childList: true, subtree: true, characterData: true,
    });
  }
}

export function syncCreditInfo() {
  const remain = document.getElementById('remainRandom');
  if (CREDIT_INFO && remain) CREDIT_INFO.remain = remain.textContent.trim();
  const txt = creditInfoText();
  document.querySelectorAll('.pku-credit-info').forEach((el) => {
    if (txt != null) el.textContent = txt;
  });
}

// Reads each row's searchable and filterable values into the row record.
// Called while the header and data cells still line up -- before the fold
// column and the scrolling pane change the children indices.
export function captureRowModel(headRow, rows) {
  const labels = [...headRow.children].map(headText);
  rows.forEach((r) => captureRowValues(labels, r));
  return labels;
}

// Reads one row's values given the header labels its cells line up with.
export function captureRowValues(labels, r) {
  const at = (aliases) => findCol(labels, aliases);
  const iId = at(COL.id);
  const iName = at(COL.name);
  const iTeacher = at(COL.teacher);
  const iInfo = findCol(labels, COL.info);
  const iCap = labels.findIndex((l) => /限数|已选/.test(l) && l.includes('/'));

  const facetIdx = {};
  Object.entries(FILTER_COLS).forEach(([key, aliases]) => {
    facetIdx[key] = at(aliases);
  });

  const txt = (tr, i) => {
    const c = i >= 0 && tr.children[i];
    return c ? c.textContent.replace(/[\s\u00a0]+/g, ' ').trim() : '';
  };

  r.name = txt(r.tr, iName);
  r.q = [txt(r.tr, iId), txt(r.tr, iName), txt(r.tr, iTeacher)]
    .join(' ').toLowerCase();
  r.facets = {};
  Object.keys(FILTER_COLS).forEach((k) => { r.facets[k] = txt(r.tr, facetIdx[k]); });
  r.slots = iInfo >= 0 ? parseSlots(txt(r.tr, iInfo)) : [];
  r.cap = iCap >= 0 ? parseCapacity(txt(r.tr, iCap)) : null;
  const cr = parseFloat(txt(r.tr, at(['学分'])));
  r.credit = isNaN(cr) ? 0 : cr;
}