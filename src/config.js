// ---- app configuration ----
// Constants and the column-label "match stuff": the alias tables that map the
// site's varying header names to one canonical name, and the helper that looks
// a column up by those aliases. Nothing here touches the DOM.

// ---- column matching ----
export const COL = {
  id: ['课程号'],
  name: ['课程名', '课程名称'],
  teacher: ['教师'],
  info: ['上课/考试信息', '上课时间', '教室信息'],
  note: ['备注'],
};

export const FILTER_COLS = {
  '课程类别': ['课程类别'],
  '学分': ['学分'],
  '开课单位': ['开课单位'],
};

export const NOTE_HEAD = '备注';

export function findCol(labels, aliases) {
  for (const a of aliases) {
    const i = labels.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

// ---- filter facets ----
// Facet label -> the grid column header it draws its values from.
// (开课学院 is the site's 开课单位 column.)
export const FACETS = [
  { label: '课程类别', column: '课程类别' },
  { label: '学分',     column: '学分' },
  { label: '开课学院', column: '开课单位' },
  // 状态 is not a column: 已满/未满 follow from 限数/已选, and conflict is a
  // property of the chosen timetable, so its options are a fixed list.
  { label: '状态', options: ['已满', '未满', '冲突', '不冲突'] },
];

// The two questions 状态 answers: how full the class is, and whether it
// clashes with what is already taken. Options within one group are
// alternatives; options from different groups are separate constraints.
export const STATUS_GROUPS = [['已满', '未满'], ['冲突', '不冲突']];

export const DAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

// ---- scrolling column pane ----
export const SCROLL_COLS = [
  '年级', '开课年级',
  '上课/考试信息', '上课时间', '教室信息',
  '考试时间', '备注', '自选P/NP',
];
export const SCROLL_COL_EM = {
  '年级': 5, '开课年级': 6,
  '上课/考试信息': 24, '上课时间': 24, '教室信息': 24,
  '考试时间': 13, '备注': 22, '自选P/NP': 6,
};
// The order the pane lays its columns out in, overriding the DOM order the
// site ships. 上课/考试信息 is what a row is read for, so it leads; 年级 is a
// short tag that belongs near the end, just before 自选P/NP.
export const SCROLL_ORDER = [
  '上课/考试信息', '上课时间', '教室信息', '考试时间',
  '备注',
  '年级', '开课年级',
  '自选P/NP',
];

// ---- column-width scheduling ----
export const COL_KEEP = 0.85;    // width covering all but the top 15%
export const COL_WIDE = 0.20;    // a column past this share of the table is reduced
export const COL_NARROW = 0.05;  // a column below this share of the table is multiplied with short_field_multiply to prevent it from being reduced as much
export const COL_WIDE_K = 0.65;  // ...to this much of itself, so long text folds
export const COL_HEAD_K = 1.5;   // never narrower than 1.5x its own heading
export const COL_NOTE_K = 0.5;   // 备注 is always half its own W, however wide
export const COL_HOLD = { '课程号': 3 };   // gives up width 3x more grudgingly
export const SHORT_FIELD_MULTIPLY = 5; // multiplys fields below 5% to stop super short fields from folding
export const COL_CODES = ['课程号', '课程班号'];   // class-code columns never fold

// ---- defaults & limits ----
export const DEFAULT_CREDIT_LIMIT = 25;
export const SEARCH_PAGE_SIZE = 20;

// ---- fold ----
export const FOLD_MS = 240;   // keep in step with the transition in the stylesheet

// ---- "show every page on one page" (disabled) ----
export const ALL_ROWS = 500;
export const MERGE_PAGES = false;   // leave the site's paging alone for now

// ---- footer ----
export const FOOTER_MAIL = 'sermis@pku.edu.cn';

// ---- storage keys ----
export const CACHE_STORE_KEY = 'pku-elective-page-cache';
export const TT_CACHE = 'pku-timetable';
export const TT_PREF = 'pku-timetable-pref';
export const TT_STALE = 'pku-timetable-stale';

// ---- course query page ----
export const Q_TEXT = ['courseID', 'courseName'];
export const Q_SEL = ['courseDay', 'courseTime'];
