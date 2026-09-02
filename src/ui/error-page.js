// ---- 系统提示 (session timeout) ----
// The page the site serves once the session is gone: its own banner, a
// background photograph, and one line of text in a shadowed box halfway down
// the page. Everything it says fits in that one line, so the reskin keeps the
// line, drops the scenery, and gives the user the one thing the page itself
// never offered -- a way back to the login screen.
//
// And, since being logged out is a wait rather than a task, Chrome's dino runs
// underneath it. See static/dino.js.

import { startDino } from '../static/dino.js';
import { buildFooter } from './footer.js';

const FALLBACK_TEXT = '提示：您尚未登录或者会话超时，请重新登录。';

// The game's own canvas size, and the scales it may be shown at.
//
// WHOLE NUMBERS ONLY. The sprite is pixel art blown up by nearest-neighbour,
// and nearest-neighbour is only sharp when one source pixel covers a whole
// number of screen pixels -- at 2.1x it covers two of them here and three
// there, which is what made the dino look blurry. 2x is twice the size and
// exactly as sharp as 1x; anything between the two is worse than either.
const DINO_W = 600;
const DINO_SCALES = [2, 1];

// The site's own wording, so a different message (a different refusal) still
// reads as itself. Its cell is the one carrying 提示 with no table inside it.
function pageMessage() {
  const cell = [...document.querySelectorAll('td')]
    .filter((td) => /提示/.test(td.textContent) && !td.querySelector('table'))
    .pop();
  const text = cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
  return text.length > 2 ? text : FALLBACK_TEXT;
}

// 退出 is the site's own way out: it drops the dead session and lands on the
// login page. Click the menu item rather than reproducing its URL, so the link
// stays whatever the site says it is.
function logout() {
  const link = document.querySelector('#menu a[href*="logout"]')
    || document.querySelector('a[href*="logout"]');
  if (!link) return;
  if (typeof link.click === 'function') link.click();
  else location.assign(link.href);
}

export function buildErrorPage() {
  if (document.querySelector('.pku-err')) return false;
  const message = pageMessage();

  // Everything between the banner and the footer belongs to the old page: the
  // photograph, its nested tables, the shadowed box. The banner is already
  // hidden by the stylesheet and replaced by our header; the footer is rebuilt
  // below, so it is left for buildFooter to find.
  [...document.body.children].forEach((el) => {
    if (el.classList.contains('pku-header')) return;
    if (el.textContent.includes('版权所有')) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    el.style.setProperty('display', 'none', 'important');
  });

  const page = document.createElement('main');
  page.className = 'pku-err';

  const text = document.createElement('div');
  text.className = 'pku-err-text';
  text.textContent = message;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pku-err-btn';
  btn.textContent = '重新登录';
  btn.addEventListener('click', logout);

  // `offline` is the class the game's own stylesheet hangs its rules off; in
  // Chrome it sits on <body>, here on the one element the game lives in.
  //
  // The game is NEVER resized: 600x150 is baked into its sprite offsets and
  // into where it centres GAME OVER, and a canvas that disagrees with the
  // drawing about how wide it is clips the right of everything. So the block
  // keeps that exact size and is scaled up instead -- which is what Chrome's
  // own arcade mode does, and the reason the stage around it reserves the
  // scaled height rather than the real one.
  const stage = document.createElement('div');
  stage.className = 'pku-err-stage';
  const game = document.createElement('div');
  game.className = 'pku-err-game offline';
  game.id = 'pku-dino';
  stage.appendChild(game);

  const fitGame = () => {
    const room = document.documentElement.clientWidth * 0.9;
    const scale = DINO_SCALES.find((k) => k * DINO_W <= room) || 1;
    stage.style.setProperty('--pku-dino-scale', String(scale));
  };
  fitGame();
  addEventListener('resize', fitGame);

  page.append(text, btn, stage);
  document.body.classList.add('pku-err-page');   // header / page / footer column
  document.body.appendChild(page);

  // buildFooter() puts its bar where the site's own strip was, which on this
  // page is ABOVE everything we just appended; move it back to the bottom.
  buildFooter();
  const footer = document.querySelector('.pku-footer');
  if (footer) document.body.appendChild(footer);

  startDino(game);
  return true;
}
