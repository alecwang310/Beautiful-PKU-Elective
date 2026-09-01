// ---- tiny DOM helpers ----
// Shared building blocks for the UI modules.

// A chevron glyph the toggle buttons and fold controls reuse. The rotation
// that shows open/closed state is applied by the `.pku-chev--open` class.
export function chevron() {
  const c = document.createElement('span');
  c.className = 'pku-chev';
  return c;
}
