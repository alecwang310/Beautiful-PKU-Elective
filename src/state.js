// ---- shared mutable state ----
// Every value that more than one module reads or writes, in one place so a
// symbol is never "module-private but referenced elsewhere" (the bug this
// refactor exists to kill). Plain objects, no getters/setters: modules import
// `state` and mutate its fields directly.
export const state = {
  // grid element -> its row model, built by enhanceGrid and read by filter,
  // cache, toolbar, actions.
  gridModel: new WeakMap(),

  // name of the course just operated on, for error boxes (time collisions) so
  // the user can see which course just had a collision.
  lastOpCourse: null,
};

// The built-in pager, repurposed client-side while a search is active.
export const pagerState = {
  searchPage: 0,      // current search-result page (0-based)
  searchActive: false,
  searchTotal: 0,
  pagerCtl: null,     // the built-in pager's controls
};
