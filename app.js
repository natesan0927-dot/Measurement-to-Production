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
  let settings = { toleranceMm: C.toleranceMm, designs: C.designs.slice(), glass: C.glass.slice() };
  let job = null;        // the job open right now
  let saveTimer = null;

  // ---------- small helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = d.slice(0, 10).split('-'); return `${dd}-${m}-${y}`; };
  const typeOf = (key) => C.types.find((t) => t.key === key) || C.types[0];
  const mm = (v) => (v == null || v === '' ? '–' : `${v}`);

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
  }

  function fillLists() {
    document.getElementById('dl-design').innerHTML = settings.designs.map((d) => `<option value="${esc(d)}">`).join('');
    document.getElementById('dl-glass').innerHTML = settings.glass.map((d) => `<option value="${esc(d)}">`).join('');
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
      design: '', glass: '', remarks: '', photo: null,
      final: null, approved: false, approvedAt: null, approvedSig: null,
    };
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
    window.scrollTo(0, 0);
    if (!view) return viewHome();
    if (view === 'settings') return viewSettings();
    job = await DB.getJob(id);
    if (!job) { location.hash = '#/'; return; }
    job.items = job.items || [];
    job.items.forEach(dropStaleApproval);
    if (view === 'job') return viewJob();
    if (view === 'review') return viewReview();
    if (view === 'sheet') return viewSheet();
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

  // ================= Measurement =================
  function viewJob() {
    const dup = dupCodes(job);
    $app.innerHTML = `
      ${steps('job')}
      <div class="head">
        <div><h1>${esc(job.no)} <small data-saved>Saved</small></h1><p class="sub">Measure each window: 3 widths (left, centre, right) and 3 heights (top, middle, bottom), in mm.</p></div>
        <button class="btn ghost danger" data-act="del-job">Delete job</button>
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
      <div class="items" data-items>
        ${job.items.map((it, idx) => itemCard(it, idx, dup)).join('')}
      </div>
      ${job.items.length ? '' : `<div class="empty">No windows yet. Add a window or a ventilator below.</div>`}
      <div class="addbar">
        ${C.types.map((t) => `<button class="btn" data-act="add" data-type="${t.key}">+ Add ${esc(t.label)} <em>${esc(nextCode(job, t.key))}</em></button>`).join('')}
      </div>
      <div class="footbar">
        <button class="btn" data-act="save">Save</button>
        <button class="btn gold" data-act="to-review" ${job.items.length ? '' : 'disabled'}>Proceed to production sheet →</button>
      </div>`;
  }
  function field(label, key, type = 'text', cls = '') {
    return `<label class="f ${cls}"><span>${label}</span><input type="${type}" data-job="${key}" value="${esc(job[key] || '')}"></label>`;
  }

  function itemCard(it, idx, dup) {
    const t = typeOf(it.type);
    const isDup = dup && dup.has(String(it.code).trim().toUpperCase());
    return `<section class="card item ${it.type === 'V' ? 'vent' : ''}" data-id="${it.id}">
      <div class="item-head">
        <span class="badge">${idx + 1}</span>
        <label class="code ${isDup ? 'bad' : ''}"><span>Code</span><input data-k="code" value="${esc(it.code)}" title="${isDup ? 'This code is used twice' : 'You can change the code'}"></label>
        <select data-k="type">${C.types.map((x) => `<option value="${x.key}" ${x.key === it.type ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
        <span class="grow"></span>
        ${it.approved ? `<span class="pill approved">Approved</span>` : ''}
        <button class="icon" data-act="up" title="Move up">↑</button>
        <button class="icon" data-act="down" title="Move down">↓</button>
        <button class="icon danger" data-act="del" title="Delete">✕</button>
      </div>
      <div class="meas">
        <div class="mgroup">
          <h3>Width <small>mm</small></h3>
          <div class="trio">
            ${mInput('w', 0, 'Left', it)}${mInput('w', 1, 'Centre', it)}${mInput('w', 2, 'Right', it)}
          </div>
        </div>
        <div class="mgroup">
          <h3>Height <small>mm</small></h3>
          <div class="trio">
            ${mInput('h', 0, 'Top', it)}${mInput('h', 1, 'Middle', it)}${mInput('h', 2, 'Bottom', it)}
          </div>
        </div>
      </div>
      <div class="live" data-live>${liveSummary(it)}</div>
      <div class="grid">
        <label class="f"><span>Design</span><input data-k="design" list="dl-design" value="${esc(it.design)}" placeholder="e.g. 2 Track Sliding"></label>
        <label class="f"><span>Glass specification</span><input data-k="glass" list="dl-glass" value="${esc(it.glass)}" placeholder="e.g. 5 mm Toughened Clear"></label>
        <label class="f wide"><span>Remarks</span><textarea data-k="remarks" rows="2" placeholder="Location, opening side, site conditions…">${esc(it.remarks)}</textarea></label>
      </div>
      <div class="photo">
        ${it.photo
          ? `<img src="${it.photo}" alt="Photo of ${esc(it.code)}" data-act="view-photo"><button class="btn small ghost" data-act="del-photo">Remove photo</button>`
          : ''}
        <label class="btn small">${it.photo ? 'Change photo' : '📷 Add photo'}<input type="file" accept="image/*" data-photo hidden></label>
      </div>
    </section>`;
  }
  function mInput(dim, i, label, it) {
    return `<label class="m"><span>${label}</span><input inputmode="numeric" pattern="[0-9]*" data-m="${dim}" data-i="${i}" value="${esc(it[dim][i])}" placeholder="0"></label>`;
  }
  function liveSummary(it) {
    const r = RULES.check(it, settings.toleranceMm);
    const part = (s, over, name) => s.count
      ? `<span class="${over ? 'over' : 'ok'}">${name}: least <b>${s.min}</b> · diff <b>${s.diff} mm</b>${over ? ' ⚠' : ''}${s.complete ? '' : ` · ${3 - s.count} missing`}</span>`
      : `<span class="muted">${name}: not measured</span>`;
    return part(r.w, r.wOver, 'Width') + part(r.h, r.hOver, 'Height');
  }

  // ================= Review & approve =================
  function viewReview() {
    const tol = settings.toleranceMm;
    const rows = job.items.map((it) => ({ it, r: RULES.check(it, tol) }));
    const flagged = rows.filter((x) => x.r.flagged).length;
    const incomplete = rows.filter((x) => !x.r.complete).length;
    const approved = rows.filter((x) => x.it.approved).length;
    $app.innerHTML = `
      ${steps('review')}
      <div class="head">
        <div><h1>Review & approve <small data-saved>Saved</small></h1>
        <p class="sub">${esc(job.no)} · ${esc(job.customer)} · The least width and height are taken for production. More than <b>${tol} mm</b> difference is shown in red.</p></div>
      </div>
      <div class="summary">
        <div><b>${rows.length}</b><span>items</span></div>
        <div class="${approved === rows.length ? 'ok' : ''}"><b>${approved}</b><span>approved</span></div>
        <div class="${flagged ? 'over' : ''}"><b>${flagged}</b><span>over ${tol} mm</span></div>
        <div class="${incomplete ? 'over' : ''}"><b>${incomplete}</b><span>incomplete</span></div>
      </div>
      <div class="actions">
        <button class="btn" data-act="approve-ok">Approve all within ${tol} mm</button>
        <a class="btn ghost" href="#/job/${job.id}">← Back to measurements</a>
      </div>
      <div class="review">
        ${rows.map(({ it, r }) => reviewCard(it, r)).join('')}
      </div>
      <div class="footbar">
        <span class="muted">${approved} of ${rows.length} approved</span>
        <button class="btn gold" data-act="to-sheet" ${approved ? '' : 'disabled'}>Open production sheet →</button>
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
        <b class="rv-code">${esc(it.code)}</b><span class="muted">${esc(typeOf(it.type).label)}${it.design ? ' · ' + esc(it.design) : ''}</span>
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
  function viewSheet() {
    const items = job.items.filter((i) => i.approved);
    const pending = job.items.length - items.length;
    const count = (k) => items.filter((i) => i.type === k).length;
    $app.innerHTML = `
      <div class="noprint">${steps('sheet')}</div>
      <div class="head noprint">
        <div><h1>Production sheet</h1><p class="sub">${pending ? `<span class="warn">${pending} item${pending === 1 ? ' is' : 's are'} not approved yet and not on this sheet.</span>` : 'All items approved.'}</p></div>
        <div class="actions">
          <a class="btn ghost" href="#/review/${job.id}">← Review</a>
          <button class="btn gold" data-act="print">Print / Save PDF</button>
        </div>
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
          <thead><tr><th>#</th><th>Code</th><th>Type</th><th class="num">Width</th><th class="num">Height</th><th>Design</th><th>Glass</th><th>Remarks</th><th>Photo</th></tr></thead>
          <tbody>
            ${items.map((it, i) => `<tr>
              <td>${i + 1}</td><td><b>${esc(it.code)}</b></td><td>${esc(typeOf(it.type).label)}</td>
              <td class="num"><b>${esc(it.final.w)}</b></td><td class="num"><b>${esc(it.final.h)}</b></td>
              <td>${esc(it.design)}</td><td>${esc(it.glass)}</td><td>${esc(it.remarks)}</td>
              <td>${it.photo ? `<img src="${it.photo}" alt="">` : ''}</td>
            </tr>`).join('') || `<tr><td colspan="9" class="empty">No approved items yet.</td></tr>`}
          </tbody>
        </table>
        <footer class="sh-foot">
          <span>Total: <b>${items.length}</b> (${C.types.map((t) => `${esc(t.label)}s ${count(t.key)}`).join(', ')}) · All sizes in mm</span>
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
        <label class="f"><span>Design suggestions (one per line)</span><textarea rows="8" data-set="designs">${esc(settings.designs.join('\n'))}</textarea></label>
        <label class="f"><span>Glass suggestions (one per line)</span><textarea rows="8" data-set="glass">${esc(settings.glass.join('\n'))}</textarea></label>
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
    if (el.dataset.job) { job[el.dataset.job] = el.value; return touch(); }
    const it = itemOf(el);
    if (!it) return;
    if (el.dataset.m) {
      el.value = el.value.replace(/[^\d.]/g, '');
      it[el.dataset.m][Number(el.dataset.i)] = el.value;
      const wasApproved = it.approved;
      dropStaleApproval(it);
      const card = el.closest('.item');
      card.querySelector('[data-live]').innerHTML = liveSummary(it);
      if (wasApproved && !it.approved) { card.querySelector('.item-head .pill')?.remove(); toast(`${it.code}: measurement changed, approve again`); }
      return touch();
    }
    if (el.dataset.final) {
      const r = RULES.check(it, settings.toleranceMm);
      it.final = it.final || { w: r.w.min, h: r.h.min };
      it.final[el.dataset.final] = el.value.replace(/[^\d.]/g, '');
      return touch();
    }
    if (el.dataset.k && el.dataset.k !== 'type') {
      it[el.dataset.k] = el.value;
      if (el.dataset.k === 'code') {
        const dup = dupCodes(job);
        document.querySelectorAll('.item').forEach((card) => {
          const x = job.items.find((i) => i.id === card.dataset.id);
          card.querySelector('.code').classList.toggle('bad', dup.has(String(x.code).trim().toUpperCase()));
        });
      }
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
      touch(); viewJob();
    }
    if (el.matches('[data-photo]') && it && el.files[0]) {
      try { it.photo = await readPhoto(el.files[0]); touch(); await saveNow(); viewJob(); }
      catch (err) { alert('Could not use this photo: ' + err.message); }
    }
    if (el.dataset.final && it) viewReview();
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
      job.items.push(n); touch(); viewJob();
      const card = document.querySelector(`[data-id="${n.id}"]`);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.querySelector('[data-m="w"]').focus({ preventScroll: true });
    }
    if (act === 'del' && it && confirm(`Delete ${it.code}?`)) { job.items = job.items.filter((x) => x !== it); touch(); viewJob(); }
    if ((act === 'up' || act === 'down') && it) {
      const i = job.items.indexOf(it), j = act === 'up' ? i - 1 : i + 1;
      if (j >= 0 && j < job.items.length) { [job.items[i], job.items[j]] = [job.items[j], job.items[i]]; touch(); viewJob(); }
    }
    if (act === 'del-photo' && it) { it.photo = null; touch(); viewJob(); }
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
      location.hash = `#/review/${job.id}`;
    }
    if (act === 'approve' && it) { if (approveItem(it)) { touch(); viewReview(); } }
    if (act === 'unapprove' && it) { it.approved = false; it.approvedAt = null; it.approvedSig = null; touch(); viewReview(); }
    if (act === 'approve-ok') {
      let n = 0;
      job.items.forEach((x) => { const r = RULES.check(x, settings.toleranceMm); if (!x.approved && r.complete && !r.flagged && approveItem(x, true)) n++; });
      touch(); viewReview(); toast(n ? `${n} approved` : 'Nothing to approve');
    }
    if (act === 'to-sheet') { await saveNow(); location.hash = `#/sheet/${job.id}`; }
    if (act === 'print') window.print();
    if (act === 'save-settings') saveSettings();
    if (act === 'export') exportBackup();
  });

  // ---------- settings & backup ----------
  async function saveSettings() {
    const get = (k) => document.querySelector(`[data-set="${k}"]`).value;
    const tol = Number(get('toleranceMm'));
    if (!(tol >= 0)) return alert('Enter the difference in mm.');
    const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
    settings = { toleranceMm: tol, designs: lines(get('designs')), glass: lines(get('glass')) };
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
