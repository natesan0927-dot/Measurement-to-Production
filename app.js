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
  let settings = { toleranceMm: C.toleranceMm, keys: C.designKeys.map((x) => x.slice()), glass: C.glass.slice(), colours: C.colours.slice() };
  let job = null;        // the job open right now
  let saveTimer = null;
  let pane = 'job';      // what a phone shows: 'job' (measurements), 'review' or 'sheet'
  let tab = 'review';    // what the right-hand side shows on a wide screen: 'review' or 'sheet'
  let previewTimer = null;
  const openRows = new Set();   // rows whose details (location, qty, colour, glass, remarks, photo) are open
  const wide = () => window.matchMedia('(min-width: 1000px)').matches;

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
    if (j.sentToReview) return 'review';
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
      location: '', qty: 1, colour: lastColour(j), design: '', glass: '', remarks: '', photo: null,
      final: null, approved: false, approvedAt: null, approvedSig: null,
    };
  }
  // a new item starts with the colour of the item before it (usually the same for the whole site)
  function lastColour(j) {
    const prev = (j.items || [])[j.items.length - 1];
    return prev ? prev.colour || '' : '';
  }
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

  // ---------- routing ----------
  async function route() {
    await saveNow();
    const h = location.hash.replace(/^#\/?/, '');
    const [view, id] = h.split('/');
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === (view === 'settings' ? 'settings' : 'home')));
    const work = ['job', 'review', 'sheet'].includes(view);
    document.body.dataset.view = work ? 'work' : view || 'home';
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
    if (!view) return viewHome();
    if (view === 'settings') return viewSettings();
    job = await DB.getJob(id);
    if (!job) { location.hash = '#/'; return; }
    job.items = job.items || [];
    job.items.forEach(dropStaleApproval);
    if (work) return viewWork();
    location.hash = '#/';
  }
  window.addEventListener('hashchange', route);

  // ================= Jobs list =================
  async function viewHome() {
    job = null;
    const jobs = (await DB.allJobs()).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    $app.innerHTML = `
      <div class="head">
        <div><h1>Jobs</h1><p class="sub">Each job is one site visit. Open it to measure, approve and print the production sheet.</p></div>
        <button class="btn gold" data-act="new-job">+ New job</button>
      </div>
      <input class="search" type="search" placeholder="Search customer, site, job no…" data-search>
      <div class="joblist">
        ${jobs.length ? jobs.map(jobRow).join('') : `<div class="empty">No jobs yet. Tap <b>+ New job</b> to start measuring a site.</div>`}
      </div>`;
  }
  function jobRow(j) {
    const n = (j.items || []).length, ok = (j.items || []).filter((i) => i.approved).length;
    const st = jobStatus(j);
    return `<a class="jobrow" href="#/job/${j.id}" data-text="${esc([j.no, j.customer, j.site, j.address].join(' ').toLowerCase())}">
      <div class="jr-main">
        <b>${esc(j.customer || 'No customer name')}</b>
        <span>${esc(j.no)} · ${esc(j.site || j.address || '')} · ${fmtDate(j.date)}</span>
      </div>
      <div class="jr-side">
        <span class="pill ${st}">${STATUS[st]}</span>
        <small>${n} item${n === 1 ? '' : 's'}${n ? ` · ${ok} approved` : ''}</small>
      </div>
    </a>`;
  }

  // ================= Job: measurements (left) + live review / production sheet (right) =================
  function viewWork() {
    const dup = dupCodes(job);
    $app.innerHTML = `
      <div data-steps></div>
      <div class="workspace">
        <div class="formcol noprint">
          <div class="head">
            <div><h1>${esc(job.no)} <small data-saved>Saved</small></h1><p class="sub">One line per window, in mm: 3 widths (left, centre, right), 3 heights (top, middle, bottom), then tap Design.</p></div>
            <button class="btn ghost danger small" data-act="del-job">Delete job</button>
          </div>
          <section class="card">
            <h2>Site details</h2>
            <div class="grid">
              ${field('Customer name', 'customer')}
              ${field('Phone', 'phone', 'tel')}
              ${field('Site / project', 'site')}
              ${field('Measured by', 'measuredBy')}
              ${field('Address', 'address', 'text', 'wide')}
              ${field('Date', 'date', 'date')}
            </div>
          </section>
          ${job.items.length ? `<div class="rowhead"><span>Code</span><span>Width <small>L · C · R</small></span><span>Height <small>T · M · B</small></span><span>Design</span><span></span></div>` : ''}
          <div class="items" data-items>
            ${job.items.map((it, idx) => itemCard(it, idx, dup)).join('')}
          </div>
          ${job.items.length ? '' : `<div class="empty">No windows yet. Add a window or a ventilator below.</div>`}
          <div class="addbar">
            ${C.types.map((t) => `<button class="btn" data-act="add" data-type="${t.key}">+ Add ${esc(t.label)} <em>${esc(nextCode(job, t.key))}</em></button>`).join('')}
          </div>
        </div>
        <aside class="previewcol">
          <div class="previewhead noprint">
            <div class="ptabs">
              <button data-act="tab" data-tab="review">Review &amp; approve</button>
              <button data-act="tab" data-tab="sheet">Production sheet</button>
            </div>
            <small class="muted">Updates as you type</small>
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
    $app.querySelectorAll('.ptabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const approved = job.items.filter((i) => i.approved).length;
    const foot = {
      job: `<button class="btn" data-act="save">Save</button>
            <button class="btn gold" data-act="to-review" ${job.items.length ? '' : 'disabled'}>Proceed to production sheet →</button>`,
      review: `<a class="btn ghost" href="#/job/${job.id}">← Measurements</a>
            <button class="btn gold" data-act="to-sheet" ${approved ? '' : 'disabled'}>Open production sheet →</button>`,
      sheet: `<a class="btn ghost" href="#/review/${job.id}">← Review</a>
            <button class="btn gold" data-act="print">Print / Save PDF</button>`,
    };
    // wide screen: measurements are always on the left, so the buttons follow the right-hand tab
    const key = wide() ? (job.sentToReview ? tab : 'job') : pane;
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
  function field(label, key, type = 'text', cls = '') {
    return `<label class="f ${cls}"><span>${label}</span><input type="${type}" data-job="${key}" value="${esc(job[key] || '')}"></label>`;
  }

  // one line per window: code | width L C R | height T M B | design | more
  function itemCard(it, idx, dup) {
    const isDup = dup && dup.has(String(it.code).trim().toUpperCase());
    const open = openRows.has(it.id);
    const sub = [it.location, qtyOf(it) > 1 ? `× ${qtyOf(it)}` : '', it.colour, it.glass].filter(Boolean).join(' · ');
    return `<section class="item ${it.type === 'V' ? 'vent' : ''} ${open ? 'open' : ''}" data-id="${it.id}">
      <div class="row">
        <input class="code ${isDup ? 'bad' : ''}" data-k="code" value="${esc(it.code)}" title="${isDup ? 'This code is used twice' : 'Code (you can change it)'}" aria-label="Code">
        <div class="trio" data-g="w">${mInput('w', 0, 'Width left', it)}${mInput('w', 1, 'Width centre', it)}${mInput('w', 2, 'Width right', it)}</div>
        <div class="trio" data-g="h">${mInput('h', 0, 'Height top', it)}${mInput('h', 1, 'Height middle', it)}${mInput('h', 2, 'Height bottom', it)}</div>
        <button class="design ${it.design ? '' : 'empty'}" data-act="keypad" title="Design">${it.design ? esc(it.design) : 'Design'}</button>
        <button class="icon more" data-act="more" title="More: location, quantity, colour, glass, remarks, photo">${open ? '▴' : '⋯'}</button>
      </div>
      <div class="rowsub"><span data-status>${rowStatus(it)}</span><span class="muted" data-sub>${esc(sub)}</span><span data-pill>${it.approved ? `<span class="pill approved">Approved</span>` : ''}</span></div>
      <div class="details" ${open ? '' : 'hidden'}>
        <div class="grid">
          <label class="f"><span>Location</span><input data-k="location" value="${esc(it.location)}" placeholder="e.g. Hall, Master bedroom"></label>
          <label class="f"><span>Quantity</span><input inputmode="numeric" pattern="[0-9]*" data-k="qty" value="${esc(it.qty == null ? 1 : it.qty)}"></label>
          <label class="f"><span>Colour</span><input data-k="colour" list="dl-colour" value="${esc(it.colour)}" placeholder="e.g. White"></label>
          <label class="f"><span>Glass specification</span><input data-k="glass" list="dl-glass" value="${esc(it.glass)}" placeholder="e.g. 5 mm Toughened Clear"></label>
          <label class="f wide"><span>Remarks</span><textarea data-k="remarks" rows="2" placeholder="Opening side, site conditions…">${esc(it.remarks)}</textarea></label>
        </div>
        <div class="photo">
          ${it.photo ? `<img src="${it.photo}" alt="Photo of ${esc(it.code)}" data-act="view-photo"><button class="btn small ghost" data-act="del-photo">Remove photo</button>` : ''}
          <label class="btn small">${it.photo ? 'Change photo' : '📷 Add photo'}<input type="file" accept="image/*" data-photo hidden></label>
          <span class="grow"></span>
          <select data-k="type" aria-label="Type">${C.types.map((x) => `<option value="${x.key}" ${x.key === it.type ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
          <button class="icon" data-act="up" title="Move up">↑</button>
          <button class="icon" data-act="down" title="Move down">↓</button>
          <button class="icon danger" data-act="del" title="Delete">✕</button>
        </div>
      </div>
    </section>`;
  }
  function mInput(dim, i, label, it) {
    return `<input inputmode="numeric" pattern="[0-9]*" data-m="${dim}" data-i="${i}" value="${esc(it[dim][i])}" placeholder="${'LCRTMB'[dim === 'w' ? i : i + 3]}" aria-label="${label}" title="${label}">`;
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
      box.querySelectorAll('input').forEach((inp) => inp.classList.toggle('least', st.count > 1 && inp.value !== '' && Number(inp.value) === st.min));
    });
    card.querySelector('[data-status]').innerHTML = rowStatus(it);
  }
  function rowSub(card, it) {
    card.querySelector('[data-sub]').textContent = [it.location, qtyOf(it) > 1 ? `× ${qtyOf(it)}` : '', it.colour, it.glass].filter(Boolean).join(' · ');
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
      <div class="kp-top"><b>${esc(it.code)} design</b><input data-kp-text value="${esc(it.design)}" placeholder="Tap the codes below"></div>
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
    if (b) { b.textContent = it.design || 'Design'; b.classList.toggle('empty', !it.design); }
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
      <div class="actions">
        <button class="btn" data-act="approve-ok">Approve all within ${tol} mm</button>
      </div>
      <div class="review">
        ${rows.map(({ it, r }) => reviewCard(it, r)).join('')}
      </div>`;
  }
  function reviewCard(it, r) {
    const fw = it.final ? it.final.w : r.w.min, fh = it.final ? it.final.h : r.h.min;
    const cell = (arr, s) => arr.map((v) => {
      const n = Number(v);
      const cls = v === '' ? 'miss' : n === s.min ? 'least' : n === s.max && s.diff ? 'most' : '';
      return `<td class="${cls}">${v === '' ? '–' : esc(v)}</td>`;
    }).join('');
    const cls = it.approved ? 'approved' : r.flagged || !r.complete ? 'flagged' : '';
    return `<section class="card rv ${cls}" data-id="${it.id}">
      <div class="rv-head">
        <b class="rv-code">${esc(it.code)}</b><span class="rv-qty">× ${qtyOf(it)}</span><span class="muted">${esc(typeOf(it.type).label)}${it.location ? ' · ' + esc(it.location) : ''}${it.design ? ' · ' + esc(it.design) : ''}${it.colour ? ' · ' + esc(it.colour) : ''}</span>
        <span class="grow"></span>
        ${it.approved ? `<span class="pill approved">✓ Approved</span>` : r.flagged ? `<span class="pill over">⚠ Over ${settings.toleranceMm} mm</span>` : !r.complete ? `<span class="pill over">Incomplete</span>` : `<span class="pill">Ready</span>`}
      </div>
      <div class="rv-body">
        <table class="mt">
          <tr><th></th><th>1</th><th>2</th><th>3</th><th>Least</th><th>Diff</th></tr>
          <tr><th>W <small>L·C·R</small></th>${cell(it.w, r.w)}<td class="least">${mm(r.w.min)}</td><td class="${r.wOver ? 'over' : 'ok'}">${mm(r.w.diff)}</td></tr>
          <tr><th>H <small>T·M·B</small></th>${cell(it.h, r.h)}<td class="least">${mm(r.h.min)}</td><td class="${r.hOver ? 'over' : 'ok'}">${mm(r.h.diff)}</td></tr>
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
  function approveItem(it, force) {
    const r = RULES.check(it, settings.toleranceMm);
    if (!r.complete) return false;
    const fw = it.final ? Number(it.final.w) : r.w.min, fh = it.final ? Number(it.final.h) : r.h.min;
    if (!(fw > 0 && fh > 0)) { alert(`${it.code}: enter the production width and height.`); return false; }
    if (r.flagged && !force) {
      const msg = `${it.code}: the measurements differ by more than ${settings.toleranceMm} mm` +
        ` (width ${r.w.diff} mm, height ${r.h.diff} mm).\n\nApprove ${fw} × ${fh} anyway?`;
      if (!confirm(msg)) return false;
    }
    it.final = { w: fw, h: fh };
    it.approved = true; it.approvedAt = new Date().toISOString(); it.approvedSig = RULES.signature(it);
    return true;
  }

  // ================= Production sheet =================
  function sheetHtml() {
    const items = job.items.filter((i) => i.approved);
    const pending = job.items.length - items.length;
    const count = (k) => items.filter((i) => i.type === k).reduce((a, i) => a + qtyOf(i), 0);
    const total = items.reduce((a, i) => a + qtyOf(i), 0);
    return `
      <div class="sheetbar noprint">
        <p class="sub">${pending ? `<span class="warn">${pending} item${pending === 1 ? ' is' : 's are'} not approved yet and not on this sheet.</span>` : job.items.length ? 'All items approved.' : 'No items yet.'}</p>
        <button class="btn gold small" data-act="print">Print / Save PDF</button>
      </div>
      <article class="sheet">
        <header class="sh-head">
          <div class="sh-co"><img src="assets/titans_logo_trim.png" alt=""><div><b>${esc(C.company)}</b><span>PRODUCTION SHEET</span></div></div>
          <table class="sh-info">
            <tr><th>Job no</th><td>${esc(job.no)}</td><th>Date</th><td>${fmtDate(job.date)}</td></tr>
            <tr><th>Customer</th><td>${esc(job.customer)}</td><th>Phone</th><td>${esc(job.phone)}</td></tr>
            <tr><th>Site</th><td>${esc(job.site)}</td><th>Measured by</th><td>${esc(job.measuredBy)}</td></tr>
            <tr><th>Address</th><td colspan="3">${esc(job.address)}</td></tr>
          </table>
        </header>
        <table class="sh-table">
          <thead><tr><th>#</th><th>Code</th><th>Type</th><th>Location</th><th class="num">Width</th><th class="num">Height</th><th class="num">Qty</th><th>Design</th><th>Colour</th><th>Glass</th><th>Remarks</th><th>Photo</th></tr></thead>
          <tbody>
            ${items.map((it, i) => `<tr>
              <td>${i + 1}</td><td><b>${esc(it.code)}</b></td><td>${esc(typeOf(it.type).label)}</td><td>${esc(it.location)}</td>
              <td class="num"><b>${esc(it.final.w)}</b></td><td class="num"><b>${esc(it.final.h)}</b></td><td class="num"><b>${qtyOf(it)}</b></td>
              <td>${esc(it.design)}</td><td>${esc(it.colour)}</td><td>${esc(it.glass)}</td><td>${esc(it.remarks)}</td>
              <td>${it.photo ? `<img src="${it.photo}" alt="">` : ''}</td>
            </tr>`).join('') || `<tr><td colspan="12" class="empty">No approved items yet.</td></tr>`}
          </tbody>
        </table>
        <footer class="sh-foot">
          <span>Total quantity: <b>${total}</b> (${C.types.map((t) => `${esc(t.label)}s ${count(t.key)}`).join(', ')}) · All sizes in mm</span>
          <span>Approved ${items.length ? fmtDate(items.map((i) => i.approvedAt).sort().pop()) : ''}</span>
        </footer>
        <div class="sh-sign"><div>Measured by</div><div>Approved by</div><div>Production in-charge</div></div>
      </article>`;
  }

  function steps(cur) {
    if (!job) return '';
    const s = [['job', 'Measurement'], ['review', 'Review & approve'], ['sheet', 'Production sheet']];
    const ok = job.items.length > 0;
    return `<nav class="steps">${s.map(([k, l], i) => {
      const href = k === 'job' || ok ? `#/${k}/${job.id}` : null;
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
        <div class="f"><span>Design codes (the keys on the design key pad)</span>
          <div class="keylist" data-keylist>${settings.keys.map(([k, t]) => keyRow(k, t)).join('')}</div>
          <div><button class="btn small" data-act="key-add">+ Add code</button></div>
        </div>
        <label class="f"><span>Glass suggestions (one per line)</span><textarea rows="8" data-set="glass">${esc(settings.glass.join('\n'))}</textarea></label>
        <label class="f"><span>Colour suggestions (one per line)</span><textarea rows="6" data-set="colours">${esc(settings.colours.join('\n'))}</textarea></label>
        <div class="actions"><button class="btn gold" data-act="save-settings">Save settings</button></div>
      </section>
      <section class="card">
        <h2>Backup</h2>
        <p class="sub">All jobs are kept on this phone / PC. Download a backup now and then, or to move jobs to another device.</p>
        <div class="actions">
          <button class="btn" data-act="export">Download backup</button>
          <label class="btn ghost">Restore from backup<input type="file" accept="application/json,.json" data-import hidden></label>
        </div>
      </section>`;
  }

  function keyRow(k = '', t = '') {
    return `<div class="keyrow"><input data-key-k value="${esc(k)}" maxlength="8" placeholder="Code" aria-label="Code"><input data-key-t value="${esc(t)}" placeholder="What it means" aria-label="What it means"><button class="icon danger" data-act="key-del" title="Delete">✕</button></div>`;
  }

  // ---------- photo ----------
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not a picture')); };
      img.src = url;
    });
  }

  // ---------- events ----------
  const itemOf = (el) => { const card = el.closest('[data-id]'); return card && job.items.find((i) => i.id === card.dataset.id); };

  $app.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-search]')) {
      const q = el.value.trim().toLowerCase();
      document.querySelectorAll('.jobrow').forEach((r) => (r.hidden = q && !r.dataset.text.includes(q)));
      return;
    }
    if (!job) return;
    if (el.dataset.job) { job[el.dataset.job] = el.value; previewSoon(); return touch(); }
    const it = itemOf(el);
    if (!it) return;
    if (el.dataset.m) {
      el.value = el.value.replace(/[^\d.]/g, '');
      it[el.dataset.m][Number(el.dataset.i)] = el.value;
      const wasApproved = it.approved;
      dropStaleApproval(it);
      const card = el.closest('.item');
      markRow(card, it);
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
    if (el.dataset.k && el.dataset.k !== 'type') {
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
    if (el.dataset.k === 'type' && it) {
      it.type = el.value;
      if (confirm(`Change the code to ${nextCode(job, el.value)}?`)) it.code = nextCode(job, el.value);
      touch(); viewWork();
    }
    if (el.matches('[data-photo]') && it && el.files[0]) {
      try { it.photo = await readPhoto(el.files[0]); touch(); await saveNow(); viewWork(); }
      catch (err) { alert('Could not use this photo: ' + err.message); }
    }
    if (el.dataset.final && it) renderPreview();
  });

  $app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const it = job && itemOf(b);

    if (act === 'new-job') {
      const j = { id: uid(), no: await nextJobNo(), customer: '', phone: '', site: '', address: '', measuredBy: '', date: today(),
        items: [], created: new Date().toISOString(), updated: new Date().toISOString(), status: 'measuring' };
      await DB.putJob(j);
      location.hash = `#/job/${j.id}`;
    }
    if (act === 'del-job' && confirm(`Delete job ${job.no} and all its measurements? This cannot be undone.`)) {
      await DB.deleteJob(job.id); job = null; location.hash = '#/';
    }
    if (act === 'add') {
      const n = newItem(job, b.dataset.type);
      job.items.push(n); touch(); viewWork();
      const card = document.querySelector(`[data-id="${n.id}"]`);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.querySelector('[data-m="w"]').focus({ preventScroll: true });
    }
    if (act === 'del' && it && confirm(`Delete ${it.code}?`)) { job.items = job.items.filter((x) => x !== it); touch(); viewWork(); }
    if ((act === 'up' || act === 'down') && it) {
      const i = job.items.indexOf(it), j = act === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < job.items.length) { [job.items[i], job.items[j]] = [job.items[j], job.items[i]]; touch(); viewWork(); }
    }
    if (act === 'keypad' && it) openKeypad(it);
    if (act === 'more' && it) {
      const card = b.closest('.item'), open = !openRows.has(it.id);
      open ? openRows.add(it.id) : openRows.delete(it.id);
      card.classList.toggle('open', open); card.querySelector('.details').hidden = !open; b.textContent = open ? '▴' : '⋯';
    }
    if (act === 'del-photo' && it) { it.photo = null; touch(); viewWork(); }
    if (act === 'view-photo') {
      const box = document.createElement('div');
      box.className = 'lightbox'; box.innerHTML = `<img src="${b.src}" alt="">`;
      box.onclick = () => box.remove();
      document.body.appendChild(box);
    }
    if (act === 'save') { await saveNow(); toast('Saved'); }
    if (act === 'to-review') {
      const dup = dupCodes(job);
      if (dup.size) return alert('These codes are used more than once: ' + [...dup].join(', ') + '\nChange them first.');
      const missing = job.items.filter((x) => !RULES.check(x, settings.toleranceMm).complete).map((x) => x.code);
      if (missing.length && !confirm(`Not all 3 widths and 3 heights are filled for: ${missing.join(', ')}.\nThey cannot be approved until filled. Continue?`)) return;
      job.sentToReview = true; touch(); await saveNow();
      tab = 'review';
      if (wide()) { showPane(); toast('Check and approve on the right'); }
      else location.hash = `#/review/${job.id}`;
    }
    if (act === 'approve' && it) { if (approveItem(it)) { touch(); renderPreview(); refreshCardPills(); showFootOnly(); } }
    if (act === 'unapprove' && it) { it.approved = false; it.approvedAt = null; it.approvedSig = null; touch(); renderPreview(); refreshCardPills(); showFootOnly(); }
    if (act === 'tab') {
      tab = b.dataset.tab;
      if (wide()) showPane();
      else location.hash = `#/${tab}/${job.id}`;
    }
    if (act === 'approve-ok') {
      let n = 0;
      job.items.forEach((x) => { const r = RULES.check(x, settings.toleranceMm); if (!x.approved && r.complete && !r.flagged && approveItem(x, true)) n++; });
      touch(); renderPreview(); refreshCardPills(); showFootOnly(); toast(n ? `${n} approved` : 'Nothing to approve');
    }
    if (act === 'to-sheet') { await saveNow(); tab = 'sheet'; if (wide()) showPane(); else location.hash = `#/sheet/${job.id}`; }
    if (act === 'print') { tab = 'sheet'; renderPreview(); }
    if (act === 'print') window.print();
    if (act === 'save-settings') saveSettings();
    if (act === 'key-add') {
      document.querySelector('[data-keylist]').insertAdjacentHTML('beforeend', keyRow());
      document.querySelector('.keyrow:last-child [data-key-k]').focus();
    }
    if (act === 'key-del') b.closest('.keyrow').remove();
    if (act === 'export') exportBackup();
  });

  // ---------- settings & backup ----------
  async function saveSettings() {
    const get = (k) => document.querySelector(`[data-set="${k}"]`).value;
    const tol = Number(get('toleranceMm'));
    if (!(tol >= 0)) return alert('Enter the difference in mm.');
    const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    const keys = [...document.querySelectorAll('.keyrow')]
      .map((r) => [r.querySelector('[data-key-k]').value.trim().toUpperCase().replace(/\s+/g, ''), r.querySelector('[data-key-t]').value.trim()])
      .filter(([k]) => k);
    const seen = new Set(), twice = keys.filter(([k]) => (seen.has(k) ? true : (seen.add(k), false))).map(([k]) => k);
    if (twice.length) return alert('These codes are there twice: ' + twice.join(', '));
    settings = { toleranceMm: tol, keys, glass: lines(get('glass')), colours: lines(get('colours')) };
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
    if (s) settings = Object.assign(settings, s);
    fillLists();
    route();
  })();
})();
