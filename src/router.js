// ---- route detection ----
// Pure URL -> page-kind mapping. Nothing here queries or mutates the DOM.

// nav order + active-page detection
export const NAV = [
  { label: '选课计划', match: (u) => /electivePlan|courseQuery/.test(u) },
  { label: '选课结果', match: (u) => /showResults/.test(u) },
  { label: '预选',     match: (u) => /electiveWork/.test(u) },
  { label: '补退选',   match: (u) => /SupplyCancel/.test(u) },
  { label: '补选',     match: (u) => /SupplyOnly/.test(u) },
  { label: '帮助',     match: (u) => /HelpController/.test(u) },
  { label: '退出',     match: (u) => /logout/.test(u) },
];

export function currentUrl() {
  return location.pathname + location.search;
}

export function activeNav() {
  return NAV.find((n) => n.match(currentUrl())) || null;
}

// 选课结果 is a read-only record, so it uses the plain grid: no folding.
export function isResultsPage() {
  return /showResults/.test(currentUrl());
}

// 维护选课计划 (maintain the plan): the plan list should show every row on one
// page rather than the site's 20-per-page paging.
export function isPlanPage() {
  return /electivePlan/.test(currentUrl());
}

// Open where the timetable is what you are working against: choosing courses
// to add to the plan, and ordering 预选. Everywhere else it waits, folded.
export function timetableStartsOpen() {
  return /courseQuery|electiveWork/i.test(location.href);
}
