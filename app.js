/*
 * Measurement to Production
 *
 *  Jobs list  ->  Measurement (site)  ->  Review & approve  ->  Production sheet
 *
 * Everything is saved on this device by itself while typing.
 */
(function () {
  const C = window.CONFIG;
  const $app = document.getElementById('app');
  let settings = { toleranceMm: C.toleranceMm, keys: C.designKeys.map((x) => x.slice()), glass: C.glass.slice(), colours: C.colours.slice(), locations: C.locations.slice(), sections: C.sections.slice(),
    defaults: { colour: C.defaults.colour, glass: Object.assign({}, C.defaults.glass), section: Object.assign({}, C.defaults.section) } };
  let job = null;        // the job open right now
  let saveTimer = null;
  let pane = 'job';      // what a phone shows: 'job' (measurements), 'review' or 'sheet'
  let tab = 'review';    // what the right-hand side shows on a wide screen: 'review' or 'sheet'
  let previewTimer = null;
  let siteOpen = null;           // site details open or folded to one line (null: decide by itself)
  const openRows = new Set();   // rows whose details (quantity, remarks, type, move, delete) are open
  // one step at a time on every screen (measurement -> approval -> production sheet)
  const wide = () => false;
  const allApproved = (j) => j.items.length > 0 && j.items.every((i) => i.approved);
  const canReview = (j) => !!j.sentToReview && j.items.length > 0;

  // ---------- small helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };
  const typeOf = (key) => C.types.find((t) => t.key === key) || C.types[0];
  const mm = (v) => (v == null || v === '' ? '–' : `${v}`);
  const qtyOf = (it) => Math.max(1, parseInt(it.qty, 10) || 1);

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
  }

  function fillLists() {
    document.getElementById('dl-glass').innerHTML = settings.glass.map((d) => `<option value="${esc(d)}">`).join('');
    document.getElementById('dl-colour').innerHTML = settings.colours.map((d) => `<option value="${esc(d)}">`).join('');
  }

  // ---------- saving ----------
  function touch() {
    if (!job) return;
    job.updated = new Date().toISOString();
    job.status = jobStatus(job);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
    navSoon();
    setSaved('Saving…');
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!job) return Promise.resolve();
    const j = job;
    return DB.putJob(j).then(() => setSaved('Saved'), (e) => { setSaved('Not saved!'); alert('Could not save: ' + e); });
  }
  function setSaved(txt) {
    const el = document.querySelector('[data-saved]');
    if (el) el.textContent = txt;
  }
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  // ---------- job & item logic ----------
  function jobStatus(j) {
    const items = j.items || [];
    if (!items.length) return 'measuring';
    if (items.every((i) => i.approved)) return 'approved';
    if (j.sentToReview || items.some((i) => i.approved)) return 'review';
    return 'measuring';
  }
  const STATUS = { measuring: 'Measuring', review: 'Waiting approval', approved: 'Approved for production' };

  function nextCode(j, typeKey) {
    const p = typeOf(typeKey).prefix;
    let max = 0;
    (j.items || []).forEach((i) => {
      const m = String(i.code || '').match(new RegExp('^' + p + '(\\d+)$', 'i'));
      if (m) max = Math.max(max, Number(m[1]));
    });
    return p + (max + 1);
  }
  function newItem(j, typeKey) {
    return {
      id: uid(), type: typeKey, code: nextCode(j, typeKey),
      w: ['', '', ''], h: ['', '', ''],
      location: '', qty: 1, colour: settings.defaults.colour, design: '', glass: defaultGlass(typeKey), section: defaultSection(typeKey), remarks: '',
      final: null, approved: false, approvedAt: null, approvedSig: null,
    };
  }
  // a new item starts as White, with 5 mm Clear glass for a window and 5 mm Pinned for a ventilator
  const defaultSection = (typeKey) => (settings.defaults.section || {})[typeKey] || (settings.defaults.section || {}).W || '';
  const defaultGlass = (typeKey) => settings.defaults.glass[typeKey] || settings.defaults.glass.W || '';
  // measurements changed after approval -> approval no longer valid
  function dropStaleApproval(item) {
    if (item.approved && item.approvedSig !== RULES.signature(item)) {
      item.approved = false; item.approvedAt = null; item.approvedSig = null; item.final = null;
      return true;
    }
    return false;
  }
  function dupCodes(j) {
    const seen = {}, dup = new Set();
    j.items.forEach((i) => { const k = String(i.code).trim().toUpperCase(); if (seen[k]) dup.add(k); seen[k] = 1; });
    return dup;
  }

  async function nextJobNo() {
    const n = ((await DB.get('jobCounter')) || 0) + 1;
    await DB.set('jobCounter', n);
    return C.jobPrefix + String(n).padStart(4, '0');
  }

  // ---------- left sidebar ----------
  const ICON = {
    jobs: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    new: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
    job: '<path d="M3 7h18M3 12h18M3 17h18"/><path d="M7 4v16"/>',
    review: '<path d="M5 12l5 5L20 7"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  function ring(frac) {
    const r = 17, c = 2 * Math.PI * r;
    return `<svg class="ring" viewBox="0 0 44 44" aria-label="${Math.round(frac * 100)}% approved"><circle cx="22" cy="22" r="${r}" class="ring-bg"/>
      <circle cx="22" cy="22" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}"/>
      <text x="22" y="26" text-anchor="middle">${Math.round(frac * 100)}%</text></svg>`;
  }
  let navTimer = null;
  function navSoon() { clearTimeout(navTimer); navTimer = setTimeout(renderNav, 250); }
  async function renderNav() {
    const view = location.hash.replace(/^#\/?/, '').split('/')[0] || 'home';
    const jobCount = (await DB.allJobs()).length;
    const inJob = job && ['job', 'review', 'sheet'].includes(view);
    // which stage is "current": on a PC the right-hand tab, on a phone the screen shown
    const cur = inJob ? (wide() ? tab : pane) : null;
    let stages = '';
    if (inJob) {
      const n = job.items.length, ok = job.items.filter((i) => i.approved).length;
      const over = job.items.filter((i) => RULES.check(i, settings.toleranceMm).flagged && !i.approved).length;
      const pcs = job.items.filter((i) => i.approved).reduce((a, i) => a + qtyOf(i), 0);
      const st = [
        ['job', 'job', '1 · Measurement', `${n} item${n === 1 ? '' : 's'}${job.sentToReview ? ' · complete' : ''}`, job.sentToReview ? 'done' : '', true],
        ['review', 'review', '2 · Approval', canReview(job) ? `${ok} of ${n} approved${over ? ` · ${over} over ${settings.toleranceMm} mm` : ''}` : 'after measurement', over ? 'warn' : allApproved(job) ? 'done' : '', canReview(job)],
        ['sheet', 'sheet', '3 · Production sheet', allApproved(job) ? `${pcs} pcs ready` : 'after approval', '', allApproved(job)],
      ];
      stages = `<div class="navsec">
        <p class="navlabel">Current job</p>
        <div class="navjob">${ring(n ? ok / n : 0)}<div><b>${esc(job.no)}</b><span>${esc(job.customer || 'No customer name')}</span></div></div>
        ${st.map(([k, ic, label, sub, cls, open]) => open
          ? `<a href="#/${k}/${job.id}" class="navitem stage ${cur === k ? 'active' : ''} ${cls}">${svg(ic)}<span>${label}<small>${sub}</small></span></a>`
          : `<span class="navitem stage locked" title="Opens ${sub}">${svg('lock')}<span>${label}<small>${sub}</small></span></span>`).join('')}
      </div>`;
    }
    document.getElementById('navlist').innerHTML = `
      <a href="#/" class="navitem ${view === 'home' ? 'active' : ''}">${svg('jobs')}<span>Jobs</span><em class="badge">${jobCount}</em></a>
      <a href="#" class="navitem navnew" data-nav="new-job">${svg('new')}<span>New job</span></a>
      ${stages}
      <a href="#/settings" class="navitem navset ${view === 'settings' ? 'active' : ''}">${svg('settings')}<span>Settings</span></a>`;
  }
  document.getElementById('navlist').addEventListener('click', async (e) => {
    const a = e.target.closest('[data-nav="new-job"]');
    if (!a) return;
    e.preventDefault();
    await newJob();
  });

  // ---------- routing ----------
  async function route() {
    await saveNow();
    const h = location.hash.replace(/^#\/?/, '');
    const [view, id] = h.split('/');
    const work = ['job', 'review', 'sheet'].includes(view);
    document.body.dataset.view = work ? 'work' : view || 'home';
    if (work && job && job.id === id) {
      // a step can only be opened once the one before it is done
      if (view === 'review' && !canReview(job)) { toast('Mark the measurements complete first'); location.replace(`#/job/${id}`); return; }
      if (view === 'sheet' && !allApproved(job)) { toast('Approve every window first'); location.replace(`#/${canReview(job) ? 'review' : 'job'}/${id}`); return; }
    }
    if (work) {
      pane = view;
      if (view !== 'job') tab = view;
      // same job already open: only switch what is shown, keep the measurements where they are
      if (job && job.id === id && $app.querySelector('.workspace')) {
        if (!wide()) window.scrollTo(0, 0);
        return showPane();
      }
    }
    window.scrollTo(0, 0);
    if (!view) { await viewHome(); return renderNav(); }
    if (view === 'settings') { viewSettings(); return renderNav(); }
    job = await DB.getJob(id);
    if (!job) { location.hash = '#/'; return; }
    siteOpen = null; openRows.clear();
    job.items = job.items || [];
    job.items.forEach(dropStaleApproval);
    if (view === 'review' && !canReview(job)) { location.replace(`#/job/${id}`); return; }
    if (view === 'sheet' && !allApproved(job)) { location.replace(`#/${canReview(job) ? 'review' : 'job'}/${id}`); return; }
    if (work) return viewWork();
    location.hash = '#/';
  }
  window.addEventListener('hashchange', route);

  // ================= Jobs list =================
  let homeFilter = 'all';
  async function viewHome() {
    job = null;
    const jobs = (await DB.allJobs()).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    const count = (st) => jobs.filter((j) => jobStatus(j) === st).length;
    const pcs = jobs.reduce((a, j) => a + (j.items || []).filter((i) => i.approved).reduce((x, i) => x + qtyOf(i), 0), 0);
    const hr = new Date().getHours();
    const hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    const tiles = [
      ['all', 'All jobs', jobs.length, ''],
      ['measuring', 'Measuring', count('measuring'), 'blue'],
      ['review', 'Waiting approval', count('review'), 'amber'],
      ['approved', 'Ready for production', count('approved'), 'green'],
    ];
    $app.innerHTML = `
      <section class="hero">
        <svg class="heroart" viewBox="0 0 320 160" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.4">
          <rect x="10" y="12" width="120" height="136" rx="3"/><line x1="70" y1="12" x2="70" y2="148"/><path d="M40 80h20m-5-4 5 4-5 4M100 80H80m5-4-5 4 5 4"/>
          <rect x="150" y="12" width="76" height="136" rx="3"/><path d="M156 18 L220 80 L156 142" stroke-dasharray="5 4"/>
          <rect x="246" y="12" width="64" height="64" rx="3"/><path d="M252 18 L278 70 L304 18" stroke-dasharray="5 4"/>
          <rect x="246" y="86" width="64" height="62" rx="3"/><circle cx="278" cy="117" r="18"/><circle cx="278" cy="117" r="3"/></g></svg>
        <div class="hero-text">
          <p class="eyebrow">Titans Windows · Measurement to Production</p>
          <h1>${hello}</h1>
          <p>Measure on site, approve the sizes, and hand the factory a clean production sheet.</p>
        </div>
        <button class="btn shine" data-act="new-job">+ New job</button>
      </section>
      <div class="stats">
        ${tiles.map(([k, l, n, c]) => `<button class="stat ${c} ${homeFilter === k ? 'on' : ''}" data-act="filter" data-f="${k}"><b>${n}</b><span>${l}</span></button>`).join('')}
        <div class="stat gold"><b>${pcs}</b><span>Pieces approved</span></div>
      </div>
      <div class="listhead">
        <h2>${homeFilter === 'all' ? 'Recent jobs' : esc(tiles.find((t) => t[0] === homeFilter)[1])}</h2>
        <input class="search" type="search" placeholder="Search customer, site, job no…" data-search>
      </div>
      <div class="jobgrid">
        ${jobs.length ? jobs.map(jobCard).join('') : `<div class="empty big">
            <b>No jobs yet</b><span>Tap <b>+ New job</b> to start measuring your first site.</span></div>`}
      </div>`;
    applyHomeFilter();
  }
  function applyHomeFilter() {
    const q = (document.querySelector('[data-search]') || {}).value || '';
    document.querySelectorAll('.jobcard').forEach((c) => {
      c.hidden = (homeFilter !== 'all' && c.dataset.status !== homeFilter) || (q && !c.dataset.text.includes(q.trim().toLowerCase()));
    });
  }
  function jobCard(j) {
    const items = j.items || [];
    const n = items.length, ok = items.filter((i) => i.approved).length;
    const pct = n ? Math.round((ok / n) * 100) : 0;
    const st = jobStatus(j);
    const over = items.filter((i) => !i.approved && RULES.check(i, settings.toleranceMm).flagged).length;

    return `<a class="jobcard" href="#/job/${j.id}" data-status="${st}" data-text="${esc([j.no, j.customer, j.site, j.address].join(' ').toLowerCase())}">
      <div class="jc-top"><span class="jobno">${esc(j.no)}</span><span class="pill ${st}">${STATUS[st]}</span></div>
      <b class="jc-name">${esc(j.customer || 'No customer name')}</b>
      <span class="jc-meta">${esc(j.site || j.address || 'Site not set')} · ${fmtDate(j.date)}</span>
      <div class="jc-codes">${items.slice(0, 6).map((i) => `<span>${esc(i.code)}${i.design ? ' · ' + esc(i.design) : ''}</span>`).join('') || '<span class="muted">No windows yet</span>'}${items.length > 6 ? `<span class="muted">+${items.length - 6} more</span>` : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="jc-foot"><span><b>${ok}</b>/${n} approved</span>${over ? `<span class="warn">⚠ ${over} over ${settings.toleranceMm} mm</span>` : `<span>${items.reduce((a, i) => a + qtyOf(i), 0)} pcs</span>`}</div>
    </a>`;
  }

  // ================= Job: measurements (left) + live review / production sheet (right) =================
  function viewWork() {
    const dup = dupCodes(job);
    $app.innerHTML = `
      <div data-steps></div>
      <div class="workspace">
        <div class="formcol noprint">
          <div class="jobhead">
            <h1>${esc(job.no)}</h1><span class="saved" data-saved>Saved</span>
            <span class="grow"></span>
            <button class="linkbtn danger" data-act="del-job">Delete job</button>
          </div>
          <section class="site ${isSiteOpen() ? 'open' : ''}">
            <button class="site-sum" data-act="site" aria-expanded="${isSiteOpen()}"><span data-sitesum>${siteSummary()}</span><i>${isSiteOpen() ? 'Done' : 'Edit'}</i></button>
            <div class="site-form" ${isSiteOpen() ? '' : 'hidden'}>
              ${field('Customer name', 'customer')}
              ${field('Phone', 'phone', 'tel')}
              ${field('Date', 'date', 'date')}
              ${field('Site / project', 'site')}
              ${field('Measured by', 'measuredBy')}
              ${field('Address', 'address')}
            </div>
          </section>
          ${job.items.length ? `<div class="rowhead" title="In mm: 3 widths (left, centre, right), 3 heights (top, middle, bottom), then tap Design"><span>Code</span><span>Width <small>mm</small></span><span>Height <small>mm</small></span><span>Design</span></div>` : ''}
          <div class="items" data-items>
            ${job.items.map((it, idx) => itemCard(it, idx, dup)).join('')}
          </div>
          ${job.items.length ? '' : `<div class="empty">No windows yet. Add a window or a ventilator below,<br>then type 3 widths (left, centre, right) and 3 heights (top, middle, bottom) in mm.</div>`}
          <div class="addbar">
            ${C.types.map((t) => `<button class="btn" data-act="add" data-type="${t.key}">+ Add ${esc(t.label)} <em>${esc(nextCode(job, t.key))}</em></button>`).join('')}
          </div>
        </div>
        <aside class="previewcol">
          <div class="previewhead noprint">
            <div><h2 data-ptitle></h2><small class="muted" data-psub></small></div>
            <span data-paction></span>
          </div>
          <div data-preview></div>
        </aside>
      </div>
      <div class="footbar noprint" data-foot></div>`;
    $app.querySelectorAll('.item').forEach((card) => markRow(card, job.items.find((i) => i.id === card.dataset.id)));
    showPane();
  }

  // what is shown where: on a wide screen measurements left + tab right; on a phone one at a time
  function showPane() {
    const ws = $app.querySelector('.workspace');
    if (!ws) return;
    ws.dataset.pane = pane;
    $app.querySelector('[data-steps]').innerHTML = steps(pane);
    const show = wide() ? tab : pane;
    $app.querySelector('[data-ptitle]').textContent = show === 'sheet' ? (sheetKind === 'install' ? 'Installation sheet' : 'Factory sheet') : 'Approve each window';
    $app.querySelector('[data-psub]').textContent = `${job.no} · ${job.customer || 'No customer name'}` +
      (show === 'sheet' ? (sheetKind === 'install' ? ' · for the installation team' : ' · for the factory') : ' · check the sizes, then approve');
    $app.querySelector('[data-paction]').innerHTML = show === 'sheet'
      ? `<div class="seg"><button data-act="kind" data-k="factory" class="${sheetKind === 'factory' ? 'on' : ''}">Factory sheet</button><button data-act="kind" data-k="install" class="${sheetKind === 'install' ? 'on' : ''}">Installation sheet</button></div>`
      : `<button class="btn small" data-act="approve-ok">Approve all within ${settings.toleranceMm} mm</button>`;
    const approved = job.items.filter((i) => i.approved).length;
    const n = job.items.length;
    const foot = {
      job: `<button class="btn" data-act="save">Save</button>
            <button class="btn gold" data-act="to-review" ${n ? '' : 'disabled'}>✓ Mark complete &amp; proceed →</button>`,
      review: `<a class="btn ghost" href="#/job/${job.id}">← Measurements</a>
            <span class="footnote">${approved} of ${n} approved</span>
            <button class="btn gold" data-act="to-sheet" ${allApproved(job) ? '' : 'disabled'} title="${allApproved(job) ? '' : 'Approve every window first'}">Generate production sheet →</button>`,
      sheet: `<a class="btn ghost" href="#/review/${job.id}">← Approval</a>
            <button class="btn gold" data-act="print">Print / Save PDF</button>`,
    };
    // wide screen: measurements are always on the left, so the buttons follow the right-hand tab
    const key = wide() ? (job.sentToReview ? tab : 'job') : pane;
    renderNav();
    $app.querySelector('[data-foot]').innerHTML = (wide() && key !== 'job' ? `<button class="btn" data-act="save">Save</button>` : '') + foot[key];
    renderPreview();
  }
  function showFootOnly() {
    const keepTab = tab; showPane(); tab = keepTab;
  }
  function renderPreview() {
    clearTimeout(previewTimer);
    const el = $app.querySelector('[data-preview]');
    if (!el) return;
    const keep = el.parentElement.scrollTop;
    el.innerHTML = tab === 'sheet' ? sheetHtml() : reviewHtml();
    el.parentElement.scrollTop = keep;
  }
  function previewSoon() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 200);
  }
  // the "Approved" badge on a measurement card, kept in step with the right-hand side
  function refreshCardPills() {
    $app.querySelectorAll('.item').forEach((card) => {
      const it = job.items.find((i) => i.id === card.dataset.id);
      if (it) card.querySelector('[data-pill]').innerHTML = it.approved ? `<span class="pill approved">Approved</span>` : '';
    });
  }
  function isSiteOpen() { return siteOpen == null ? !job.customer : siteOpen; }
  function siteSummary() {
    const bits = [job.site, job.measuredBy && `by ${job.measuredBy}`, fmtDate(job.date)].filter(Boolean).map(esc);
    return `<b>${esc(job.customer) || 'Customer & site details'}</b>${bits.length ? `<small>${bits.join(' · ')}</small>` : ''}`;
  }
  function field(label, key, type = 'text', cls = '') {
    return `<label class="f ${cls}"><span>${label}</span><input type="${type}" data-job="${key}" value="${esc(job[key] || '')}"></label>`;
  }

  // one line per window: code | width L C R | height T M B | design | more
  function itemCard(it, idx, dup) {
    const isDup = dup && dup.has(String(it.code).trim().toUpperCase());
    const open = openRows.has(it.id);
    const sub = rowSubText(it);
    return `<section class="item ${it.type === 'V' ? 'vent' : ''} ${open ? 'open' : ''}" data-id="${it.id}">
      <div class="row">
        <div class="codecol">
          <input class="code ${isDup ? 'bad' : ''}" data-k="code" value="${esc(it.code)}" title="${isDup ? 'This code is used twice' : 'Code (you can change it)'}" aria-label="Code">
          <button class="icon more" data-act="more" title="More: quantity, remarks, type, move, delete">${open ? '▴' : '⋯'}</button>
        </div>
        <div class="trio" data-g="w">${mInput('w', 0, 'Width left', it)}${mInput('w', 1, 'Width centre', it)}${mInput('w', 2, 'Width right', it)}</div>
        <div class="trio" data-g="h">${mInput('h', 0, 'Height top', it)}${mInput('h', 1, 'Height middle', it)}${mInput('h', 2, 'Height bottom', it)}</div>
        <button class="design ${it.design ? '' : 'empty'}" data-act="keypad" title="Design">${designFace(it)}</button>
      </div>
      <div class="specs">
        <label class="sf"><span>Location</span>${pick('location', it.location, settings.locations)}</label>
        <label class="sf"><span>Colour</span>${pick('colour', it.colour, settings.colours)}</label>
        <label class="sf"><span>Glass</span>${pick('glass', it.glass, settings.glass)}</label>
        <label class="sf"><span>Section</span>${pick('section', it.section, settings.sections)}</label>
      </div>
      <div class="rowsub"><span data-status>${rowStatus(it)}</span><span class="muted" data-sub>${esc(sub)}</span><span data-pill>${it.approved ? `<span class="pill approved">Approved</span>` : ''}</span></div>
      <div class="details" ${open ? '' : 'hidden'}>
        <div class="grid">
          <label class="f"><span>Quantity</span><input inputmode="numeric" pattern="[0-9]*" data-k="qty" value="${esc(it.qty == null ? 1 : it.qty)}"></label>
          <label class="f wide"><span>Remarks</span><textarea data-k="remarks" rows="2" placeholder="Opening side, site conditions…">${esc(it.remarks)}</textarea></label>
        </div>
        <div class="sitephotos">
          <span class="sp-label">Site photos <small>for the installation team (optional)</small></span>
          <div class="ph-list" data-phlist>${photoTiles(it)}</div>
        </div>
        <div class="dactions">
          <span class="grow"></span>
          <select data-k="type" aria-label="Type">${C.types.map((x) => `<option value="${x.key}" ${x.key === it.type ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
          <button class="icon" data-act="up" title="Move up">↑</button>
          <button class="icon" data-act="down" title="Move down">↓</button>
          <button class="icon danger" data-act="del" title="Delete">✕</button>
        </div>
      </div>
    </section>`;
  }
  // item field -> [its list in settings, label]
  const LISTS = { location: ['locations', 'Location'], colour: ['colours', 'Colour'], glass: ['glass', 'Glass'], section: ['sections', 'Section'] };
  // a drop-down of the usual choices; "Other…" lets anything else be typed (and keeps it in the list)
  function pick(key, val, list) {
    const all = val && !list.includes(val) ? [val, ...list] : list;
    return `<select data-k="${key}">${val ? '' : '<option value="" selected>–</option>'}${all.map((x) => `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('')}<option value="__other">Other…</option></select>`;
  }
  function mInput(dim, i, label, it) {
    const tag = 'LCRTMB'[dim === 'w' ? i : i + 3];
    return `<label class="mv"><i>${tag}</i><input inputmode="numeric" pattern="[0-9]*" data-m="${dim}" data-i="${i}" value="${esc(it[dim][i])}" aria-label="${label}" title="${label}"></label>`;
  }
  // short status under the line: least size, and the difference in red if over the limit
  function rowStatus(it) {
    const r = RULES.check(it, settings.toleranceMm);
    if (!r.w.count && !r.h.count) return '';
    const part = (s, over) => s.count
      ? `<b class="${over ? 'over' : 'ok'}">${s.min}${s.complete ? '' : '?'}</b>${s.count > 1 && s.diff ? `<small class="${over ? 'over' : ''}">${over ? '⚠ ' : ''}±${s.diff}</small>` : ''}`
      : '<b>–</b>';
    return `<span class="least">${part(r.w, r.wOver)} × ${part(r.h, r.hOver)}</span>`;
  }
  // colour the width / height boxes: least in yellow, the whole set red if over the limit
  function markRow(card, it) {
    const r = RULES.check(it, settings.toleranceMm);
    ['w', 'h'].forEach((g) => {
      const st = r[g], over = g === 'w' ? r.wOver : r.hOver;
      const box = card.querySelector(`[data-g="${g}"]`);
      box.classList.toggle('over', over);
      box.classList.toggle('ok', st.complete && !over);
      box.querySelectorAll('input').forEach((inp) => inp.classList.toggle('least', st.count > 1 && inp.value !== '' && Number(inp.value) === st.min));
    });
    card.querySelector('[data-status]').innerHTML = rowStatus(it);
  }
  function rowSubText(it) {
    const n = (it.photos || []).length;
    return [qtyOf(it) > 1 ? `Qty ${qtyOf(it)}` : '', n ? `📷 ${n} site photo${n === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  }
  // ---------- site photos ----------
  const PH_MARK = { done: ['✓', 'Uploaded'], waiting: ['↑', 'Waiting for internet to upload'], failed: ['!', 'Upload failed, will try again'] };
  function photoTiles(it) {
    return (it.photos || []).map((p) => `<span class="ph ${p.status}" data-ph="${p.id}" title="${PH_MARK[p.status][1]}">
        <img src="${p.thumb}" alt="Site photo"><i>${PH_MARK[p.status][0]}</i><button class="ph-x" data-act="ph-del" title="Remove">✕</button></span>`).join('') +
      `<label class="ph-add" title="Take or choose photos"><b>📷</b><span>Add photo</span><input type="file" accept="image/*" multiple data-photos hidden></label>`;
  }
  function refreshPhotos(it) {
    const card = $app.querySelector(`.item[data-id="${it.id}"]`);
    if (!card) return;
    card.querySelector('[data-phlist]').innerHTML = photoTiles(it);
    rowSub(card, it);
  }
  async function addPhotos(it, files) {
    if (!job.photoKey) job.photoKey = PHOTOS.randomKey(20);
    for (const file of files) {
      try {
        const { full, thumb } = await PHOTOS.prepare(file);
        const id = PHOTOS.randomKey(8);
        (it.photos = it.photos || []).push({ id, path: `${job.photoKey}/${it.id}/${id}.jpg`, thumb, full, status: 'waiting' });
      } catch (err) { alert(err.message); }
    }
    touch(); await saveNow(); refreshPhotos(it);
    syncPhotos();
  }
  // upload every photo still waiting, in every job; runs again when the internet comes back
  let syncing = false;
  async function syncPhotos() {
    if (syncing || !PHOTOS.enabled || !navigator.onLine) return;
    syncing = true;
    try {
      const jobs = await DB.allJobs();
      for (const j0 of jobs) {
        const j = job && job.id === j0.id ? job : j0;     // the open job is changed in place
        let changed = false;
        for (const it of j.items || []) {
          for (const p of it.photos || []) {
            if (p.status === 'done' || !p.full) continue;
            try { await PHOTOS.upload(p.path, p.full); p.status = 'done'; delete p.full; }
            catch (err) { p.status = 'failed'; p.error = err.message; }
            changed = true;
            if (j === job) refreshPhotos(it);
          }
        }
        if (changed) { if (j === job) { touch(); await saveNow(); } else await DB.putJob(j); }
      }
    } finally { syncing = false; }
  }
  window.addEventListener('online', syncPhotos);
  setInterval(syncPhotos, 60000);
  function rowSub(card, it) {
    card.querySelector('[data-sub]').textContent = rowSubText(it);
  }

  // ---------- design key pad ----------
  // Tap keys to draft the design. "Edit codes" lets the codes themselves be added, changed or removed here.
  let kpItem = null;
  function openKeypad(it) {
    closeKeypad(true);
    kpItem = it;
    let editing = false, editIdx = null;   // editIdx: index of the code being changed, -1 for a new one
    const box = document.createElement('div');
    box.className = 'kp-back';
    box.innerHTML = `<div class="keypad" role="dialog" aria-label="Design">
      <div class="kp-top"><div class="kp-title"><b>${esc(it.code)} design</b><input data-kp-text value="${esc(it.design)}" placeholder="Tap the codes below"></div></div>
      <div class="kp-bar"><span class="muted" data-kp-hint>Tap codes to build the design</span><button class="btn small ghost" data-kp-edit>✎ Edit codes</button></div>
      <div class="kp-keys" data-kp-keys></div>
      <div class="kp-form" data-kp-form hidden>
        <label class="f"><span>Code</span><input data-kf-k maxlength="8" placeholder="e.g. SLM"></label>
        <label class="f"><span>What it means</span><input data-kf-t placeholder="e.g. Sliding with mesh"></label>
        <div class="kp-form-act"><button class="btn small ghost danger" data-kf-del>Delete</button><span class="grow"></span><button class="btn small ghost" data-kf-cancel>Cancel</button><button class="btn small gold" data-kf-save>Save code</button></div>
      </div>
      <div class="kp-act" data-kp-act><button class="btn" data-kp-back>⌫ Back</button><button class="btn ghost" data-kp-clear>Clear</button><button class="btn gold" data-kp-done>Done</button></div>
    </div>`;
    document.body.appendChild(box);
    const $ = (sel) => box.querySelector(sel);
    const text = $('[data-kp-text]'), form = $('[data-kp-form]');
    const set = (v) => { text.value = v; it.design = v; touch(); previewSoon(); updateDesignBtn(it); };

    function drawKeys() {
      $('[data-kp-keys]').innerHTML = settings.keys.map(([k, t], i) =>
        `<button data-kp="${i}" class="${editing ? 'editing' : ''} ${editIdx === i ? 'sel' : ''}" title="${esc(t)}"><b>${esc(k)}</b><small>${esc(t)}</small></button>`).join('') +
        `<button class="add" data-kp-new><b>+</b><small>New code</small></button>`;
      $('[data-kp-edit]').textContent = editing ? '✓ Finished editing' : '✎ Edit codes';
      $('[data-kp-hint]').textContent = editing ? 'Tap a code to change or delete it' : 'Tap codes to build the design';
      $('[data-kp-act]').hidden = editing && editIdx !== null;
    }
    function openForm(i) {
      editIdx = i;
      const [k, t] = i >= 0 ? settings.keys[i] : ['', ''];
      $('[data-kf-k]').value = k; $('[data-kf-t]').value = t;
      $('[data-kf-del]').hidden = i < 0;
      form.hidden = false; drawKeys();
      $('[data-kf-k]').focus();
    }
    function closeForm() { editIdx = null; form.hidden = true; drawKeys(); }
    async function persist() { await DB.set('settings', settings); }

    box.addEventListener('click', async (e) => {
      if (e.target === box) return closeKeypad();
      const t = (sel) => e.target.closest(sel);
      if (t('[data-kp-edit]')) { editing = !editing; return closeForm(); }
      if (t('[data-kp-new]')) { editing = true; return openForm(-1); }
      const k = t('[data-kp]');
      if (k) {
        const i = Number(k.dataset.kp);
        if (editing) return openForm(i);
        return set((text.value.trim() + ' ' + settings.keys[i][0]).trim());
      }
      if (t('[data-kf-cancel]')) return closeForm();
      if (t('[data-kf-save]')) {
        const code = $('[data-kf-k]').value.trim().toUpperCase().replace(/\s+/g, '');
        const mean = $('[data-kf-t]').value.trim();
        if (!code) return alert('Type the code, e.g. SLM');
        const clash = settings.keys.findIndex(([x]) => x === code);
        if (clash >= 0 && clash !== editIdx) return alert(`${code} is already a code.`);
        if (editIdx >= 0) settings.keys[editIdx] = [code, mean]; else settings.keys.push([code, mean]);
        await persist(); toast(`Code ${code} saved`);
        return closeForm();
      }
      if (t('[data-kf-del]') && editIdx >= 0) {
        const [code] = settings.keys[editIdx];
        if (!confirm(`Delete the code ${code}? Designs already typed with it stay as they are.`)) return;
        settings.keys.splice(editIdx, 1); await persist(); toast(`Code ${code} deleted`);
        return closeForm();
      }
      if (t('[data-kp-back]')) return set(text.value.trim().split(/\s+/).slice(0, -1).join(' '));
      if (t('[data-kp-clear]')) return set('');
      if (t('[data-kp-done]')) return closeKeypad();
    });
    text.addEventListener('input', () => { it.design = text.value; touch(); previewSoon(); updateDesignBtn(it); });
    drawKeys();
  }
  function closeKeypad(silent) {
    document.querySelectorAll('.kp-back').forEach((x) => x.remove());
    if (!silent) kpItem = null;
  }
  function updateDesignBtn(it) {
    const b = $app.querySelector(`.item[data-id="${it.id}"] .design`);
    if (b) { b.innerHTML = designFace(it); b.classList.toggle('empty', !it.design); }
  }
  function designFace(it) {
    if (!it.design) return `<span class="dplus">+</span><span>Design</span>`;
    return `<span class="dcode">${esc(it.design)}</span>`;
  }

  // ================= Review & approve =================
  function reviewHtml() {
    const tol = settings.toleranceMm;
    const rows = job.items.map((it) => ({ it, r: RULES.check(it, tol) }));
    const flagged = rows.filter((x) => x.r.flagged).length;
    const incomplete = rows.filter((x) => !x.r.complete).length;
    const approved = rows.filter((x) => x.it.approved).length;
    if (!rows.length) return `<div class="empty">Add a window on the left. Its sizes appear here to approve.</div>`;
    return `
      <p class="sub rv-intro">The least width and height are taken for production. More than <b>${tol} mm</b> difference is shown in red.</p>
      <div class="summary">
        <div><b>${rows.length}</b><span>items</span></div>
        <div class="${approved === rows.length ? 'ok' : ''}"><b>${approved}</b><span>approved</span></div>
        <div class="${flagged ? 'over' : ''}"><b>${flagged}</b><span>over ${tol} mm</span></div>
        <div class="${incomplete ? 'over' : ''}"><b>${incomplete}</b><span>incomplete</span></div>
      </div>
      <div class="review">
        ${rows.map(({ it, r }) => reviewCard(it, r)).join('')}
      </div>`;
  }
  function reviewCard(it, r) {
    const fw = it.final ? it.final.w : r.w.min, fh = it.final ? it.final.h : r.h.min;
    // one measurement box, coloured like on the measurement page: least yellow, missing red
    const cell = (v, st) => {
      const n = Number(v);
      const cls = v === '' ? 'miss' : n === st.min ? 'least' : n === st.max && st.diff ? 'most' : '';
      return `<td class="${cls}">${v === '' ? '–' : esc(v)}</td>`;
    };
    const cls = it.approved ? 'approved' : r.flagged || !r.complete ? 'flagged' : '';
    return `<section class="card rv ${cls}" data-id="${it.id}">
      <div class="rv-head">
        <b class="rv-code">${esc(it.code)}</b><span class="rv-qty">× ${qtyOf(it)}</span><span class="muted">${esc(typeOf(it.type).label)}${it.location ? ' · ' + esc(it.location) : ''}${it.section ? ' · ' + esc(it.section) : ''}${it.design ? ' · ' + esc(it.design) : ''}${it.colour ? ' · ' + esc(it.colour) : ''}</span>
        <span class="grow"></span>
        ${it.approved ? `<span class="pill approved">✓ Approved</span>` : r.flagged ? `<span class="pill over">⚠ Over ${settings.toleranceMm} mm</span>` : !r.complete ? `<span class="pill over">Incomplete</span>` : `<span class="pill">Ready</span>`}
      </div>
      <div class="rv-body">
        <table class="mt vert">
          <tr><th></th><th>W</th><th>H</th></tr>
          ${[0, 1, 2].map((i) => `<tr><th></th>${cell(it.w[i], r.w)}${cell(it.h[i], r.h)}</tr>`).join('')}
          <tr class="sum"><th>Least</th><td class="least">${mm(r.w.min)}</td><td class="least">${mm(r.h.min)}</td></tr>
          <tr class="sum"><th>Diff</th><td class="${r.wOver ? 'over' : 'ok'}">${mm(r.w.diff)}</td><td class="${r.hOver ? 'over' : 'ok'}">${mm(r.h.diff)}</td></tr>
        </table>
        <div class="final">
          <span>Production size (mm)</span>
          <div class="final-in">
            <input inputmode="numeric" data-final="w" value="${esc(fw == null ? '' : fw)}" ${it.approved ? 'disabled' : ''}>
            <b>×</b>
            <input inputmode="numeric" data-final="h" value="${esc(fh == null ? '' : fh)}" ${it.approved ? 'disabled' : ''}>
          </div>
          ${it.final && !it.approved && (Number(it.final.w) !== r.w.min || Number(it.final.h) !== r.h.min) ? `<small class="muted">Edited (least was ${mm(r.w.min)} × ${mm(r.h.min)})</small>` : ''}
          ${it.approved
            ? `<button class="btn small ghost" data-act="unapprove">Undo approval</button>`
            : `<button class="btn small gold" data-act="approve" ${r.complete ? '' : 'disabled'}>Approve</button>`}
        </div>
      </div>
      ${it.glass || it.remarks ? `<p class="rv-note">${it.glass ? `<b>Glass:</b> ${esc(it.glass)} ` : ''}${it.remarks ? `<b>Remarks:</b> ${esc(it.remarks)}` : ''}</p>` : ''}
    </section>`;
  }
  // a little lift when items are approved, and a gold burst when the whole job is approved
  function popApproved(list) {
    list.forEach((it) => $app.querySelectorAll(`[data-id="${it.id}"]`).forEach((el) => {
      el.classList.remove('justok'); void el.offsetWidth; el.classList.add('justok');
    }));
    if (list.length && job.items.length && job.items.every((x) => x.approved)) celebrate();
  }
  function celebrate() {
    toast('All approved · ready for production');
    const box = document.createElement('div');
    box.className = 'burst';
    const colours = ['#D4AF37', '#EFD87E', '#B48A1D', '#243085', '#34D399'];
    box.innerHTML = Array.from({ length: 36 }, (_, i) => {
      const an = (i / 36) * Math.PI * 2, d = 120 + Math.random() * 160;
      return `<i style="--x:${Math.cos(an) * d}px;--y:${Math.sin(an) * d - 60}px;--r:${Math.random() * 540}deg;background:${colours[i % colours.length]};animation-delay:${Math.random() * 80}ms"></i>`;
    }).join('');
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 1600);
  }
  function approveItem(it) {
    const r = RULES.check(it, settings.toleranceMm);
    if (!r.complete) return false;
    const fw = it.final ? Number(it.final.w) : r.w.min, fh = it.final ? Number(it.final.h) : r.h.min;
    if (!(fw > 0 && fh > 0)) { alert(`${it.code}: enter the production width and height.`); return false; }
    it.final = { w: fw, h: fh };
    it.approved = true; it.approvedAt = new Date().toISOString(); it.approvedSig = RULES.signature(it);
    return true;
  }

  // ================= Production sheet =================
  // two production sheets: the factory sheet (cutting sizes) and the installation sheet (site photo links)
  let sheetKind = 'factory';
  function qrSvg(text) {
    try { const q = qrcode(0, 'L'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); }
    catch (err) { return ''; }
  }
  function sheetHtml() {
    const install = sheetKind === 'install';
    const items = job.items.filter((i) => i.approved);
    const count = (k) => items.filter((i) => i.type === k).reduce((a, i) => a + qtyOf(i), 0);
    const total = items.reduce((a, i) => a + qtyOf(i), 0);
    const waiting = items.reduce((a, i) => a + (i.photos || []).filter((p) => p.status !== 'done').length, 0);
    const cols = install
      ? ['Code', 'Location', ['Width', 'num'], ['Height', 'num'], ['Qty', 'num'], 'Section', 'Design', 'Colour', 'Glass', 'Remarks']
      : ['Code', ['Width', 'num'], ['Height', 'num'], ['Qty', 'num'], 'Section', 'Design', 'Colour', 'Glass', 'Remarks', ['Cutting sizes <small>(filled by production)</small>', 'cutth']];
    const head = cols.map((c) => Array.isArray(c) ? `<th class="${c[1]}">${c[0]}</th>` : `<th>${c}</th>`).join('');
    const row = (it) => install
      ? `<tr class="has-sub">
          <td><b>${esc(it.code)}</b></td><td>${esc(it.location)}</td>
          <td class="num"><b>${esc(it.final.w)}</b></td><td class="num"><b>${esc(it.final.h)}</b></td><td class="num"><b>${qtyOf(it)}</b></td>
          <td>${esc(it.section)}</td><td class="sh-design"><b>${esc(it.design)}</b></td><td>${esc(it.colour)}</td><td>${esc(it.glass)}</td><td>${esc(it.remarks)}</td>
        </tr>
        <tr class="phrow"><td colspan="${cols.length}">${photoLine(it)}</td></tr>`
      : `<tr>
          <td><b>${esc(it.code)}</b></td>
          <td class="num"><b>${esc(it.final.w)}</b></td><td class="num"><b>${esc(it.final.h)}</b></td><td class="num"><b>${qtyOf(it)}</b></td>
          <td>${esc(it.section)}</td><td class="sh-design"><b>${esc(it.design)}</b></td><td>${esc(it.colour)}</td><td>${esc(it.glass)}</td><td>${esc(it.remarks)}</td>
          <td class="cut"><div class="cutboxes"><span></span><span></span><span></span><span></span></div></td>
        </tr>`;
    return `
      ${install && waiting ? `<p class="warn noprint">${waiting} site photo${waiting === 1 ? ' is' : 's are'} still waiting to upload from the measuring phone. Their links appear here once uploaded.</p>` : ''}
      <article class="sheet ${install ? 'install' : ''}">
        <header class="sh-head">
          <div class="sh-co"><img src="assets/titans_logo_trim.png" alt=""><div><b>${esc(C.company)}</b><span>${install ? 'INSTALLATION SHEET' : 'PRODUCTION SHEET'}</span></div></div>
          <table class="sh-info">
            <tr><th>Job no</th><td>${esc(job.no)}</td><th>Date</th><td>${fmtDate(job.date)}</td></tr>
            <tr><th>Customer</th><td>${esc(job.customer)}</td><th>Phone</th><td>${esc(job.phone)}</td></tr>
            <tr><th>Site</th><td>${esc(job.site)}</td><th>Measured by</th><td>${esc(job.measuredBy)}</td></tr>
            <tr><th>Address</th><td colspan="3">${esc(job.address)}</td></tr>
          </table>
        </header>
        <table class="sh-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${items.map(row).join('') || `<tr><td colspan="${cols.length}" class="empty">No approved items yet.</td></tr>`}</tbody>
        </table>
        <footer class="sh-foot">
          <span>Total quantity: <b>${total}</b> (${C.types.map((t) => `${esc(t.label)}s ${count(t.key)}`).join(', ')}) · All sizes in mm</span>
          <span>Approved ${items.length ? fmtDate(items.map((i) => i.approvedAt).sort().pop()) : ''}</span>
        </footer>
        <div class="sh-sign">${install ? '<div>Installed by</div><div>Customer signature</div><div>Date of installation</div>' : '<div>Measured by</div><div>Approved by</div><div>Production in-charge</div>'}</div>
      </article>`;
  }
  // under each window on the installation sheet: the link (and QR code) to its site photos
  function photoLine(it) {
    const photos = it.photos || [];
    const done = photos.filter((p) => p.status === 'done').length;
    if (!photos.length) return `<span class="ph-none">No site photos</span>`;
    const link = PHOTOS.galleryLink(job, it);
    if (!link) return `<span class="ph-none">${photos.length} site photo${photos.length === 1 ? '' : 's'} not uploaded yet</span>`;
    return `<div class="ph-link">${qrSvg(link)}<div><b>📷 Site photos of ${esc(it.code)} (${done})</b>
      <a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//, '').slice(0, 70))}…</a>
      <small>Scan the code or tap the link to see the photos taken at site.</small></div></div>`;
  }

  function steps(cur) {
    if (!job) return '';
    const s = [['job', 'Measurement'], ['review', 'Approval'], ['sheet', 'Production sheet']];
    const open = { job: true, review: canReview(job), sheet: allApproved(job) };
    return `<nav class="steps">${s.map(([k, l], i) => {
      const href = open[k] ? `#/${k}/${job.id}` : null;
      return href ? `<a href="${href}" class="${k === cur ? 'on' : ''}"><i>${i + 1}</i>${l}</a>` : `<span><i>${i + 1}</i>${l}</span>`;
    }).join('')}</nav>`;
  }

  // ================= Settings =================
  function viewSettings() {
    job = null;
    $app.innerHTML = `
      <div class="head"><div><h1>Settings</h1><p class="sub">Saved on this device.</p></div></div>
      <section class="card">
        <label class="f"><span>Most allowed difference between the 3 measurements (mm)</span><input inputmode="numeric" data-set="toleranceMm" value="${settings.toleranceMm}"></label>
        <div class="grid">
          <label class="f"><span>Colour for a new item</span>${defPick('dcolour', settings.defaults.colour, settings.colours)}</label>
          <label class="f"><span>Glass for a new window</span>${defPick('dglassW', settings.defaults.glass.W, settings.glass)}</label>
          <label class="f"><span>Glass for a new ventilator</span>${defPick('dglassV', settings.defaults.glass.V, settings.glass)}</label>
          <label class="f"><span>Section for a new window</span>${defPick('dsecW', defaultSection('W'), settings.sections)}</label>
          <label class="f"><span>Section for a new ventilator</span>${defPick('dsecV', defaultSection('V'), settings.sections)}</label>
        </div>
        <div class="f"><span>Design codes (the keys on the design key pad)</span>
          <div class="keylist" data-keylist>${settings.keys.map(([k, t]) => keyRow(k, t)).join('')}</div>
          <div><button class="btn small" data-act="key-add">+ Add code</button></div>
        </div>
        ${chipList('locations', 'Location choices')}
        ${chipList('colours', 'Colour choices')}
        ${chipList('glass', 'Glass choices')}
        ${chipList('sections', 'Section choices')}
        <div class="actions"><button class="btn gold" data-act="save-settings">Save settings</button></div>
      </section>
      <p class="sub">Version ${esc(C.version)}</p>
      <section class="card">
        <h2>Backup</h2>
        <p class="sub">All jobs are kept on this phone / PC. Download a backup now and then, or to move jobs to another device.</p>
        <div class="actions">
          <button class="btn" data-act="export">Download backup</button>
          <label class="btn ghost">Restore from backup<input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
      </section>`;
  }

  // an editable list: each choice can be renamed in place or removed, and new ones added
  function chip(v) { return `<span class="chip"><input value="${esc(v)}" size="${Math.max(4, String(v).length + 1)}" aria-label="Choice"><button class="chipx" data-act="chip-del" title="Remove">✕</button></span>`; }
  function chipList(key, label) {
    return `<div class="f"><span>${label}</span><div class="chips" data-list="${key}">${settings[key].map(chip).join('')}
      <span class="chipadd"><input placeholder="Add new…" data-chip-new><button class="btn small" data-act="chip-add">+ Add</button></span></div></div>`;
  }
  function defPick(key, val, list) {
    const all = val && !list.includes(val) ? [val, ...list] : list;
    return `<select data-set="${key}">${all.map((x) => `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
  }
  function keyRow(k = '', t = '') {
    return `<div class="keyrow"><input data-key-k value="${esc(k)}" maxlength="8" placeholder="Code" aria-label="Code"><input data-key-t value="${esc(t)}" placeholder="What it means" aria-label="What it means"><button class="icon danger" data-act="key-del" title="Delete">✕</button></div>`;
  }



  // ---------- events ----------
  const itemOf = (el) => { const card = el.closest('[data-id]'); return card && job.items.find((i) => i.id === card.dataset.id); };

  $app.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-search]')) {
      const q = el.value.trim().toLowerCase();
      applyHomeFilter();
      return;
    }
    if (!job) return;
    if (el.dataset.job) {
      job[el.dataset.job] = el.value;
      const sum = $app.querySelector('[data-sitesum]'); if (sum) sum.innerHTML = siteSummary();
      previewSoon(); return touch();
    }
    const it = itemOf(el);
    if (!it) return;
    if (el.dataset.m) {
      el.value = el.value.replace(/[^\d.]/g, '');
      it[el.dataset.m][Number(el.dataset.i)] = el.value;
      const wasApproved = it.approved;
      dropStaleApproval(it);
      const card = el.closest('.item');
      markRow(card, it);
      if (it.design) updateDesignBtn(it);
      if (RULES.check(it, settings.toleranceMm).complete) card.classList.remove('missing');
      if (wasApproved && !it.approved) { refreshCardPills(); toast(`${it.code}: measurement changed, approve again`); }
      previewSoon();
      return touch();
    }
    if (el.dataset.final) {
      const r = RULES.check(it, settings.toleranceMm);
      it.final = it.final || { w: r.w.min, h: r.h.min };
      it.final[el.dataset.final] = el.value.replace(/[^\d.]/g, '');
      return touch();
    }
    if (el.dataset.k && el.dataset.k !== 'type' && el.value !== '__other') {
      if (el.dataset.k === 'qty') el.value = el.value.replace(/\D/g, '');
      it[el.dataset.k] = el.value;
      const card = el.closest('.item');
      if (card) rowSub(card, it);
      if (el.dataset.k === 'code') {
        const dup = dupCodes(job);
        document.querySelectorAll('.item').forEach((card) => {
          const x = job.items.find((i) => i.id === card.dataset.id);
          card.querySelector('input.code').classList.toggle('bad', dup.has(String(x.code).trim().toUpperCase()));
        });
      }
      previewSoon();
      return touch();
    }
  });

  $app.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.matches('[data-import]')) return importBackup(el.files[0]);
    if (!job) return;
    const it = itemOf(el);
    if (el.matches('[data-photos]') && it && el.files.length) { await addPhotos(it, [...el.files]); return; }
    if (el.value === '__other' && it && LISTS[el.dataset.k]) {
      const [listKey, label] = LISTS[el.dataset.k];
      const v = (prompt(`Type the ${label.toLowerCase()}:`) || '').trim();
      if (v) {
        it[el.dataset.k] = v;
        if (!settings[listKey].includes(v)) { settings[listKey].push(v); DB.set('settings', settings); }
        touch(); previewSoon();
      }
      el.closest('.sf').innerHTML = `<span>${label}</span>${pick(el.dataset.k, it[el.dataset.k], settings[listKey])}`;
      return;
    }
    if (el.dataset.k === 'type' && it) {
      if (it.glass === defaultGlass(it.type)) it.glass = defaultGlass(el.value);
      if (!it.section || it.section === defaultSection(it.type)) it.section = defaultSection(el.value);
      it.type = el.value;
      if (confirm(`Change the code to ${nextCode(job, el.value)}?`)) it.code = nextCode(job, el.value);
      touch(); viewWork();
    }
    if (el.dataset.final && it) renderPreview();
  });

  async function newJob() {
    const j = { id: uid(), no: await nextJobNo(), customer: '', phone: '', site: '', address: '', measuredBy: '', date: today(),
      items: [], created: new Date().toISOString(), updated: new Date().toISOString(), status: 'measuring' };
    await DB.putJob(j);
    location.hash = `#/job/${j.id}`;
  }
  $app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const it = job && itemOf(b);

    if (act === 'new-job') await newJob();
    if (act === 'filter') { homeFilter = homeFilter === b.dataset.f ? 'all' : b.dataset.f; return viewHome(); }
    if (act === 'del-job' && confirm(`Delete job ${job.no} and all its measurements? This cannot be undone.`)) {
      await DB.deleteJob(job.id); job = null; location.hash = '#/';
    }
    if (act === 'add') {
      const n = newItem(job, b.dataset.type);
      job.items.push(n); touch(); viewWork();
      const card = document.querySelector(`.item[data-id="${n.id}"]`);
      card.classList.add('fresh');
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.querySelector('[data-m="w"]').focus({ preventScroll: true });
    }
    if (act === 'del' && it && confirm(`Delete ${it.code}?`)) { job.items = job.items.filter((x) => x !== it); touch(); viewWork(); }
    if ((act === 'up' || act === 'down') && it) {
      const i = job.items.indexOf(it), j = act === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < job.items.length) { [job.items[i], job.items[j]] = [job.items[j], job.items[i]]; touch(); viewWork(); }
    }
    if (act === 'keypad' && it) openKeypad(it);
    if (act === 'kind') { sheetKind = b.dataset.k; showPane(); }
    if (act === 'ph-del' && it) {
      e.preventDefault();
      const id = b.closest('[data-ph]').dataset.ph;
      if (confirm('Remove this photo? It will no longer be on the installation sheet.')) {
        it.photos = (it.photos || []).filter((p) => p.id !== id); touch(); refreshPhotos(it);
      }
    }
    if (act === 'more' && it) {
      const card = b.closest('.item'), open = !openRows.has(it.id);
      open ? openRows.add(it.id) : openRows.delete(it.id);
      card.classList.toggle('open', open); card.querySelector('.details').hidden = !open; b.textContent = open ? '▴' : '⋯';
    }
    if (act === 'site') {
      siteOpen = !isSiteOpen();
      const sec = b.closest('.site');
      sec.classList.toggle('open', siteOpen); sec.querySelector('.site-form').hidden = !siteOpen;
      b.setAttribute('aria-expanded', siteOpen); b.querySelector('i').textContent = siteOpen ? 'Done' : 'Edit';
      if (siteOpen) sec.querySelector('input').focus();
    }
    if (act === 'save') { await saveNow(); toast('Saved'); }
    if (act === 'to-review') {
      const dup = dupCodes(job);
      if (dup.size) return alert('These codes are used more than once: ' + [...dup].join(', ') + '\nChange them first.');
      const missing = job.items.filter((x) => !RULES.check(x, settings.toleranceMm).complete).map((x) => x.code);
      if (missing.length) {
        $app.querySelectorAll('.item').forEach((c) => c.classList.toggle('missing', missing.includes(job.items.find((i) => i.id === c.dataset.id).code)));
        $app.querySelector('.item.missing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return alert(`Fill all 3 widths and 3 heights first for: ${missing.join(', ')}`);
      }
      job.sentToReview = true; touch(); await saveNow();
      tab = 'review'; toast('Measurements complete · saved');
      location.hash = `#/review/${job.id}`;
    }
    if (act === 'approve' && it) { if (approveItem(it)) { touch(); renderPreview(); refreshCardPills(); showFootOnly(); popApproved([it]); } }
    if (act === 'unapprove' && it) { it.approved = false; it.approvedAt = null; it.approvedSig = null; touch(); renderPreview(); refreshCardPills(); showFootOnly(); }
    if (act === 'tab') {
      tab = b.dataset.tab;
      if (wide()) showPane();
      else location.hash = `#/${tab}/${job.id}`;
    }
    if (act === 'approve-ok') {
      let n = 0;
      const done = [];
      job.items.forEach((x) => { const r = RULES.check(x, settings.toleranceMm); if (!x.approved && r.complete && !r.flagged && approveItem(x)) { n++; done.push(x); } });
      touch(); renderPreview(); refreshCardPills(); showFootOnly(); popApproved(done);
      if (!job.items.every((x) => x.approved)) toast(n ? `${n} approved` : 'Nothing to approve');
    }
    if (act === 'to-sheet') { if (!allApproved(job)) return toast('Approve every window first'); await saveNow(); tab = 'sheet'; if (wide()) showPane(); else location.hash = `#/sheet/${job.id}`; }
    if (act === 'print') { tab = 'sheet'; renderPreview(); }
    if (act === 'print') window.print();
    if (act === 'save-settings') saveSettings();
    if (act === 'key-add') {
      document.querySelector('[data-keylist]').insertAdjacentHTML('beforeend', keyRow());
      document.querySelector('.keyrow:last-child [data-key-k]').focus();
    }
    if (act === 'key-del') b.closest('.keyrow').remove();
    if (act === 'chip-del') b.closest('.chip').remove();
    if (act === 'chip-add') addChip(b.closest('.chipadd').querySelector('input'));
    if (act === 'export') exportBackup();
  });

  function addChip(inp) {
    const v = inp.value.trim();
    if (!v) return inp.focus();
    inp.closest('.chipadd').insertAdjacentHTML('beforebegin', chip(v));
    inp.value = ''; inp.focus();
  }
  $app.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-chip-new]')) { e.preventDefault(); addChip(e.target); }
  });

  // ---------- settings & backup ----------
  async function saveSettings() {
    const get = (k) => document.querySelector(`[data-set="${k}"]`).value;
    const tol = Number(get('toleranceMm'));
    if (!(tol >= 0)) return alert('Enter the difference in mm.');
    const keys = [...document.querySelectorAll('.keyrow')]
      .map((r) => [r.querySelector('[data-key-k]').value.trim().toUpperCase().replace(/\s+/g, ''), r.querySelector('[data-key-t]').value.trim()])
      .filter(([k]) => k);
    const seen = new Set(), twice = keys.filter(([k]) => (seen.has(k) ? true : (seen.add(k), false))).map(([k]) => k);
    if (twice.length) return alert('These codes are there twice: ' + twice.join(', '));
    const defaults = { colour: get('dcolour'), glass: { W: get('dglassW'), V: get('dglassV') }, section: { W: get('dsecW'), V: get('dsecV') } };
    const list = (k) => [...new Set([...document.querySelectorAll(`[data-list="${k}"] .chip input`)].map((i) => i.value.trim()).filter(Boolean))];
    settings = { defaults, toleranceMm: tol, keys, glass: list('glass'), colours: list('colours'), locations: list('locations'), sections: list('sections') };
    await DB.set('settings', settings); fillLists(); toast('Settings saved');
  }
  async function exportBackup() {
    const data = { app: 'measurement-to-production', version: 1, exported: new Date().toISOString(),
      settings, jobCounter: await DB.get('jobCounter'), jobs: await DB.allJobs() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = `m2p-backup-${today()}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importBackup(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'measurement-to-production' || !Array.isArray(data.jobs)) throw new Error('This is not a Measurement to Production backup');
      if (!confirm(`Restore ${data.jobs.length} jobs? Jobs with the same number on this device are replaced.`)) return;
      for (const j of data.jobs) await DB.putJob(j);
      const cur = (await DB.get('jobCounter')) || 0;
      await DB.set('jobCounter', Math.max(cur, data.jobCounter || 0));
      toast('Backup restored'); location.hash = '#/';
    } catch (err) { alert('Could not restore: ' + err.message); }
  }

  // ---------- start ----------
  (async function start() {
    const s = await DB.get('settings');
    if (s) settings = Object.assign(settings, s, { defaults: Object.assign({}, settings.defaults, s.defaults || {}) });
    // the first key pad (SL, OP, TH, BH, FIX, VENT, FAN, MESH, ...) is replaced by the real codes, unless it was changed by hand
    const OLD_KEYS = 'SL,OP,TH,BH,FIX,VENT,FAN,MESH,DOOR,LOUV,T&T,ARCH';
    if (s && s.keys && s.keys.map((k) => k[0]).join(',') === OLD_KEYS) { settings.keys = C.designKeys.map((x) => x.slice()); DB.set('settings', settings); }
    if (!settings.glass.includes('5 mm Pinned')) settings.glass.splice(1, 0, '5 mm Pinned');
    fillLists();
    document.getElementById('ver').textContent = 'Version ' + C.version;
    setTimeout(syncPhotos, 1500);
    route();
  })();
})();
