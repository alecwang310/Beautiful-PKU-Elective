// ---- pager ----
// The site renders "Page 1 of 4  First / Previous   Next / Last", where the
// unavailable ends are plain text and the rest are links, plus a 跳转到
// <select> whose options carry the exact netui_row offset for every page.
// That select is the source of truth: each page's URL is built from it.
export const SEARCH_PAGE_SIZE = 20;
export const pagerState = {
  searchPage: 0,
  searchActive: false,
  searchTotal: 0,
  pagerCtl: null,
};


// Page jumps (pager, 第N页) should land on the list, not the page top, and a
// 第N页 jump should restore the search and pin the clicked course. This intent
// is parked in sessionStorage so it survives the reload.
function rememberNav(opts = {}) {
	try {
		sessionStorage.setItem('pku-nav', JSON.stringify({
			q: opts.q || '',
			pin: opts.pin || '',
		}));
	} catch (e) {}
}
function currentSearchQuery() {
	return (document.getElementById('pku-course-search')?.value || '').trim();
}

// Switches the built-in pager between its server-page behaviour (empty search)
// and client-side search pages (20 per page).
export function setSearchPager(filtering, total) {
  const s = pagerState;
  s.searchActive = filtering;
  s.searchTotal = total;
  if (!s.pagerCtl) return;
  const c = s.pagerCtl;
  const pages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  if (s.searchPage >= pages) s.searchPage = pages - 1;
  if (filtering) {
    c.info.textContent = 'page ' + (s.searchPage + 1) + ' of ' + pages;
    c.first.classList.toggle('pku-pg--off', s.searchPage === 0);
    c.prev.classList.toggle('pku-pg--off', s.searchPage === 0);
    c.next.classList.toggle('pku-pg--off', s.searchPage >= pages - 1);
    c.last.classList.toggle('pku-pg--off', s.searchPage >= pages - 1);
    if (c.jump) c.jump.style.display = 'none';
  } else {
    c.info.textContent = c.serverInfo;
    c.first.classList.toggle('pku-pg--off', !c.back);
    c.prev.classList.toggle('pku-pg--off', !c.back);
    c.next.classList.toggle('pku-pg--off', !c.fwd);
    c.last.classList.toggle('pku-pg--off', !c.fwd);
    if (c.jump) c.jump.style.display = '';
  }
}

export function buildPager() {
	// Every grid ends with a "Page X of Y  First / Previous  Next / Last" row.
	// Only multi-page grids also carry a 跳转到 <select> whose options hold each
	// page's netui_row offset; single-page grids have the text alone, so the row
	// is the anchor and the select is used when it happens to be there.
	const rows = [...document.querySelectorAll('table.datagrid tr')].filter((tr) =>
		/Page\s+\d+\s+of\s+\d+/.test(tr.textContent));
	if (!rows.length) return 0;

	let built = 0;
	rows.forEach((textRow) => {
		const grid = textRow.closest('table.datagrid');
		if (!grid || textRow.dataset.pkuPager) return;

		const m = textRow.textContent.match(/Page\s+(\d+)\s+of\s+(\d+)/);
		if (!m) return;
		const cur = parseInt(m[1], 10) - 1, pages = parseInt(m[2], 10);

		// the select may live in this row or the next; it belongs to this grid
		const sel = grid.querySelector('select[name="netui_row"]');
		const opts = sel ? [...sel.options] : [];

		const hrefFor = (i) => {
			if (!opts[i]) return null;
			const url = new URL(location.href);
			const value = opts[i].value;                  // "grid;40"
			const grid0 = value.split(';')[0];
			url.searchParams.set('netui_row', value);
			const size = new URLSearchParams(location.search).get('netui_pagesize');
			if (size) {
				url.searchParams.set('netui_pagesize', size);
			} else if (opts.length > 1) {
				const step = Math.abs(parseInt(opts[1].value.split(';')[1], 10)
														- parseInt(opts[0].value.split(';')[1], 10));
				if (step > 0) url.searchParams.set('netui_pagesize', grid0 + ';' + step);
			}
			return url.toString();
		};

		const bar = document.createElement('div');
		bar.className = 'pku-pager';

		const chev = (dir, n) =>
		('<span class="pku-pg-chev pku-pg-chev--' + dir + '"></span>').repeat(n);

		const mk = (kind, label, target, aria) => {
			const href = target === null ? null : hrefFor(target);
			const el = document.createElement(href ? 'a' : 'span');
			el.className = 'pku-pg pku-pg--' + kind + (href ? '' : ' pku-pg--off');
			el.setAttribute('aria-label', aria);
			if (href) el.href = href;
			el.innerHTML = label;
			return el;
		};

		const back = cur > 0, fwd = cur < pages - 1;
		const info = document.createElement('span');
		info.className = 'pku-pg-info';
		info.textContent = 'page ' + (cur + 1) + ' of ' + pages;

		const first = mk('edge', chev('left', 2), back ? 0 : null, '第一页');
		const prev = mk('step', chev('left', 1), back ? cur - 1 : null, '上一页');
		const next = mk('step', chev('right', 1), fwd ? cur + 1 : null, '下一页');
		const last = mk('edge', chev('right', 2), fwd ? pages - 1 : null, '最后一页');
		bar.append(first, prev, info, next, last);
		// a pager jump lands on the list (not the top) and reruns the search
		bar.addEventListener('click', (e) => {
			const a = e.target.closest('a.pku-pg');
			if (a && a.getAttribute('href')) rememberNav({ q: currentSearchQuery() });
		});

		let jump = null;
		if (sel && opts.length > 1) {
			jump = document.createElement('label');
			jump.className = 'pku-pg-jump';
			jump.textContent = '跳转到 ';

			// A fresh select: the site's own onchange calls doPagerSubmit(), which
			// submits document.forms["pageForm"]. Moving the original out of that
			// form breaks it, so navigate to the page URL directly instead.
			const pick = document.createElement('select');
			opts.forEach((o, i) => {
				const opt = document.createElement('option');
				opt.value = String(i);
				opt.textContent = o.textContent.trim() || String(i + 1);
				if (i === cur) opt.selected = true;
				pick.appendChild(opt);
			});
			pick.addEventListener('change', () => {
				const href = hrefFor(Number(pick.value));
				if (href) { rememberNav({ q: currentSearchQuery() }); location.assign(href); }
			});
			jump.appendChild(pick);
			bar.appendChild(jump);
			(sel.closest('form') || sel).remove();
		}

		// store the controls so a search can repurpose this pager client-side
		pagerState.pagerCtl = {
			first, prev, next, last, info, jump,
			back, fwd, serverInfo: 'page ' + (cur + 1) + ' of ' + pages,
		};

		// client-side navigation while a search is active (otherwise the default
		// <a> href lets the site's own paging proceed as before)
		const navTo = (fn) => (e) => {
			if (!pagerState.searchActive) return;
			e.preventDefault();
			pagerState.searchPage = fn(pagerState.searchPage);
			const npages = Math.max(1, Math.ceil(pagerState.searchTotal / SEARCH_PAGE_SIZE));
			pagerState.searchPage = Math.max(0, Math.min(npages - 1, pagerState.searchPage));
			document.querySelectorAll('.pku-toolbar').forEach((b) =>
				b.dispatchEvent(new Event('pku-refilter')));
		};
		first.addEventListener('click', navTo(() => 0));
		prev.addEventListener('click', navTo((p) => p - 1));
		next.addEventListener('click', navTo((p) => p + 1));
		last.addEventListener('click', navTo(() => 1e9));

		const host = document.createElement('div');
		host.className = 'pku-pager-cell';
		host.appendChild(bar);

		// the pager is a sibling of the table, not a row inside it, so the table
		// (and the section wrapper around it) ends at the last data row. On a
		// re-run after 预选 the wrapper already exists, so park the pager after it.
		(grid.closest('.pku-section-body') || grid).after(host);
		textRow.remove();
		// a leftover row that only held the select is now empty
		[...grid.querySelectorAll('tr')].forEach((tr) => {
			if (!tr.textContent.trim() && !tr.querySelector('input, select, a')) {
				tr.remove();
			}
		});
		built++;
	});

	return built;
}