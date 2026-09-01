// ---- header + nav ----
import { NAV, activeNav } from '../router.js';
import { PKU_LOGO } from '../static/styles.js';

export function buildHeader() {
  const menu = document.querySelector('#menu');
  if (menu) {
    const orig = menu.closest('table');
    if (orig) orig.style.display = 'none';
  }

  const linkMap = {};
  document.querySelectorAll('#menu a').forEach((a) => {
    linkMap[a.textContent.replace(/\s+/g, '').trim()] = a.getAttribute('href');
  });

  const active = activeNav();

  const header = document.createElement('header');
  header.className = 'pku-header';

  // --- title bar ---
  const titlebar = document.createElement('div');
  titlebar.className = 'pku-titlebar';
  const logo = document.createElement('img');
  logo.className = 'pku-logo';
  logo.src = PKU_LOGO;
  logo.alt = '北京大学';
  const title = document.createElement('h1');
  title.className = 'pku-title';
  title.textContent = '学生网上选课系统';
  titlebar.append(logo, title);

  // --- nav bar ---
  const nav = document.createElement('nav');
  nav.className = 'pku-nav';
  NAV.forEach((item) => {
    const href = linkMap[item.label];
    if (!href) return;
    const a = document.createElement('a');
    a.className = 'pku-nav-link' + (active && active.label === item.label ? ' active' : '');
    a.href = href;
    const label = document.createElement('span');
    label.className = 'pku-nav-label';
    label.textContent = item.label;
    a.appendChild(label);
    nav.appendChild(a);
  });

  header.append(titlebar, nav);
  document.body.prepend(header);

  console.log('[Beautiful PKU Elective] header built;', nav.children.length, 'links; active =',
    active ? active.label : 'none');
}
