/*
 * Sharing jobs between all phones and PCs (no login), through Supabase (supabase/m2p-jobs.sql).
 *
 * Every device keeps working on its own copy (works without internet). Changes are sent soon after they
 * are made; other devices' changes are fetched on opening, every 20 seconds and when the internet returns.
 * A job is "waiting to send" while job.updated differs from job.syncedAt. If two devices change the same
 * job, the newest change wins. Deleted jobs are sent as a marker so they disappear everywhere.
 */
window.SYNC = (function () {
  const C = window.CONFIG;
  const enabled = !!(C.supabaseUrl && C.supabaseKey);
  const base = String(C.supabaseUrl || '').replace(/\/$/, '') + '/rest/v1';
  const H = { apikey: C.supabaseKey, Authorization: 'Bearer ' + C.supabaseKey, 'Content-Type': 'application/json' };

  const state = { status: enabled ? 'starting' : 'off', waiting: 0, last: null, error: '' };
  const hooks = { status: [], changed: [], synced: [] };
  const on = (k, fn) => hooks[k].push(fn);
  const emit = (k, ...a) => hooks[k].forEach((fn) => { try { fn(...a); } catch (e) { /* keep going */ } });
  const setStatus = (s, extra) => { Object.assign(state, { status: s }, extra || {}); emit('status', state); };

  async function req(path, opt) {
    const res = await fetch(base + path, Object.assign({ cache: 'no-store' }, opt, { headers: Object.assign({}, H, (opt || {}).headers) }));
    if (!res.ok) {
      const t = (await res.text()).slice(0, 200);
      const err = new Error(`${res.status} ${t}`);
      err.notSetUp = res.status === 404 || /relation .* does not exist|Could not find the table|schema cache/i.test(t);
      throw err;
    }
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  }

  const dirty = (j) => !j.syncedAt || j.syncedAt !== j.updated;
  // what goes online: the job without photo files still waiting to upload, and without local markers
  function clean(job) {
    const j = JSON.parse(JSON.stringify(job));
    delete j.syncedAt;
    (j.items || []).forEach((it) => (it.photos || []).forEach((p) => { delete p.full; }));
    return j;
  }
  // a newer copy from another device: keep this phone's photos that are still waiting to upload
  function merge(remote, local) {
    if (!local) return remote;
    const files = {};
    (local.items || []).forEach((it) => (it.photos || []).forEach((p) => { if (p.full && p.status !== 'done') files[p.id] = p; }));
    (remote.items || []).forEach((it) => (it.photos || []).forEach((p) => {
      if (files[p.id] && p.status !== 'done') { p.full = files[p.id].full; p.status = files[p.id].status; }
    }));
    return remote;
  }

  async function countWaiting() {
    const jobs = await DB.allJobs();
    const dels = (await DB.get('syncDeletes')) || [];
    return jobs.filter(dirty).length + dels.length + ((await DB.get('settingsDirty')) ? 1 : 0);
  }

  async function push() {
    const jobs = (await DB.allJobs()).filter(dirty);
    if (jobs.length) {
      await req('/m2p_jobs', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(jobs.map((j) => ({ id: j.id, data: clean(j), deleted: false }))) });
      for (const j of jobs) {
        const now = await DB.getJob(j.id);
        if (now && now.updated === j.updated) { now.syncedAt = j.updated; await DB.putJob(now); emit('synced', j.id, j.updated); }
      }
    }
    const dels = (await DB.get('syncDeletes')) || [];
    if (dels.length) {
      await req('/m2p_jobs', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(dels.map((id) => ({ id, data: {}, deleted: true }))) });
      await DB.set('syncDeletes', []);
    }
    if (await DB.get('settingsDirty')) {
      const s = await DB.get('settings');
      if (s) await req('/m2p_settings', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ key: 'settings', data: s }]) });
      await DB.set('settingsDirty', false);
    }
  }

  async function pull() {
    const changed = [];
    let cursor = (await DB.get('pullCursor')) || '1970-01-01T00:00:00Z';
    for (;;) {
      const rows = await req(`/m2p_jobs?select=id,data,deleted,updated_at&updated_at=gt.${encodeURIComponent(cursor)}&order=updated_at.asc&limit=200`);
      for (const row of rows) {
        const local = await DB.getJob(row.id);
        if (row.deleted) {
          if (local && !dirty(local)) { await DB.deleteJob(row.id); changed.push(row.id); }
        } else if (row.data && row.data.id) {
          const remote = row.data;
          const take = !local || (!dirty(local) && remote.updated !== local.updated) || (dirty(local) && (remote.updated || '') > (local.updated || ''));
          if (take) {
            const j = merge(remote, local);
            j.syncedAt = j.updated;
            await DB.putJob(j);
            changed.push(row.id);
          }
        }
        cursor = row.updated_at;
      }
      await DB.set('pullCursor', cursor);
      if (rows.length < 200) break;
    }
    // shared settings: take the online copy when it is newer and nothing here is waiting to send
    const s = await req('/m2p_settings?select=data,updated_at&key=eq.settings');
    if (s && s[0] && !(await DB.get('settingsDirty'))) {
      const local = (await DB.get('settings')) || {};
      if ((s[0].data.updatedAt || '') > (local.updatedAt || '')) { await DB.set('settings', s[0].data); changed.push('settings'); }
    }
    return changed;
  }

  let busy = false, again = false, timer = null;
  async function run() {
    if (!enabled) return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) { setStatus('offline', { waiting: await countWaiting() }); return; }
    busy = true;
    setStatus('syncing');
    try {
      await push();
      const changed = await pull();
      setStatus('synced', { last: new Date(), waiting: await countWaiting(), error: '' });
      if (changed.length) emit('changed', changed);
    } catch (err) {
      setStatus(err.notSetUp ? 'notsetup' : 'error', { error: err.message, waiting: await countWaiting().catch(() => 0) });
    } finally {
      busy = false;
      if (again) { again = false; setTimeout(run, 300); }
    }
  }
  function soon() { clearTimeout(timer); timer = setTimeout(run, 1500); }
  async function markDeleted(id) {
    const d = (await DB.get('syncDeletes')) || [];
    if (!d.includes(id)) d.push(id);
    await DB.set('syncDeletes', d);
    soon();
  }
  async function settingsChanged() { await DB.set('settingsDirty', true); soon(); }

  // job numbers from the server, so two devices never give out the same one
  async function nextJobNumber(atLeast) {
    if (!enabled || !navigator.onLine) return null;
    try {
      const n = await req('/rpc/m2p_next_job_no', { method: 'POST', body: JSON.stringify({ at_least: atLeast || 0 }) });
      return Number(n) || null;
    } catch (err) { return null; }
  }

  if (enabled) {
    window.addEventListener('online', run);
    window.addEventListener('offline', () => setStatus('offline'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    setInterval(() => { if (!document.hidden) run(); }, 20000);
  }

  return { enabled, state, on, run, soon, markDeleted, settingsChanged, nextJobNumber, dirty };
})();
