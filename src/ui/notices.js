// ---- notifications ----
// Each notice is a nested table row whose first cell holds warning.gif,
// error.gif or success.gif. They are merged into one bordered box. The site's
// red emphasis is turned bold black in CSS (see Noticies in layout.js), so the
// cloned markup is left untouched. An error card turns red and appends the
// operated course; a success card turns green with a light-green fill.

export function buildNotices() {
  return collectNoticeCards(document);
}

export function collectNoticeCards(root, onlyOutcomes = false) {
  const imgs = [...root.querySelectorAll(
    'img[src*="warning.gif"], img[src*="error.gif"], img[src*="success.gif"]')]
    .filter((img) => !onlyOutcomes || /(error|success)\.gif/.test(img.getAttribute('src') || ''));
  const cards = [];
  const outers = new Set();
  const seen = new Set();
  const seenText = new Set();

  imgs.forEach((img) => {
    const row = img.closest('tr');
    if (!row || seen.has(row)) return;
    seen.add(row);
    const src = img.getAttribute('src') || '';
    const isError = /error\.gif/.test(src);
    const isSuccess = /success\.gif/.test(src);

    const cells = [...row.children];
    // content cell = the one without the narrow icon image
    const content = cells.find((td) => !td.querySelector('img'));
    if (!content) return;

    // the site repeats the same notice before each list; keep only the first
    const text = content.textContent.replace(/[\s ]+/g, '').trim();
    if (text && seenText.has(text)) {
      const outer = row.closest('table')?.closest('tr');
      if (outer) outers.add(outer); else row.remove();
      return;
    }
    seenText.add(text);

    const card = document.createElement('section');
    card.className = 'pku-notice'
      + (isError ? ' pku-notice--error' : isSuccess ? ' pku-notice--success' : '');
    [...content.childNodes].forEach((n) => card.appendChild(n.cloneNode(true)));
    cards.push(card);

    // remove the original row, and the wrapper row of its nested table
    const outer = row.closest('table')?.closest('tr');
    if (outer) outers.add(outer); else row.remove();
  });

  outers.forEach((tr) => tr.remove());
  return cards;
}

// The site drops a green 注：… line explaining the red clash colour; the
// reskin explains that in the toolbar legend instead, so the line goes.
export function removeNoteLine() {
  [...document.querySelectorAll('span.pkuportal-remark, font.pkuportal-remark')]
    .forEach((el) => {
      if (/^注[：:]/.test(el.textContent.replace(/\s+/g, '').trim())) {
        const row = el.closest('tr');
        if (row) row.remove();
      }
    });
}
