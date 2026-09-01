// ---- floating timetable ----
// The site renders 学期课程表 as a 8-column grid: a 节数 column then one
// column per weekday, each cell holding a course as four <br>-separated
// lines -- name, room, "(备注：...) 每周", and an exam line. Almost none of
// that survives in a window this size, so the cell is boiled down to the two
// lines worth reading at a glance: the name tagged with its week pattern,
// and when the exam is. Two courses clashing in one period arrive in a
// single cell ruled off by a row of dashes, and stay that way here.

import { TT_CACHE, TT_PREF, TT_STALE } from '../config.js';
import { timetableStartsOpen } from '../router.js';
import { chevron } from '../ui/dom.js';

// "第一节" -> "一". The 节 is the same on every row, so it is only noise.
function ttPeriod(txt) {
  return (txt || '').replace(/\s+/g, '').replace(/^第/, '').replace(/节$/, '');
}

// One course's lines -> the two the window shows.
function ttCourse(lines) {
  const name = lines[0];
  if (!name) return null;
  // The pattern is the last word of the 备注 line. It cannot be matched
  // anywhere in the block: a 备注 that spells out a 双周 习题课 timetable
  // would otherwise override the 每周 the course itself runs on.
  let freq = '';
  lines.forEach((l) => {
    const m = l.match(/(每周|单周|双周)\s*$/);
    if (m) freq = m[1];
  });
  return {
    name: name + (freq ? '(' + freq + ')' : ''),
    exam: lines.slice(1).find((l) => /考试/.test(l)) || '',
  };
}

function ttCell(td) {
  if (!td) return null;
  const host = td.querySelector('span') || td;
  // Split on the <br>s rather than reading textContent: the line breaks are
  // the only thing separating one field from the next.
  const lines = (host.innerHTML || '').split(/<br\s*\/?>/i)
    .map((frag) => {
      const box = document.createElement('div');
      box.innerHTML = frag;
      return box.textContent.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
  if (!lines.length) return null;

  // a run of dashes divides two courses sharing the period
  const blocks = [[]];
  lines.forEach((l) => {
    if (/^[–—―_-]{3,}$/.test(l)) blocks.push([]);
    else blocks[blocks.length - 1].push(l);
  });
  const courses = blocks.filter((b) => b.length).map(ttCourse).filter(Boolean);
  if (!courses.length) return null;

  // The colours are load-bearing -- they are what tells one course from the
  // next -- so they come across as they are. A clash is written as red bold
  // text on no background at all, which carries over the same way.
  const tint = td.querySelector('font[color]');
  return {
    courses,
    bg: td.style.backgroundColor || '',
    fg: tint ? tint.getAttribute('color') : (td.style.color || ''),
    bold: !!host.querySelector('b, strong'),
  };
}

function readTimetable(table) {
  const rows = [...table.rows];
  const head = rows.find((r) => r.classList.contains('course-header'))
    || rows.find((r) => r.cells.length > 1);
  if (!head) return null;
  const days = [...head.cells].slice(1).map((c) => c.textContent.trim());
  const body = rows.filter((r) => r !== head && r.cells.length > 1);
  if (!days.length || !body.length) return null;

  return {
    days,
    rows: body.map((tr) => ({
      label: ttPeriod(tr.cells[0].textContent),
      cells: days.map((_, i) => ttCell(tr.cells[i + 1])),
    })),
  };
}

const ttBox = (cls, text) => {
  const el = document.createElement('div');
  el.className = cls;
  const fit = document.createElement('div');
  fit.className = 'pku-tt-fit';
  fit.textContent = text || '';
  el.appendChild(fit);
  return el;
};

function ttBodyCell(cell) {
  const el = document.createElement('div');
  el.className = 'pku-tt-cell';
  if (!cell) return el;
  // set as !important: the stylesheet's own white cell background carries
  // one, and a plain inline value would lose to it
  if (cell.bg) el.style.setProperty('background-color', cell.bg, 'important');
  if (cell.fg) el.style.setProperty('color', cell.fg, 'important');
  if (cell.bold) el.style.setProperty('font-weight', '700', 'important');

  const fit = document.createElement('div');
  fit.className = 'pku-tt-fit';
  cell.courses.forEach((c, i) => {
    if (i) {
      const sep = document.createElement('div');
      sep.className = 'pku-tt-sep';
      fit.appendChild(sep);
    }
    const name = document.createElement('div');
    name.className = 'pku-tt-name';
    name.textContent = c.name;
    fit.appendChild(name);
    if (c.exam) {
      const exam = document.createElement('div');
      exam.className = 'pku-tt-exam';
      exam.textContent = c.exam;
      fit.appendChild(exam);
    }
  });
  el.appendChild(fit);
  return el;
}

// Scale each cell's text down until it fits. The text is laid out once, at
// the grid's own font size, and a transform is all that ever changes -- so
// resizing the window re-scales rather than re-wrapping, and a cell that
// already fits is left alone.
function fitTimetable(grid) {
  const fits = [...grid.querySelectorAll('.pku-tt-fit')];
  fits.forEach((f) => f.style.removeProperty('transform'));
  // one read pass, then one write pass: interleaving them would re-layout
  // the whole grid once per cell
  const ks = fits.map((f) => {
    const cell = f.parentElement;
    const roomH = cell.clientHeight, roomW = cell.clientWidth;
    // Height is what a wrapping cell runs out of; width is what the
    // no-wrap weekday headings run out of. Whichever binds, binds.
    const needH = f.offsetHeight, needW = f.scrollWidth;
    if (!roomH || !roomW || !needH || !needW) return 1;
    return Math.max(0.25, Math.min(1, roomH / needH, roomW / needW));
  });
  fits.forEach((f, i) => {
    if (ks[i] < 0.999) f.style.transform = 'scale(' + ks[i].toFixed(3) + ')';
  });
}

function renderTimetable(model, startOpen) {
  const win = document.createElement('div');
  win.className = 'pku-tt';
  const body = document.createElement('div');
  body.className = 'pku-tt-body';
  const grid = document.createElement('div');
  grid.className = 'pku-tt-grid';
  body.appendChild(grid);

  // A weekday with nothing on it, or a period nobody has a class in, is kept
  // -- a timetable missing 星期三 reads as an error -- but shrinks to just
  // its own label, so the space goes to the rows and columns doing work.
  // A period where two courses clash needs room for both, so it takes double.
  const dayUsed = model.days.map((_, c) => model.rows.some((r) => r.cells[c]));
  const rowUsed = model.rows.map((r) => r.cells.some(Boolean));
  const rowBig = model.rows.map((r) => r.cells.some((c) => c && c.courses.length > 1));

  grid.style.gridTemplateColumns =
    'max-content ' + dayUsed.map((u) => (u ? '1fr' : 'max-content')).join(' ');
  grid.style.gridTemplateRows =
    'var(--pku-tt-head-h) ' +
    rowUsed.map((u, i) => (!u ? 'max-content' : rowBig[i] ? '2fr' : '1fr')).join(' ');

  grid.appendChild(ttBox('pku-tt-head', ''));
  model.days.forEach((d) => grid.appendChild(ttBox('pku-tt-head', d)));
  model.rows.forEach((row) => {
    grid.appendChild(ttBox('pku-tt-side', row.label));
    row.cells.forEach((c) => grid.appendChild(ttBodyCell(c)));
  });

  const bar = document.createElement('div');
  bar.className = 'pku-tt-bar';
  const chev = document.createElement('button');
  chev.type = 'button';
  chev.className = 'pku-tt-chev';
  chev.title = '收起课程表';
  chev.setAttribute('aria-expanded', 'true');
  chev.appendChild(chevron());
  bar.appendChild(chev);

  const grip = document.createElement('div');
  grip.className = 'pku-tt-grip';
  grip.title = '拖动调整大小';

  win.append(body, bar, grip);

  // ---- geometry ----
  // The window is anchored by its TOP-RIGHT corner, which is the bar's own
  // corner: the bar then stays put both when the table folds into it and
  // when the grip pulls the opposite corner around.
  const MARGIN = 16;
  const lim = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fitW = (w) => lim(w, innerWidth * 0.25, innerWidth * 0.9);
  const fitH = (h) => lim(h, innerHeight * 0.2, innerHeight * 0.9);

  const pref = ttPref();
  let W = fitW(pref.w || innerWidth * 0.44);
  let H = fitH(pref.h || innerHeight * 0.5);
  let right = MARGIN;
  let top = Math.max(MARGIN, innerHeight - H - MARGIN);
  // Open where the timetable is the thing you are working against -- picking
  // courses, or ordering 预选 -- and out of the way everywhere else. A fold
  // the user performed themselves outranks that: it is a standing choice.
  let shut = (typeof pref.shut === 'boolean') ? pref.shut : !startOpen;

  let pending = 0;
  const refit = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => fitTimetable(grid));
  };
  const size = () => {
    body.style.width = (shut ? 0 : W) + 'px';
    body.style.height = H + 'px';
    // the base size tracks the window, so a bigger one is genuinely more
    // readable rather than the same small type in more space
    grid.style.fontSize = lim(H / 34, 7, 15).toFixed(2) + 'px';
    refit();
  };
  const place = () => {
    win.style.right = Math.round(right) + 'px';
    win.style.top = Math.round(top) + 'px';
  };

  // ---- fold: the grid keeps its width, the clip box loses its ----
  let foldTimer = 0;
  chev.addEventListener('click', () => {
    // Pin the grid to the width it is laid out for, so the clip box can
    // close over it without squeezing anything inside. Measured while it is
    // open; while it is shut there is nothing to measure, so W less the
    // border it will get back is what it reopens to.
    grid.style.width =
      (shut ? Math.max(0, W - 1) : grid.getBoundingClientRect().width) + 'px';
    shut = !shut;
    saveTtPref({ shut });
    chev.setAttribute('aria-expanded', String(!shut));
    chev.title = shut ? '展开课程表' : '收起课程表';
    win.classList.add('pku-tt--anim');
    win.classList.toggle('pku-tt--shut', shut);
    requestAnimationFrame(() => { body.style.width = (shut ? 0 : W) + 'px'; });
    clearTimeout(foldTimer);
    foldTimer = setTimeout(() => {
      win.classList.remove('pku-tt--anim');
      if (!shut) grid.style.removeProperty('width');
    }, 280);
  });

  // ---- drag by the bar ----
  const drag = (e, onMove) => {
    e.preventDefault();
    const move = (ev) => onMove(ev);
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      win.classList.remove('pku-tt--dragging', 'pku-tt--sizing');
      refit();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  // Anywhere on the window is a handle -- the table included. Only the two
  // controls that mean something else are exempt.
  win.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pku-tt-chev, .pku-tt-grip')) return;
    const x0 = e.clientX, y0 = e.clientY, r0 = right, t0 = top;
    win.classList.add('pku-tt--dragging');
    drag(e, (ev) => {
      right = lim(r0 - (ev.clientX - x0), 0, innerWidth - 40);
      top = lim(t0 + (ev.clientY - y0), 0, innerHeight - 40);
      place();
    });
  });

  // ---- resize by the L, bottom-left: left widens, down heightens ----
  grip.addEventListener('pointerdown', (e) => {
    const x0 = e.clientX, y0 = e.clientY, w0 = W, h0 = H;
    win.classList.add('pku-tt--sizing');
    drag(e, (ev) => {
      W = fitW(w0 - (ev.clientX - x0));
      H = fitH(h0 + (ev.clientY - y0));
      size();
    });
    addEventListener('pointerup', () => saveTtPref({ w: W, h: H }), { once: true });
  });

  addEventListener('resize', () => {
    W = fitW(W);
    H = fitH(H);
    right = lim(right, 0, innerWidth - 40);
    top = lim(top, 0, innerHeight - 40);
    place();
    size();
  });

  if (shut) {
    // start folded with no animation, the grid already pinned so the first
    // unfold has a width to travel back out to
    win.classList.add('pku-tt--shut');
    grid.style.width = Math.max(0, W - 1) + 'px';
  }
  place();
  size();
  if (ttStale()) applyTimetableStale(win);
  return win;
}

// Size and fold state are the user's, not the page's, so they live in
// localStorage and carry across every page of the site. Once the window has
// been folded or opened by hand that choice outranks the per-page default.
function ttPref() {
  try { return JSON.parse(localStorage.getItem(TT_PREF) || 'null') || {}; }
  catch (e) { return {}; }
}
function saveTtPref(patch) {
  try {
    localStorage.setItem(TT_PREF, JSON.stringify(
      Object.assign(ttPref(), patch)));
  } catch (e) {}
}

function cacheTimetable(model) {
  try { sessionStorage.setItem(TT_CACHE, JSON.stringify(model)); } catch (e) {}
}

function cachedTimetable() {
  try {
    const m = JSON.parse(sessionStorage.getItem(TT_CACHE) || 'null');
    return (m && m.days && m.rows && m.rows.length) ? m : null;
  } catch (e) { return null; }
}

function ttStale() {
  try { return sessionStorage.getItem(TT_STALE) === '1'; }
  catch (e) { return false; }
}
function setTtStale(on) {
  try {
    if (on) sessionStorage.setItem(TT_STALE, '1');
    else sessionStorage.removeItem(TT_STALE);
  } catch (e) {}
}

// Blur the window and lay the "go refresh" notice over the grid. Idempotent,
// so a second 预选 while it is already blurred does not stack a second layer.
function applyTimetableStale(win) {
  if (!win || win.querySelector('.pku-tt-stale')) return;
  win.classList.add('pku-tt--stale');
  const overlay = document.createElement('div');
  overlay.className = 'pku-tt-stale';
  const main = document.createElement('div');
  main.className = 'pku-tt-stale-main';
  main.textContent = '请前往选课结果界面刷新课程表。';
  const sub = document.createElement('div');
  sub.className = 'pku-tt-stale-sub';
  sub.textContent = '受限于网站设计，只有跳转至选课结果界面才能读取课程表，保证课程表准确性。';
  overlay.append(main, sub);
  const body = win.querySelector('.pku-tt-body');
  if (body) body.appendChild(overlay);
}

// A 预选 has gone through: flag the timetable stale and blur it right away.
export function markTimetableStale() {
  setTtStale(true);
  applyTimetableStale(document.querySelector('.pku-tt'));
}

// 选课结果's own URL, taken from the site's menu rather than guessed.
function resultsUrl() {
  const a = [...document.querySelectorAll('a[href]')]
    .find((el) => /showResults/i.test(el.getAttribute('href') || ''));
  return a ? a.href : null;
}

function mountTimetable(model) {
  if (!model || document.querySelector('.pku-tt')) return false;
  document.body.appendChild(renderTimetable(model, timetableStartsOpen()));
  requestAnimationFrame(() => {
    const grid = document.querySelector('.pku-tt-grid');
    if (grid) fitTimetable(grid);
  });
  return true;
}

export function buildTimetable() {
  if (document.querySelector('.pku-tt')) return false;

  // This page has the real thing: read it and cache it for the others. It
  // is left in place rather than replaced -- buildTimetableHead has already
  // given it a section title and hung the 导出 link off it, so pulling the
  // table out would strand both. On its own page the inline table is the
  // better view anyway; the window is here, folded, like everywhere else.
  const src = document.querySelector('table#classAssignment');
  if (src) {
    const model = readTimetable(src);
    if (!model) return false;
    cacheTimetable(model);
    setTtStale(false);   // the real table was just read: it is fresh again
    return mountTimetable(model);
  }

  const cached = cachedTimetable();
  if (cached) return mountTimetable(cached);

  // nothing to hand: pull 选课结果 in the background and mount when it lands
  const url = resultsUrl();
  if (!url) return false;
  fetch(url, { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const table = doc.querySelector('table#classAssignment');
      const model = table && readTimetable(table);
      if (!model) return;
      cacheTimetable(model);
      mountTimetable(model);
    })
    .catch(() => {});
  return 'fetching';
}
