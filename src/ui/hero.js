// ---- page hero ----
// The site renders one line like:
//   网上选课 >> 预选： 【xx学院 xxx， <span class=errmsg>选课时间为：…</span>】
// Keep the page name as the title and, per spec, only the 选课时间 field as
// the gray meta line — the name/department and the brackets are dropped.
export function buildHero() {
  // Most pages put the breadcrumb in a <p class=pkuportal-remark>, but the
  // course query page uses a <td> with the same class -- and the class is
  // also on unrelated notes, so the breadcrumb is identified by its ">>".
  const remark = [...document.querySelectorAll('.pkuportal-remark')]
    .find((el) => el.textContent.includes('>>'));
  if (!remark) return null;

  const full = remark.textContent.replace(/\s+/g, ' ').trim();
  // page name = last segment of the ">>" breadcrumb, before the colon
  const crumb = full.split('>>').pop() || '';
  const title = crumb.split(/[：:]/)[0].replace(/[【\[].*$/, '').trim();
  if (!title) return null;

  const bracketMatch = full.match(/[【\[][^】\]]*[】\]]/);
  let meta = '';
  if (bracketMatch) {
    meta = bracketMatch[0]
      .replace(/^[【\[]/, '')
      .replace(/[】\]]$/, '')
      .trim();
  }

  const hero = document.createElement('section');
  hero.className = 'pku-hero';

  const head = document.createElement('div');
  head.className = 'pku-hero-head';
  const h2 = document.createElement('h2');
  h2.className = 'pku-hero-title';
  h2.textContent = title;
  head.appendChild(h2);
  if (meta) {
    const m = document.createElement('span');
    m.className = 'pku-hero-meta';
    const i = meta.search(/选课时间/);
    if (i >= 0) {
      m.textContent = meta.slice(0, i);
      const t = document.createElement('span');
      t.className = 'pku-hero-meta-time';
      t.textContent = meta.slice(i);
      m.appendChild(t);
    } else {
      m.textContent = meta;
    }
    head.appendChild(m);
  }

  const rule = document.createElement('div');
  rule.className = 'pku-hero-rule';
  hero.append(head, rule);

  (remark.closest('tr') || remark).remove();
  return hero;
}
