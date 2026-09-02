// ---- request gate ----
// Every request this script makes on its own goes through here.
//
// The site watches how a session hits it and throws one that reads like a
// 刷课机 back to the login page. The script's own background reads are exactly
// the shape it looks for: several .do requests landing within a second of each
// other and of a page load, none of them a real navigation. So they are
// funnelled into one queue that
//
//   * runs one at a time -- never two in flight,
//   * leaves a gap between them, and a longer one after a page load (which is
//     itself a request the server has just served),
//   * carries that gap ACROSS page loads in sessionStorage, so walking from
//     one page to the next cannot reset the clock and burst,
//   * lets a request the user actually asked for (预选) go first,
//   * sends what a document navigation sends rather than fetch's `Accept: */*`,
//   * drops everything still queued when the page is left, so a navigation is
//     never accompanied by background traffic,
//   * and stops dead the first time an answer comes back as the site's 系统提示
//     page (session gone / access refused) rather than keeping at a session
//     that is already in trouble.

// gap between two consecutive requests of ours, plus jitter so the spacing is
// not a machine-perfect interval
const MIN_GAP = 800;
const GAP_JITTER = 250;
// how long after a page load (or any navigation) the first background request
// waits: the load itself was a request, and a read that follows it instantly
// is the giveaway
const LOAD_GRACE = 1200;
// How long one request may take before it is abandoned. Requests run one at a
// time, so a server that accepts a connection and then says nothing would
// otherwise hold the queue for as long as the page is open, with every caller
// behind it waiting on a promise that never settles.
const REQUEST_TIMEOUT = 15000;

const LAST_KEY = 'pku-elective-last-req';

// A navigation looks like this to the server; fetch's own default does not.
const NAV_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

const now = () => Date.now();

function readLast() {
  try { return Number(sessionStorage.getItem(LAST_KEY)) || 0; } catch (e) { return 0; }
}

// Records that the server has just been asked for something. Called for our
// own requests and once per page load, so the gap spans navigations too.
export function noteRequest() {
  try { sessionStorage.setItem(LAST_KEY, String(now())); } catch (e) {}
}

export function sinceLastRequest() {
  const last = readLast();
  return last ? now() - last : Infinity;
}

// ---- blocked ----
// Being blocked stops this page load, not the whole session: the answer to a
// session the site has thrown out is a fresh login, and once the user has one
// the script works again at the same pace.
let blocked = false;

export function isBlocked() { return blocked; }

function blockError(why) {
  const e = new Error(why || '请求被选课网站拦截');
  e.blocked = true;
  return e;
}

export function markBlocked(why) {
  blocked = true;
  queue.splice(0).forEach((job) => job.reject(blockError(why)));
  dispatchEvent(new CustomEvent('pku-blocked', { detail: { why } }));
}

// The page the site serves in place of whatever was asked for once the session
// is gone: <title>系统提示</title> over "您尚未登录或者会话超时,请重新登录."
// It comes back as HTTP 200 with the site's own menu on it, so neither the
// status nor the chrome tells it apart -- the title does.
const KICK_TITLE = /<title>\s*系统提示\s*<\/title>/i;

// The same page, when it is the one the browser itself landed on.
export function kickedDocument() {
  return /^\s*系统提示\s*$/.test(document.title || '')
    && /(尚未登录|会话超时|重新登录)/.test(
      (document.body && document.body.textContent) || '');
}

// What being kicked looks like in a response body. Only consulted for a
// response that carries no list at all -- every real page of the site has a
// datagrid in it -- so a notice that happens to use one of these words cannot
// shut the gate on its own.
const KICK_TEXT =
  /(重新登录|登录超时|会话(已)?(失效|过期|超时)|请不要过(快|于频繁)|操作过于频繁|频繁操作|异常操作|统一身份认证|验证码|刷课)/;

function kickReason(res, text) {
  // landed somewhere that is not the elective app: the session is gone, or the
  // site decided this looks automated
  if (/\/(login|logout)|iaaa|CheckPassword|Login\.do/i.test(res.url)) {
    return '选课网站把请求跳转到了登录页';
  }
  if (res.status === 403 || res.status === 503) {
    return '选课网站拒绝了后台请求（HTTP ' + res.status + '）';
  }
  if (KICK_TITLE.test(text)) {
    return '选课网站返回了“系统提示”页面：会话已超时或被判定为异常访问';
  }
  // no list on the page AND it reads like a refusal: every page this script
  // asks for has a datagrid in it, so one without is already suspect
  if (!/<table[^>]*class\s*=\s*["']?datagrid/i.test(text) && KICK_TEXT.test(text)) {
    return '选课网站返回了登录或限流提示';
  }
  return null;
}

// ---- queue ----
let queue = [];
let running = false;
let stopped = false;          // the page is going away: send nothing more
let firstOfPage = true;       // the next background request waits out LOAD_GRACE
const inflight = new Set();

// Leaving the page cancels everything still pending, so the navigation the
// user just started is the only request in the air.
addEventListener('pagehide', () => {
  stopped = true;
  queue.splice(0).forEach((job) => job.reject(new Error('页面已离开')));
  inflight.forEach((c) => c.abort());
  inflight.clear();
});

// How long the job at the head of the queue still has to wait.
function waitFor(job) {
  if (job.user) return 0;               // the user just clicked: no stalling
  const gap = (firstOfPage ? LOAD_GRACE : MIN_GAP) + Math.random() * GAP_JITTER;
  return Math.max(0, gap - sinceLastRequest());
}

let timer = 0;
let waiting = false;      // counting out a gap rather than holding a response

function pump() {
  if (running || stopped || !queue.length) return;
  running = true;
  waiting = true;
  timer = setTimeout(() => { waiting = false; step(); }, waitFor(queue[0]));
}

async function step() {
  const job = queue.shift();
  if (!job || stopped) { running = false; return; }
  if (blocked) {
    job.reject(blockError());
    running = false;
    pump();
    return;
  }

  const ctl = new AbortController();
  inflight.add(ctl);
  const cutoff = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT);
  if (!job.user) firstOfPage = false;
  noteRequest();
  try {
    const res = await fetch(job.url, {
      credentials: 'same-origin',
      redirect: 'follow',
      signal: ctl.signal,
      referrer: location.href,
      headers: { Accept: NAV_ACCEPT },
    });
    const text = await res.text();
    noteRequest();                       // the answer is what the server timed
    const why = kickReason(res, text);
    if (why) {
      markBlocked(why);
      job.reject(blockError(why));
    } else if (!res.ok) {
      job.reject(new Error('HTTP ' + res.status));
    } else {
      job.resolve({ url: res.url, text });
    }
  } catch (e) {
    job.reject(ctl.signal.aborted && !stopped
      ? new Error('请求超时（' + (REQUEST_TIMEOUT / 1000) + '秒）')
      : e);
  } finally {
    clearTimeout(cutoff);
    inflight.delete(ctl);
    running = false;
    pump();
  }
}

// Queue one request. `user: true` marks a request the user asked for by
// clicking something: it jumps ahead of background work and waits for no gap
// of its own (it still waits for an in-flight request to land, so two of ours
// are never open at once).
export function gatedFetch(url, opts = {}) {
  if (blocked) return Promise.reject(blockError());
  if (stopped) return Promise.reject(new Error('页面已离开'));
  return new Promise((resolve, reject) => {
    const job = { url, user: !!opts.user, resolve, reject };
    if (job.user) {
      // in front of the background work, behind any other user request
      const at = queue.findIndex((j) => !j.user);
      if (at < 0) queue.push(job); else queue.splice(at, 0, job);
    } else {
      queue.push(job);
    }
    // A click that lands while a background gap is being counted out should
    // not serve the rest of that gap: restart the wait, which is now zero.
    if (job.user && waiting) {
      clearTimeout(timer);
      waiting = false;
      running = false;
    }
    pump();
  });
}

// The page load itself was a request; the gap is measured from it.
noteRequest();
