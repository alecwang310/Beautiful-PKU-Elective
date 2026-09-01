import { C } from './config.js';
const css = String.raw;

export const Root = css`
    table:has(#menu) { display: none !important; }
    body { margin: 0 !important; background: #fff !important; }

    :root {

      --pku-gutter: 24px;    /* page-edge gutter; title bar and nav share it */
      --pku-tab-pad: 14px;   /* horizontal padding inside one tab */
      --pku-nav-gap: 12px;   /* wide layout: gap from the title bar to tab #1 */
      --pku-content-w: 95%;  /* matches the site's own centered content table */
      --pku-notice-pad: 16px 20px;  /* breathing room around notice text */
      --pku-title-pad-y: 14px; /* title bar vertical padding; same at every width
                                  so the logo never shifts across the breakpoint */
      /* the hover pill is sized as padding AROUND the label rather than as an
         inset from the tab, so it hugs the text: just a little taller than the
         glyphs, with a bit of room either side */
      --pku-tab-pad-y: 9px;    /* vertical padding inside one tab */
      --pku-hover-pad-y: 8px;  /* pill padding above/below the text */
      --pku-hover-pad-x: 12px; /* pill padding left/right of the text */
      --pku-toolbar-pad-x: 14px;  /* toolbar side padding; its rule cancels it */
      --pku-section-rule-gap: 16px;  /* space between a section title and its rule */
      --pku-search-gap: 50px;  /* space under the search line, above the buttons */
    }`
export const Title = css`
    .pku-titlebar {
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
    padding: var(--pku-title-pad-y) var(--pku-gutter) !important;
    background: ${C.headerBg} !important;
    color: ${C.text} !important;
    }
    .pku-logo {
    height: 42px !important;
    width: auto !important;
    filter: brightness(0) !important;
    }
    .pku-title {
    margin: 0 !important;
    font-size: 26px !important;
    font-weight: 600 !important;
    letter-spacing: 1px !important;
    color: ${C.text} !important;
    }`

/* Two layouts: when the screen is wide (over 900px), the logo and nav bar are on the same row and the row is sticky.
    When the screen is narrow, the nav bar is on its own row beneath the logo and only the nav bar is sticky*/
export const NavMenu = css`
    /* The nav bar has no padding, the padding is all in the nav items themselves. This allows the red live indicator sit directly on the lower edge */
    .pku-nav {
      display: flex !important;
      align-items: stretch !important;
      gap: 2px !important;
      /* tab padding supplies the rest of the gutter, so tab text lines up
         with the title bar's left edge instead of sitting 11px further in */
      padding: 0 calc(var(--pku-gutter) - var(--pku-tab-pad)) !important;
      background: ${C.headerBg} !important;
    }
    .pku-nav-link,
    .pku-nav-link:link,
    .pku-nav-link:visited,
    .pku-nav-link:active {
      /* display:flex is here to ensure the live indicator is exactly at the bottom of the seperator, not floating.
       If it isn't flex, the bottom will not take into account the padding, only the text height and cause the indicator to float*/
      display: flex !important;
      align-items: center !important;
      position: relative !important;
      padding: var(--pku-tab-pad-y) var(--pku-tab-pad) !important;
      margin: 0 !important;
      border-radius: 0 !important;
      color: ${C.text} !important;
      text-decoration: none !important;
      font-size: 18px !important;
      line-height: 1.2 !important;
      white-space: nowrap !important;
      cursor: pointer !important;
    }
    /* Hover is a ::before inset inside the tab rather than a background on the
       tab itself: hover box is decided by the text height, not the box height. */
    .pku-nav-link:hover { color: ${C.text} !important; text-decoration: none !important; }
    .pku-nav-link::before {
      content: '' !important;
      position: absolute !important;
      /* Centred on the label and sized from the text, not the tab */
      left: calc(var(--pku-tab-pad) - var(--pku-hover-pad-x)) !important;
      right: calc(var(--pku-tab-pad) - var(--pku-hover-pad-x)) !important;
      top: 50% !important;
      height: calc(1.2em + var(--pku-hover-pad-y) * 2) !important;
      transform: translateY(-50%) !important;
      border-radius: 5px !important;
      background: transparent !important;
      pointer-events: none !important;
    }
    .pku-nav-link:hover::before { background: rgba(0,0,0,0.07) !important; }
    /* Positioned child, so it paints above the hover pill that an absolutely
       positioned ::before would otherwise cover. font-size is explicit
       because the site sets a bare span { font-size: 12px } rule, which
       targets this element directly and beats the size inherited from the
       link. */
    .pku-nav-label {
      position: relative !important;
      z-index: 1 !important;
      font-size: inherit !important;
      line-height: inherit !important;
    }
    /* sits ON the 1px separator: the tab's bottom edge is flush with the
       border, so -1px lets the 3px bar cover the line itself */
    .pku-nav-link.active::after {
      content: '' !important;
      position: absolute !important;
      left: 0 !important;
      right: 0 !important;
      bottom: -1px !important;
      height: 3px !important;
      background: ${C.accent} !important;
      border-radius: 2px 2px 0 0 !important;
    }

    /* ---- NARROW (default): two rows, only the nav sticks ---- */
    .pku-header { display: contents !important; }
    .pku-nav {
      position: sticky !important;
      top: 0 !important;
      z-index: 1000 !important;
      border-bottom: 1px solid ${C.faintLine} !important;
    }

    /* ---- WIDE (>= 900px): logo + tabs on one row, whole header sticks ---- */
    @media (min-width: 900px) {
      .pku-header {
        display: flex !important;
        align-items: stretch !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 10000 !important;
        background: ${C.headerBg} !important;
        border-bottom: 1px solid ${C.faintLine} !important;
      }
      .pku-titlebar { padding-right: var(--pku-nav-gap) !important; }
      /* Only what actually differs when the nav shares a row with the title:
         it stops sticking on its own, fills the leftover width, and gives up
         its bottom border to the header. Tab geometry and the indicator are
         inherited from the shared rules above. */
      .pku-nav {
        position: static !important;
        flex: 1 !important;
        padding: 0 calc(var(--pku-nav-gap) - var(--pku-tab-pad)) !important;
        border-bottom: none !important;
      }
    }`

export const PageHero = css`
    .pku-hero {
      width: var(--pku-content-w) !important;
      margin: 0 auto !important;
      padding: 36px 0 0 !important;   /* ample space above the title */
    }
    .pku-hero-head { padding-bottom: 14px !important; }
    .pku-hero-title {
      margin: 0 !important;
      font-size: 30px !important;
      font-weight: 600 !important;
      color: ${C.text} !important;
    }
    .pku-hero-meta {
      display: block !important;      /* second line, under the title */
      margin-top: 8px !important;
      font-size: 13px !important;
      color: ${C.text} !important;
    }
    /* the 选课时间为：… tail of the meta line reads blue and bold */
    .pku-hero-meta .pku-hero-meta-time {
      color: ${C.courseLink} !important;
      font-weight: 700 !important;
    }
    .pku-hero-head + .pku-hero-rule {
      height: 1px !important;
      background: ${C.rule} !important;
    }` 

export const Noticies = css`
    .pku-notice.pku-notice  {
      /* same width as the hero rule above it, so their edges line up */
      width: var(--pku-content-w) !important;
      box-sizing: border-box !important;
      margin: 16px auto 0 !important;
      padding: var(--pku-notice-pad) !important;
      border: 1px solid ${C.noticeBorder} !important;
      border-radius: 10px !important;
      background: ${C.headerBg} !important;
      font-size: 13px !important;
      line-height: 1.75 !important;
    }
    /* the site marks urgent copy red; here it reads as bold black */
    .pku-notice, .pku-notice * {
      color: ${C.text} !important;
      background: transparent !important;
      font-size: 13px !important;
    }
    .pku-notice strong { font-weight: 700 !important; }
    /* an operation failure reads as a notice, but red: light-red fill, red edge */
    .pku-notice.pku-notice--error {
      border-color: ${C.errorBorder} !important;
      background: ${C.warnClash} !important;
    }
    .pku-notice.pku-notice--error,
    .pku-notice.pku-notice--error * {
      color: ${C.warnClashText} !important;
    }
    /* an operation success reads the same way, but green: light-green fill,
       green edge; the text stays black like any other notice */
    .pku-notice.pku-notice--success {
      border-color: ${C.successBorder} !important;
      background: ${C.successFill} !important;
    }
    .pku-notice .pku-notice-course {
      color: ${C.warnClashText} !important;
      font-weight: 700 !important;
    }`

export const SectionHeads = css`
    /* ---- section heads (list titles above each datagrid) ----
       The title strip and the toolbar are direct children of the grid's table
       cell, so that cell is the title's sticky containing block and it stays
       pinned for as long as its own table is on screen. Only the title sticks
       (and the grid's header row); the search and filter row scrolls away. */
    .pku-section-head { position: static !important; background: transparent !important; }
    .pku-section-headline, .pku-section-headline * { color: ${C.text} !important; }
    /* the sticky title strip: plain page background, pinned under the nav.
       It must stay opaque so table rows do not show through as they pass.
       Its stickiness ends where its wrapper does -- at the last data row, just
       above the pager -- so it scrolls up there rather than riding over it. */
    .pku-section-headline {
      position: sticky !important;
      top: var(--pku-stick-top, 0px) !important;
      z-index: 1100 !important;  /* highest: above the nav, toolbar and table */
      display: flex !important;
      align-items: baseline !important;
      flex-wrap: wrap !important;
      gap: 10px !important;
      /* top padding lives here now that the old wrapper is gone */
      padding: 26px 0 12px !important;
      background: #fff !important;
      border-bottom: 1px solid ${C.rule} !important;
    }
    /* The toolbar is NOT sticky and keeps the page background so rows never show
       through it. It sits BELOW the sticky title (900) so the title always wins;
       an open facet dropdown gets its own higher layer further down, which is
       what lets it overhang without lifting the whole toolbar. */
    /* While a filter is open the toolbar is lifted above the title, so the
       dropdown (trapped in the toolbar's stacking context) can overhang it.
       Closed, the title wins -- which is what keeps the sticky title on top. */
    .pku-toolbar {
      position: relative !important;
      z-index: 500 !important;
      background: #fff !important;
      padding: 16px var(--pku-toolbar-pad-x) 0 !important;
    }
    /* Must come AFTER .pku-toolbar: equal specificity and both !important, so
       the later rule wins. Declared before it, this was silently overridden. */
    .pku-toolbar.pku-toolbar--above { z-index: 995 !important; }
    .pku-section-title {
      margin: 0 !important;
      font-size: 20px !important;
      font-weight: 600 !important;
      line-height: 1.3 !important;
      color: ${C.text} !important;
    }
    .pku-section-note {
      font-size: 13px !important;   /* explicit: beats the site's bare span rule */
      font-weight: 400 !important;
    }
    /* the 导出到 excel link in the 选课结果 note: bright blue, underline on hover */
    .pku-section-headline a.pku-timetable-export,
    .pku-section-headline a.pku-timetable-export:link,
    .pku-section-headline a.pku-timetable-export:visited,
    .pku-section-headline a.pku-timetable-export:active {
      color: ${C.courseLink} !important;
      text-decoration: none !important;
    }
    .pku-section-headline a.pku-timetable-export:hover {
      text-decoration: underline !important;
    }
    /* credit / willingness tally beside a list title: note-sized but bright blue */
    .pku-section-headline .pku-credit-info {
      font-size: 13px !important;
      font-weight: 600 !important;
      color: ${C.courseLink} !important;
    }

    /* standalone actions (no list title on the page): page-width, not sticky */
    .pku-section-head--bare {
      position: static !important;
      width: var(--pku-content-w) !important;
      margin: 0 auto 20px !important;
      padding: 16px 0 20px !important;
      /* a rule closes the pair off from the form beneath them */
      border-bottom: 1px solid ${C.rule} !important;
    }
    .pku-section-head--bare .pku-actions-row { gap: 10px !important; }`

export const Toolbar = css`
    /* ---- toolbar: search, plan buttons, filter UI ---- */
    /* The toolbar is padded on both sides, so a plain child would be short by
       that much; pull the rule back out to the full table width. */
    .pku-toolbar-rule {
      height: 1px !important;
      background: ${C.rule} !important;
      margin: 16px calc(-1 * var(--pku-toolbar-pad-x)) 0 !important;
    }
    .pku-search-row {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 12px !important;
    }
    .pku-search-label {
      font-size: 13px !important;
      color: ${C.text} !important;
    }
    /* holds the icon and the input; the input's left padding clears the icon */
    .pku-search-box {
      position: relative !important;
      display: inline-flex !important;
      align-items: center !important;
      flex: 1 1 240px !important;
      max-width: 360px !important;
    }
    .pku-search-icon {
      position: absolute !important;
      left: 9px !important;
      width: 12px !important;
      height: 12px !important;
      pointer-events: none !important;
      color: ${C.noteText} !important;
    }
    .pku-search-input {
      box-sizing: border-box !important;
      width: 100% !important;
      padding: 7px 10px 7px 27px !important;
      font-size: 13px !important;
      font-family: inherit !important;
      color: ${C.text} !important;
      background: #fff !important;
      border: 1px solid ${C.fieldBorder} !important;
      border-radius: 4px !important;
      outline: none !important;
    }
    .pku-search-input::placeholder { color: ${C.noteText} !important; }
    .pku-search-input:focus { border-color: ${C.btnBlue} !important; }
    /* legend under the search: same text size/weight/colour as the search label */
    .pku-search-legend {
      font-size: 13px !important;
      font-weight: 400 !important;
      color: ${C.text} !important;
      margin-top: 8px !important;
    }

    /* ---- button row: two blue actions, then the filter controls ---- */
    .pku-actions-row {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 12px !important;
      padding-top: var(--pku-search-gap) !important;
    }
    /* these are the site's own <a> elements, restyled as buttons */
    .pku-btn,
    .pku-btn:link,
    .pku-btn:visited {
      display: inline-block !important;
      padding: 8px 14px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
      color: #fff !important;
      background: ${C.btnBlue} !important;
      border-radius: 5px !important;
      text-decoration: none !important;
      cursor: pointer !important;
    }
    .pku-btn:hover {
      background: ${C.btnBlueHover} !important;
      color: #fff !important;
      text-decoration: none !important;
    }`

/* 课程查询界面 */
export const CourseQuery = css`
    /* ---- course query page ---- */
    /* 查询 is the page's primary action, so it takes the same blue as every
       other one; 清空条件 sits beside it as the quiet alternative. */
    #qyForm input#b_query {
      padding: 8px 18px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
      color: #fff !important;
      background: ${C.btnBlue} !important;
      border: none !important;
      border-radius: 5px !important;
      cursor: pointer !important;
      /* the site bolts selectize's .selectize-input class onto these buttons,
         whose theme gives them width:100% and, for inputs, a left text flow --
         undo both so the label stays centred and the button sizes to it */
      box-sizing: border-box !important;
      width: auto !important;
      text-align: center !important;
    }
    #qyForm input#b_query:hover { background: ${C.btnBlueHover} !important; }
    #qyForm input#b_cancel {
      padding: 8px 14px !important;
      font-size: 13px !important;
      line-height: 1.2 !important;
      color: ${C.text} !important;
      background: #fff !important;
      border: 1px solid ${C.fieldBorder} !important;
      border-radius: 5px !important;
      cursor: pointer !important;
      box-sizing: border-box !important;
      width: auto !important;
      text-align: center !important;
    }
    #qyForm input#b_cancel:hover { background: ${C.facetBg} !important; }

    /* The filter dropdowns have to paint over the grid's sticky column header
       (880) and the sticky page title (2000), both of which are their own
       layers and would otherwise cut across an open list. */
    .selectize-dropdown { z-index: 2100 !important; }
    /* .selectize-control deliberately gets NO z-index: it is position:relative,
       so giving it one would open a stacking context and trap the dropdown
       inside it, capped below the very layers it needs to clear. */
    /* The filter row is left exactly as the site built it -- no wrapper, no
       field treatment, no cell padding of ours. The selectize dropdowns in
       particular are only ever layered, never restyled: their markup is the
       library's and does not survive being leaned on. The two buttons below
       are the sole exception. */

    /* ---- course query form ----
       Only the course type is rebuilt here: its radios move into one segmented
       selector and the table they sat in is hidden. Everything below it keeps
       the page's own markup and its own look. */
    .pku-qform {
      width: var(--pku-content-w) !important;
      margin: 0 auto 4px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
    }
    /* the selectize demo script bolts a theme switcher and value read-outs
       onto the page; none of it belongs to the site */
    .theme-selector, .pku-qform + .value, #qyForm pre.js { display: none !important; }

    /* B2: one segmented selector across the full width */
    .pku-qtypes {
      display: flex !important;
      width: 100% !important;
      border: 1px solid ${C.fieldBorder} !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      background: #fff !important;
    }
    .pku-qtype {
      flex: 1 1 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 10px 8px !important;
      font-size: 13px !important;
      line-height: 1.2 !important;
      text-align: center !important;
      color: ${C.text} !important;
      background: #fff !important;
      cursor: pointer !important;
      border-left: 1px solid ${C.fieldBorder} !important;
      transition: background .14s ease, color .14s ease !important;
    }
    .pku-qtype:first-child { border-left: none !important; }
    .pku-qtype input { position: absolute !important; opacity: 0 !important;
                       width: 0 !important; height: 0 !important; }
    /* the page colours two of these labels itself; the selector is one control,
       so every segment reads the same */
    .pku-qtype span { color: inherit !important; }
    .pku-qtype:hover {
      background: ${C.headerBg} !important;
      color: ${C.btnBlue} !important;
    }
    .pku-qtype--on,
    .pku-qtype--on:hover {
      background: ${C.btnBlue} !important;
      color: #fff !important;
    }`

export const FilterToggle = css`
    /* ---- 筛选条件 toggle: plain text + chevron, no box ---- */
    .pku-filter-toggle {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      line-height: 1 !important;
      padding: 0 !important;
      margin-left: 4px !important;
      font-size: 13px !important;
      color: ${C.text} !important;
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      font-family: inherit !important;
    }`

export const Cache = css`
    /* ---- cache progress: one segment per page, blue when loaded ---- */
    .pku-cache {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 0 0 !important;
      font-size: 12px !important;
      color: ${C.noteText} !important;
    }
    /* the bar stays for the whole session; only the status text changes */
    .pku-cache-status {
      font-size: 12px !important;
      white-space: nowrap !important;
    }
    .pku-cache--done .pku-cache-status { color: ${C.text} !important; }
    .pku-cache-track {
      display: flex !important;
      gap: 3px !important;
      flex: 1 1 200px !important;
      max-width: 360px !important;
    }
    .pku-cache-seg {
      height: 5px !important;
      flex: 1 1 0 !important;
      border-radius: 3px !important;
      background: ${C.optDot} !important;      /* pending: gray */
      transition: background .25s ease !important;
    }
    .pku-cache-seg--on { background: ${C.btnBlue} !important; }   /* done: blue */
    .pku-cache-seg--err { background: ${C.accent} !important; }
    .pku-goto-page, .pku-goto-page:link, .pku-goto-page:visited {
      color: ${C.link} !important;
      font-size: 12px !important;
      text-decoration: none !important;
    }
    .pku-goto-page:hover { text-decoration: underline !important; }
    .pku-goto-hint {
      color: ${C.noteText} !important;
      font-size: 12px !important;
      overflow-wrap: anywhere !important;
      white-space: normal !important;
    }
    .pku-climit { font-size: 13px !important; color: ${C.text} !important; white-space: nowrap !important; }
    .pku-climit-input {
      width: 4.5em !important;
      box-sizing: border-box !important;
      padding: 7px 8px !important;
      font-size: 13px !important;
      font-family: inherit !important;
      color: ${C.text} !important;
      background: #fff !important;
      border: 1px solid ${C.fieldBorder} !important;
      border-radius: 4px !important;
      outline: none !important;
    }
    .pku-climit-input:focus { border-color: ${C.btnBlue} !important; }
    .pku-climit-tally { font-size: 13px !important; color: ${C.noteText} !important; }
    .pku-climit-tally--over { color: ${C.warnClashText} !important; font-weight: 600 !important; }
    .pku-result-count {
      font-size: 13px !important;
      color: ${C.noteText} !important;
    }
    .pku-reset {
      font-size: 13px !important;
      color: ${C.text} !important;
      background: none !important;
      border: none !important;
      padding: 0 !important;
      cursor: pointer !important;
      font-family: inherit !important;
      text-decoration: none !important;
    }
    .pku-reset:hover { text-decoration: underline !important; }`

export const Chevron = css`
    /* Chevron: sized in em so it tracks the text, and spun about a point near
       its tip (where a V's mass sits) rather than the box centre. */
    .pku-chev {
      width: 0.46em !important;
      height: 0.46em !important;
      flex: none !important;
      display: inline-block !important;
      vertical-align: middle !important;
      border-right: 1.5px solid currentColor !important;
      border-bottom: 1.5px solid currentColor !important;
      transform-origin: 72% 72% !important;
      transform: rotate(45deg) !important;      /* points down */
      transition: transform .16s ease !important;
    }
    .pku-chev--open { transform: rotate(-45deg) !important; }  /* points right */
    /* the toggle's chevron reads a touch low next to the text, so lift it */
    /* The chevron is a rotated square, so its visual centre sits below its box
       centre; lift it so it reads level with the text. */
    .pku-filter-toggle .pku-chev { margin-top: -4px !important; }`

export const FilterPanel = css`
    /* ---- filter panel ----
       In flow on its own line beneath the buttons, so opening it pushes the
       table down (animated). The three facets each take just under a third of
       the width; their own dropdowns are absolute, so those overlay the form
       instead of growing it. */
    .pku-filters {
      display: grid !important;
      /* as many ~quarter-width facets as fit, wrapping on narrow screens */
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)) !important;
      gap: 10px !important;
      overflow: hidden !important;
      max-height: 0 !important;
      opacity: 0 !important;
      visibility: hidden !important;
      transition: max-height .22s ease, opacity .18s ease,
                  padding-top .22s ease, visibility .22s ease !important;
    }
    .pku-filters--open {
      max-height: 140px !important;
      opacity: 1 !important;
      visibility: visible !important;
      padding-top: 12px !important;
    }
    /* overflow:hidden is what clips the panel while it animates, but it also
       clips each facet's absolutely positioned dropdown. Once the opening
       transition has finished, let content escape so the dropdowns can show. */
    .pku-filters--done { overflow: visible !important; max-height: none !important; }

    /* ---- one facet block (课程类别 / 学分 / 开课学院) ---- */
    .pku-facet {
      position: relative !important;   /* anchors its dropdown */
      align-self: start !important;
      border: 1px solid ${C.fieldBorder} !important;
      border-radius: 6px !important;
      background: #fff !important;
      transition: background .18s ease !important;
    }
    /* squared bottom corners while open, so the block and its dropdown read as
       one shape */
    /* Square while open. The radius returns as soon as closing STARTS, so it
       is not delayed until the collapse animation ends: the class is dropped on
       click and only the list keeps animating. */
    .pku-facet--open {
      background: ${C.facetBg} !important;
      border-bottom-left-radius: 0 !important;
      border-bottom-right-radius: 0 !important;
    }
    /* While closing, the list collapses quickly and carries the rounded corners
       itself, so the block never reads as square once the click has happened. */
    .pku-facet--closing .pku-facet-list {
      transition: max-height .1s ease, visibility .1s ease !important;
      border-bottom-left-radius: 6px !important;
      border-bottom-right-radius: 6px !important;
    }
    .pku-facet-btn {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 8px !important;
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 8px 10px !important;
      font-size: 13px !important;
      font-family: inherit !important;
      color: ${C.text} !important;
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      text-align: left !important;
    }
    /* The list is always in the DOM at full height and the block clips it, so
       growing max-height sweeps the clip edge down and each option is revealed
       only once the block has expanded past it. Absolute, so it covers the
       form rather than resizing the filter row. */
    .pku-facet-list {
      position: absolute !important;
      top: 100% !important;
      left: -1px !important;
      right: -1px !important;
      z-index: 960 !important;
      overflow: hidden !important;
      max-height: 0 !important;
      visibility: hidden !important;
      background: ${C.facetBg} !important;
      border: 1px solid ${C.fieldBorder} !important;
      border-top: none !important;
      border-radius: 0 0 6px 6px !important;
      box-shadow: 0 6px 18px rgba(0,0,0,0.12) !important;
      transition: max-height .24s ease, visibility .24s ease !important;
    }
    .pku-facet--open .pku-facet-list {
      max-height: 240px !important;
      visibility: visible !important;
    }
    .pku-facet-opts {
      list-style: none !important;
      margin: 0 !important;
      padding: 0 10px 8px 22px !important;   /* options indent from the label */
      max-height: 252px !important;
      overflow-y: auto !important;
    }
    .pku-opt {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 9px 0 3px !important;   /* more room above each option */
      font-size: 13px !important;
      color: ${C.text} !important;
      cursor: pointer !important;
    }
    .pku-opt input { position: absolute !important; opacity: 0 !important;
                     width: 0 !important; height: 0 !important; }
    .pku-dot {
      width: 13px !important;
      height: 13px !important;
      flex: none !important;
      border: 1.5px solid ${C.optDot} !important;
      border-radius: 50% !important;
      background: #fff !important;
      transition: background .15s ease, border-color .15s ease !important;
    }
    .pku-opt input:checked + .pku-dot {
      background: ${C.btnBlue} !important;
      border-color: ${C.btnBlue} !important;
      box-shadow: inset 0 0 0 2.5px #fff !important;
    }
    .pku-opt input:focus-visible + .pku-dot {
      outline: 2px solid ${C.btnBlue} !important;
      outline-offset: 1px !important;
    }
    .pku-opt-text { font-size: 13px !important; }`

export const Footer = css`
    /* ---- footer: replaces the site's dark red copyright strip ---- */
    .pku-footer {
      width: 100% !important;
      box-sizing: border-box !important;
      margin: 24px 0 0 !important;
      padding: 9px var(--pku-gutter) !important;
      background: ${C.headerBg} !important;
      color: ${C.text} !important;
      font-size: 13px !important;
      text-align: center !important;
    }
    .pku-footer a, .pku-footer a:link, .pku-footer a:visited {
      color: ${C.link} !important;
      background: transparent !important;
      text-decoration: none !important;
    }
    .pku-footer a:hover { text-decoration: underline !important; }`

export const Pager = css`
    /* ---- pager ---- */
    /* The pager is a block below the table, not a row inside it, so the table
       (and the section wrapper around it) ends at the last data row. Its layer
       still sits above the sticky column header (880) and is opaque, so the
       header slides under it and out of sight exactly as the table runs out. */
    .pku-pager-cell {
      position: relative !important;
      z-index: 900 !important;   /* over the header row's 880 */
      box-sizing: border-box !important;
      padding: 12px 10px !important;
      border-top: 1px solid ${C.gridLine} !important;
      background: #fff !important;
    }
    .pku-pager {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-wrap: wrap !important;
      gap: 10px !important;
    }
    .pku-pg-info { font-size: 13px !important; color: ${C.text} !important; }
    /* the two ends are bare blue chevrons; prev/next are filled blue buttons */
    .pku-pg,
    .pku-pg:link,
    .pku-pg:visited {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 1px !important;
      text-decoration: none !important;
      cursor: pointer !important;
      color: ${C.btnBlue} !important;
      background: transparent !important;
    }
    /* Every control is a bare blue chevron -- no boxes, enabled or not. One rule
       set covering <a> and <span> in all link states, since the site's A:link
       rule would otherwise repaint the enabled ones. */
    a.pku-pg, a.pku-pg:link, a.pku-pg:visited, a.pku-pg:active, a.pku-pg:hover,
    span.pku-pg {
      padding: 5px 7px !important;
      border-radius: 0 !important;
      background: transparent !important;
      color: ${C.btnBlue} !important;
      text-decoration: none !important;
    }
    a.pku-pg:hover { color: ${C.btnBlueHover} !important; }
    /* unavailable ends stay in place, greyed and inert */
    .pku-pg--off {
      opacity: .35 !important;
      cursor: default !important;
      pointer-events: none !important;
    }
    /* chevrons are rotated squares, inheriting the link's colour */
    .pku-pg-chev {
      width: .42em !important;
      height: .42em !important;
      display: inline-block !important;
      border-top: 1.7px solid currentColor !important;
      border-right: 1.7px solid currentColor !important;
    }
    .pku-pg-chev--right { transform: rotate(45deg) !important; }
    .pku-pg-chev--left { transform: rotate(-135deg) !important; }
    .pku-pg--edge .pku-pg-chev + .pku-pg-chev { margin-left: -3px !important; }
    .pku-pg-jump { font-size: 13px !important; color: ${C.text} !important; }
    .pku-pg-jump select {
      font-size: 13px !important;
      font-family: inherit !important;
      padding: 4px 6px !important;
      border: 1px solid ${C.fieldBorder} !important;
      border-radius: 4px !important;
      background: #fff !important;
    }`

export const Grid = css`
    /* ---- grid: modern flat table ----
       The site's own datagrid classes are stripped from rows (and ele.js's
       yellow hover handlers neutralised) in JS, so all colour lives here. */
    table.datagrid {
      border-collapse: collapse !important;
      border: none !important;
      width: 100% !important;
      table-layout: fixed !important;   /* honours the per-column widths */
      font-size: 13px !important;
    }
    /* the site styles the header/footer ROW itself (border:1px #999, blue bg);
       reset the row as well as its cells or a stray box outlines the header */
    table.datagrid tr,
    table.datagrid tr.datagrid-header,
    table.datagrid tr.datagrid-footer {
      border: none !important;
      background: transparent !important;
    }
    /* no vertical rules anywhere; the one after 课程名 is added back below */
    table.datagrid td, table.datagrid th {
      border-left: none !important;
      border-right: none !important;
      border-bottom: none !important;
      border-top: 1px solid ${C.gridLine} !important;
      padding: 8px 10px !important;
      vertical-align: top !important;
      overflow-wrap: anywhere !important;
    }
    /* Column headers stick just below the title strip. position:sticky does not
       apply to a <tr>, so each cell sticks individually; they share one offset
       so the row stays visually intact. Every cell in the row is tinted --
       including the fold gutter -- or the blue would stop short of the left
       edge while the row's hairlines run the full width. */
    table.datagrid tr.pku-head-row > th,
    table.datagrid tr.pku-head-row > td {
      position: sticky !important;
      top: var(--pku-head-top, 0px) !important;
      z-index: 880 !important;   /* under the title strip, over the rows */
      border-top: none !important;
      background: ${C.headBg} !important;
      color: ${C.text} !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      text-align: center !important;
      vertical-align: middle !important;
    }
    /* a datagrid with no section title has no title strip to sit under, so its
       column headers pin at the nav's bottom edge instead of leaving a gap */
    table.datagrid.pku-no-title tr.pku-head-row > th,
    table.datagrid.pku-no-title tr.pku-head-row > td {
      top: var(--pku-stick-top, 0px) !important;
    }
    /* headers wrap onto further lines rather than being clipped */
    table.datagrid th .pku-head {
      display: block !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
    }
    /* ---- the horizontally scrolling detail pane ----
       One pane per row, all sharing the same fixed inner column widths and
       kept in scroll sync, so the columns line up down the table. */
    /* rules on both edges of the scrolling pane, marking where the fixed
       columns end and resume */
    table.datagrid .pku-scrollcell {
      padding: 0 !important;
      overflow: hidden !important;
      border-left: 1px solid ${C.edgeLine} !important;
      border-right: 1px solid ${C.edgeLine} !important;
    }
    /* Panes stay IN FLOW. An absolutely positioned pane collapses its cell to
       zero height, which loses the scrollbar entirely.
       The data rows hide their bars; the header keeps its own, left as the
       platform's overlay scrollbar -- floating, so it costs no layout height
       and cannot push the labels off centre. Do NOT give it an explicit
       ::-webkit-scrollbar height: that forces a classic space-taking bar back. */
    .pku-hscroll {
      overflow-x: auto !important;
      overflow-y: hidden !important;
    }
    table.datagrid tr:not(.pku-head-row) .pku-hscroll {
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    table.datagrid tr:not(.pku-head-row) .pku-hscroll::-webkit-scrollbar {
      display: none !important;
      height: 0 !important;
    }
    table.pku-inner {
      border-collapse: collapse !important;
      table-layout: fixed !important;
      width: max-content !important;
      background: transparent !important;
    }
    table.pku-inner td, table.pku-inner th {
      border: none !important;
      background: transparent !important;
      padding: 8px 10px !important;
      vertical-align: top !important;
      overflow-wrap: anywhere !important;
    }
    /* The scrolling columns hold unbounded text, so they are pinned to exactly
       two lines: short values are padded out to two, long ones clipped at two.
       上课/考试信息 is the exception -- it holds every meeting on its own line,
       so it keeps its natural (block) height instead of the two-line clamp. Its
       height must stay overridable so the fold animation can collapse it. */
    table.pku-inner td:not(.pku-info-cell) .pku-cell {
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
      height: 3em !important;          /* 2 rows at line-height 1.5 */
      min-height: 3em !important;
      line-height: 1.5 !important;
    }
    /* the pane's header labels sit middle-aligned like the fixed header cells,
       or the scrolling titles ride high against their neighbours */
    table.datagrid tr.pku-head-row .pku-scrollcell,
    table.datagrid tr.pku-head-row table.pku-inner th,
    table.datagrid tr.pku-head-row table.pku-inner td {
      vertical-align: middle !important;
    }
    /* the header pane fills its cell so its centred labels line up with the
       fixed header cells beside it */
    table.datagrid tr.pku-head-row .pku-hscroll { height: 100% !important; }
    /* a slimmer bar than the platform default */
    table.datagrid tr.pku-head-row .pku-hscroll { scrollbar-width: thin !important; }
    table.datagrid tr.pku-head-row .pku-hscroll::-webkit-scrollbar {
      height: 5px !important;
    }
    table.datagrid tr.pku-head-row .pku-hscroll::-webkit-scrollbar-thumb {
      background: ${C.edgeLine} !important;
      border-radius: 3px !important;
    }
    table.datagrid tr.pku-head-row .pku-hscroll::-webkit-scrollbar-track {
      background: transparent !important;
    }
    /* header cells carry no two-row floor: that is for data cells only */
    table.datagrid tr.pku-head-row .pku-cell { min-height: 0 !important; }
    table.datagrid .pku-col-name {
      border-right: 1px solid ${C.gridLine} !important;
    }

    /* each cell is at least two text rows tall and grows as needed */
    /* every data cell is at least two text rows tall, and grows beyond that */
    table.datagrid td .pku-cell {
      display: block !important;
      line-height: 1.5 !important;
      min-height: 3em !important;   /* 2 rows at line-height 1.5 */
    }

    /* course names read as links: blue, underlined only on hover */
    /* Bright blue, underlined only on hover, colour never changing. These must
       match the <a> itself: style.css sets A:link/:visited/:active to #7777AA
       with an underline, so styling the wrapper span loses to it. */
    table.datagrid a,
    table.datagrid a:link,
    table.datagrid a:visited,
    table.datagrid a:active,
    table.datagrid a:hover {
      color: ${C.courseLink} !important;
      background: transparent !important;
      text-decoration: none !important;
      cursor: pointer !important;
    }
    table.datagrid a:hover { text-decoration: underline !important; }
    table.datagrid a span, table.datagrid a font {
      color: inherit !important;
      text-decoration: inherit !important;
    }

    /* zebra, fixed at load while everything is unfolded */
    tr.pku-r-even > td { background: ${C.zebraEven} !important; }
    tr.pku-r-odd  > td { background: ${C.zebraOdd} !important; }
    /* a collapsed leader reads blue; hover is lighter than that */
    tr.pku-f-name > td { background: ${C.rowFolded} !important; }
    table.datagrid tr.pku-row:hover > td { background: ${C.rowHover} !important; }`

export const Warnings = css`
    /* ---- warnings ----
       Declared AFTER the zebra, fold and hover rules so they win on equal
       specificity. Nothing here blocks a selection: the server enforces the
       real rules, these are only a heads-up. A time clash outranks a credit
       overrun when a row is both. */
    table.datagrid tr.pku-over-credit > td {
      background: ${C.warnCredit} !important;
    }
    table.datagrid tr.pku-clash > td {
      background: ${C.warnClash} !important;
      color: ${C.warnClashText} !important;
    }
    /* a folded leader keeps its blue even when it is also flagged clash/credit;
       the extra class wins over the single warning class on specificity */
    table.datagrid tr.pku-f-name.pku-clash > td,
    table.datagrid tr.pku-f-name.pku-over-credit > td {
      background: ${C.rowFolded} !important;
      color: ${C.text} !important;
    }

    table.datagrid tr.pku-clash a,
    table.datagrid tr.pku-over-credit a {
      color: ${C.courseLink} !important;
    }
    table.datagrid tr.pku-clash:hover > td,
    table.datagrid tr.pku-over-credit:hover > td {
      filter: brightness(0.97) !important;
    }

    /* rule between one course name and the next; only when this grid asked for
       thick separators (the 已选列表 grid uses plain row hairlines instead) */
    tr.pku-group-start > td, tr.pku-group-start > th {
      border-top: 1px solid ${C.groupLine} !important;
    }`

export const Fold = css`
    /* ---- fold animation ----
       The row's box animates; the text inside it does not.

       Every cell already keeps its content in one wrapper -- .pku-cell for an
       ordinary column, .pku-hscroll for the horizontal pane. armFold pins that
       wrapper to the height it has right now, and the fold moves only the box
       around the text: the wrapper's height, and the cell's own vertical
       padding. Neither changes the wrapper's WIDTH, so the text is laid out
       exactly once and is only ever clipped -- never re-wrapped, never
       re-metricked -- while the table below rides the collapse frame by frame
       instead of jumping when it ends.

       The padding has to stay on the CELL rather than move into the wrapper: a
       wrapper carrying its own padding cannot be sized below it, so the rows
       would stall a padding's worth short of closed and snap the rest away.
       Cell padding and wrapper height are both linear in the same easing, so
       the row's height is their sum and tracks the fold exactly.

       Nothing inside the pane is touched either: .pku-hscroll clips the whole
       nested table in one go, so its cells keep their two-line clamp and their
       horizontal scroll position. */
    table.datagrid tr.pku-fold > td {
      overflow: hidden !important;
      border-top-width: 0 !important;   /* folded into the wrapper's height */
    }
    table.datagrid tr.pku-fold > td > .pku-cell {
      display: block !important;
      overflow: hidden !important;
      min-height: 0 !important;         /* the 3em floor would stop the collapse */
    }
    /* the closed end of the fold; the wrapper heights are driven inline */
    table.datagrid tr.pku-fold--shut > td {
      padding-top: 0 !important;
      padding-bottom: 0 !important;
    }
    /* armed only for the animation itself, so pinning the row is instant */
    table.datagrid tr.pku-fold--anim > td {
      transition: padding-top .24s ease, padding-bottom .24s ease !important;
    }
    table.datagrid tr.pku-fold--anim > td > .pku-cell,
    table.datagrid tr.pku-fold--anim > td > .pku-hscroll {
      transition: height .24s ease !important;
    }
    tr.pku-hidden { display: none !important; }
    /* the filter hides rows independently of folding, so the two never fight */
    tr.pku-filtered-out { display: none !important; }

    /* ele.js swaps a hovered row's class to datagrid-all (yellow-green). Its
       handlers are cleared in JS, but it runs after this script, so the class
       is neutralised here too: our own hover colour wins either way. */
    table.datagrid tr.datagrid-all > td { background: ${C.rowHover} !important; }
    table.datagrid tr.datagrid-all.pku-f-name > td {
      background: ${C.rowFolded} !important;
    }

    .pku-folded-mark {
      font-size: 12px !important;
      color: ${C.noteText} !important;
    }

    /* fold toggle sits in a narrow leading column, outside the data cells */
    table.datagrid .pku-foldcell--empty {
      width: 4px !important;
      padding: 0 !important;
    }
    table.datagrid td.pku-foldcell,
    table.datagrid th.pku-foldcell {
      width: 26px !important;
      padding: 8px 0 8px 4px !important;
      text-align: center !important;
      vertical-align: middle !important;
    }
    .pku-fold-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 1.5em !important;
      height: 1.5em !important;
      padding: 0 !important;
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      color: ${C.text} !important;
      font-size: 13px !important;
    }

    /* the site's own 课程表 (the inline one kept on 选课结果) pads every cell 5px
       left via its .course class; trim it to near nothing like the floating one */
    #classAssignment .course { padding-left: 2px !important; }`

export const Timetable = css`
    /* ---- floating timetable ----
       The site's 学期课程表 rebuilt as a floating window: a light-blue sliver of
       weekday headings across the top, bare period numerals down the side, and
       one cell per period holding just the course name (tagged with its week
       pattern) and its exam line. Cells keep the site's own colours, which are
       the only thing telling one course from another. */
    .pku-tt {
      position: fixed !important;
      z-index: 3000 !important;
      display: flex !important;
      align-items: stretch !important;
      /* One shadow, cast by the window as a whole. Given to the table and the
         bar separately, each fell across the other: the table shaded the bar
         beside it however they were stacked. The border-radius matches the
         rounded outer corners of the body and bar, so the shadow's own square
         corners don't peek out past them. */
      border-radius: 6px !important;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18) !important;
      cursor: grab !important;
      font-size: 12px !important;
      line-height: 1.25 !important;
      color: ${C.text} !important;
      --pku-tt-head-h: 20px !important;
    }
    /* The clip box. Folding animates its WIDTH while the grid inside keeps the
       width it was laid out at, so the table is hidden and revealed by its own
       edge travelling across it -- never re-wrapped, never squeezed. Same trick
       the row fold uses. */
    .pku-tt-body {
      /* Above the bar, which is a later sibling and so would otherwise paint
         its shadow across the table. Lifted, the bar's shadow lands only on
         the page behind it. */
      position: relative !important;
      z-index: 1 !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      background: #fff !important;
      border: 1px solid ${C.edgeLine} !important;
      border-right: none !important;
      border-radius: 6px 0 0 6px !important;
    }
    .pku-tt--anim .pku-tt-body {
      transition: width .24s ease, border-left-width .24s ease !important;
    }
    .pku-tt--shut .pku-tt-body { border-left-width: 0 !important; }

    .pku-tt-grid {
      display: grid !important;
      touch-action: none !important;
      height: 100% !important;
      box-sizing: border-box !important;
      background: ${C.gridLine} !important;   /* shows through as the hairlines */
      gap: 1px !important;
    }
    .pku-tt-cell, .pku-tt-head, .pku-tt-side {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
      padding: 0 !important;
      background: #fff !important;
      box-sizing: border-box !important;
    }
    /* only the top sliver is blue; the period column stays plain */
    .pku-tt-head {
      background: ${C.headerBg} !important;
      font-weight: 600 !important;
      white-space: nowrap !important;
    }
    .pku-tt-side {
      font-weight: 600 !important;
      color: ${C.noteText} !important;
      white-space: nowrap !important;
    }
    /* Text is laid out once at the grid's font size and only ever scaled DOWN
       to fit its cell, so a cramped cell loses size rather than re-wrapping.
       width:max-content keeps the box hugging its text, so the scale-down is
       centred on the text and does not leave a full-width sliver of dead space
       either side. */
    .pku-tt-fit {
      width: max-content !important;
      flex: none !important;          /* don't let flexbox squeeze it back down */
      padding: 2px 2px !important;
      box-sizing: border-box !important;
      text-align: center !important;
      overflow-wrap: anywhere !important;
      transform-origin: center center !important;
    }
    .pku-tt-exam { opacity: .75 !important; }
    /* two courses clashing in one period, ruled off from each other; the rule
       is inset so it reads as a divider inside the cell, not a grid line */
    .pku-tt-sep {
      width: 55% !important;
      margin: 1px auto !important;
      border-top: 1px solid currentColor !important;
      opacity: .45 !important;
    }

    /* the drag bar down the right edge, with the fold chevron at its top */
    .pku-tt-bar {
      flex: none !important;
      width: 30px !important;   /* wide enough to grab without aiming */
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      padding-top: 5px !important;
      box-sizing: border-box !important;
      background: ${C.headerBg} !important;
      border: 1px solid ${C.edgeLine} !important;
      border-radius: 0 6px 6px 0 !important;
      touch-action: none !important;
    }
    .pku-tt--dragging, .pku-tt--dragging .pku-tt-bar { cursor: grabbing !important; }
    /* the grip has its own job, and the chevron is a button */
    .pku-tt-grip, .pku-tt-chev { cursor: default !important; }
    .pku-tt-chev { cursor: pointer !important; }
    .pku-tt-grip { cursor: nesw-resize !important; }
    .pku-tt-chev {
      flex: none !important;
      width: 28px !important;   /* large, forgiving click target */
      height: 28px !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background: none !important;
      border: none !important;
      cursor: pointer !important;
      color: ${C.text} !important;
    }
    /* points at the edge the table will travel to: right to shut it into the
       bar, left to pull it back out. The pivot sits inside the V, half way
       between the box centre and the tip, so the two states hinge about the
       same point without swinging the glyph out to the edge. */
    .pku-tt-chev .pku-chev {
      transform: rotate(-45deg) !important;
      transform-origin: 65% 65% !important;
      transition: transform .24s ease !important;
    }
    .pku-tt--shut .pku-tt-chev .pku-chev { transform: rotate(135deg) !important; }

    /* Resize grip: a bare L outside the bottom-left corner, thickening under
       the pointer. Dragging it moves that corner while the top-right one --
       the bar's own corner -- stays put. */
    .pku-tt-grip {
      position: absolute !important;
      left: -11px !important;
      bottom: -11px !important;
      width: 17px !important;
      height: 17px !important;
      cursor: nesw-resize !important;
      touch-action: none !important;
    }
    .pku-tt--shut .pku-tt-grip { display: none !important; }
    .pku-tt-grip::before {
      content: '' !important;
      position: absolute !important;
      inset: 0 !important;
      border-left: 2px solid ${C.text} !important;
      border-bottom: 2px solid ${C.text} !important;
      border-bottom-left-radius: 5px !important;
      /* drop-shadow traces the L itself; box-shadow would outline the box */
      filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.45)) !important;
      transition: border-width .12s ease !important;
    }
    .pku-tt-grip:hover::before,
    .pku-tt--sizing .pku-tt-grip::before {
      border-left-width: 4px !important;
      border-bottom-width: 4px !important;
    }

    /* A 预选 has changed the taken list, so the timetable's clash/credit marks
       are stale until 选课结果 re-reads it. Blur the grid and lay the notice
       over it. The overlay is pointer-transparent so drag/fold/resize keep
       working through it. */
    .pku-tt--stale .pku-tt-grid {
      filter: blur(8px) !important;
    }
    .pku-tt-stale {
      position: absolute !important;
      inset: 0 !important;
      z-index: 2 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      box-sizing: border-box !important;
      padding: 20px !important;
      text-align: center !important;
      pointer-events: none !important;
    }
    .pku-tt-stale-main {
      font-size: 14px !important;
      font-weight: 600 !important;
      line-height: 1.5 !important;
      color: ${C.text} !important;
    }
    .pku-tt-stale-sub {
      font-size: 11px !important;
      line-height: 1.5 !important;
      color: ${C.noteText} !important;
    }
  `
