// ---- course query page ----
// The page's own script clears 课程号 / 课程名 / 上课时间 every time a course
// type is picked: chgConExpDep is bound to the change of every radio. The
// type and the search terms are independent, so that wipes work for no
// reason. Snapshot the fields before its handler runs -- a capture listener
// beats the jQuery ones bound to the radios themselves -- and put them back
// after. 清空条件 is left alone: clearing is exactly what that button is for.

import { Q_TEXT, Q_SEL } from '../config.js';

export function keepQueryFields() {
  // Bound to the FORM, not to #kcfl: buildQueryForm lifts the radios out of
  // that cell into the segmented selector, and a listener left on the cell
  // would stop hearing them.
  const form = document.getElementById('qyForm');
  if (!form || !document.getElementById('kcfl')) return false;

  const snap = () => ({
    text: Q_TEXT.map((id) => (document.getElementById(id) || {}).value || ''),
    sel: Q_SEL.map((id) => (document.getElementById(id) || {}).value || ''),
  });
  const restore = (was) => {
    Q_TEXT.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el && !el.value && was.text[i]) el.value = was.text[i];
    });
    Q_SEL.forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el || el.value || !was.sel[i]) return;
      // selectize owns the <select>, so go through it or its own box, which
      // is what is actually on screen, would keep showing 请选择
      if (el.selectize) el.selectize.setValue(was.sel[i], true);
      else el.value = was.sel[i];
    });
  };

  form.addEventListener('change', (e) => {
    if (!e.target || e.target.type !== 'radio') return;
    const was = snap();
    setTimeout(() => restore(was), 0);
  }, true);
  return true;
}

// Search without being asked: shortly after typing stops, and at once when a
// filter moves -- but a filter only re-runs a search that is already showing
// something, so the first search stays the user's own decision.
const QUERY_TYPING_INTERVAL = 2000;
export function wireQueryAutoSearch() {
  const form = document.getElementById('qyForm');
  const go = document.getElementById('b_query');
  if (!form || !go) return false;

  const val = (id) => ((document.getElementById(id) || {}).value || '').trim();
  // the site's own precondition: a type picked and one starred field filled.
  // Firing without it would raise the page's alert instead of searching.
  const ready = () => !!form.querySelector('input[type=radio]:checked')
    && !!(val('courseID') || val('courseName') || val('deptID'));
  let typed = 0;
  const fire = () => { if (ready()) go.click(); };

  Q_TEXT.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      clearTimeout(typed);
      typed = setTimeout(fire, QUERY_TYPING_INTERVAL);
    });
  });

  // Every filter re-runs the search, whether or not anything is on screen
  // yet -- changing a filter IS the request. Only `ready` holds it back, and
  // only because firing without it raises the page's own alert.
  ['deptID'].concat(Q_SEL).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', fire);
  });
  // on the form rather than #kcfl, whose radios buildQueryForm moves out,
  // and queued so it lands after the search terms have been put back
  form.addEventListener('change', (e) => {
    if (e.target && e.target.type === 'radio') setTimeout(fire, 0);
  });
  return true;
}

// ---- course query form ----
// Everything here MOVES the page's own controls rather than rebuilding them:
// they are what the form submits, and the site's scripts hold references to
// them by id. The nested layout tables they came out of are hidden behind
// the new block.
export function buildQueryForm() {
  const form = document.getElementById('qyForm');
  const types = document.getElementById('kcfl');
  if (!form || !types) return false;
  if (form.querySelector('.pku-qtypes')) return false;

  // Only the course type is rebuilt. The filters below keep the page's own
  // one-line layout and its own dropdowns: they already read the way they
  // should, and driving selectize from a stand-in only added a second thing
  // that could disagree with the value the form actually submits.
  const shell = document.createElement('div');
  shell.className = 'pku-qform';

  const seg = document.createElement('div');
  seg.className = 'pku-qtypes';
  seg.setAttribute('role', 'radiogroup');
  const radios = [...types.querySelectorAll('input[type=radio]')];
  radios.forEach((radio) => {
    const label = document.createElement('label');
    label.className = 'pku-qtype';
    const cap = radio.nextElementSibling;
    const text = (cap && cap.tagName === 'SPAN') ? cap.textContent.trim() : radio.value;
    label.appendChild(radio);                      // moved, handlers intact
    const name = document.createElement('span');
    name.textContent = text;
    label.appendChild(name);
    if (cap && cap.tagName === 'SPAN') cap.remove();
    seg.appendChild(label);
  });
  // they are radios, so exclusivity is the browser's; this only paints it
  const paint = () => radios.forEach((r) =>
    r.parentElement.classList.toggle('pku-qtype--on', r.checked));
  seg.addEventListener('change', paint);
  seg.addEventListener('click', () => setTimeout(paint, 0));
  paint();

  shell.appendChild(seg);
  form.prepend(shell);

  // the cell the radios came out of is empty now; the table around it holds
  // nothing else, so it goes rather than leaving a blank strip
  const table = types.closest('table');
  if (table && !table.contains(shell)) table.style.display = 'none';
  // the selectize demo script's leftovers, never part of the site
  document.querySelectorAll('.theme-selector').forEach((el) => el.remove());
  return true;
}
