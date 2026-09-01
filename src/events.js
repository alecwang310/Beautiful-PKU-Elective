// ---- cross-module signalling ----
// The one event the app leans on: a toolbar's "re-apply the filter" ping. The
// toolbar owns the run() handler and listens for this on itself; any module
// that changes what should be visible just emits it, with no knowledge of who
// is listening.
export const REFILTER_EVENT = 'pku-refilter';

export function refilter() {
  document.querySelectorAll('.pku-toolbar').forEach((bar) =>
    bar.dispatchEvent(new Event(REFILTER_EVENT)));
}
