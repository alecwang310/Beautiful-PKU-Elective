// ---- footer ----
// The site ends with a dark red 版权所有 strip in its own table; swap it for a
// full-width light blue sliver of similar height.
import { FOOTER_MAIL } from '../config.js';

export function buildFooter() {
  const cells = [...document.querySelectorAll('td')].filter((td) =>
    td.textContent.includes('版权所有'));
  if (!cells.length) return 0;

  const bar = document.createElement('div');
  bar.className = 'pku-footer';
  bar.append(document.createTextNode('版权所有©北京大学计算中心 '));
  const mail = document.createElement('a');
  mail.href = 'mailto:' + FOOTER_MAIL;
  mail.textContent = FOOTER_MAIL;
  bar.appendChild(mail);

  const host = cells[0].closest('table') || cells[0];
  host.parentNode.insertBefore(bar, host);
  // drop the original strip (and its wrapper table, if that is all it held)
  cells.forEach((td) => {
    const t = td.closest('table');
    (t && t !== host ? t : td).remove();
  });
  if (host.isConnected) host.remove();
  return 1;
}
