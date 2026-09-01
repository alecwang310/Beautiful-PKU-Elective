// ---- shared mutable state ----
// Every value that more than one module reads or writes Plain objects: modules import
// `state` and mutate its fields directly.
export const state = {
  // grid element -> its row model, built by enhanceGrid and read by filter,
  // cache, toolbar, actions.
  gridModel: new WeakMap(),
};

// The original pager. When there is any thing being searched, this is no longer used
export const pagerState = {
  searchPage: 0,      // current search-result page (0-based)
  searchActive: false,
  searchTotal: 0,
  pagerCtl: null,     // the built-in pager's controls
};
