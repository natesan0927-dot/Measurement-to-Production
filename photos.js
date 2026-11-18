/*
 * Site photos: kept on the phone first, then uploaded to Supabase Storage (bucket in config.js)
 * as soon as there is internet. Installation staff open them from the link / QR code on the
 * installation sheet (photos.html), with no login. Supabase setup: supabase/m2p-photos.sql.
 *
 * Each photo: { id, path, thumb, full, status }   status: 'waiting' | 'done' | 'failed'
 *   path  = <job photo key>/<item id>/<photo id>.jpg   (the job key is long and random)
 *   thumb = small picture kept on the phone;  full = the picture to upload, removed once uploaded
 */
window.PHOTOS = (function () {
  const C = window.CONFIG;
  const enabled = !!(C.supabaseUrl && C.supabaseKey && C.photoBucket);
  const base = String(C.supabaseUrl || '').replace(/\/$/, '') + '/storage/v1';

  const publicUrl = (path) => `${base}/object/public/${C.photoBucket}/${path}`;

  function randomKey(n) {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(bytes, (b) => abc[b % abc.length]).join('');
  }

  // shrink a picture from the camera: one to upload, one small one to show on the phone
  function prepare(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const make = (max, q) => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', q);
        };
        const out = { full: make(1600, 0.8), thumb: make(220, 0.7) };
        URL.revokeObjectURL(url);
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture')); };
      img.src = url;
    });
  }

  async function upload(path, dataUrl) {
    if (!enabled) throw new Error('Online photo storage is not set up');
    const blob = await (await fetch(dataUrl)).blob();
    const res = await fetch(`${base}/object/${C.photoBucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: C.supabaseKey,
        Authorization: 'Bearer ' + C.supabaseKey,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
        'cache-control': '31536000',
      },
      body: blob,
    });
    if (!res.ok) throw new Error(`Upload refused (${res.status}): ${(await res.text()).slice(0, 160)}`);
  }

  // the link an installer opens: the photo page with what it needs in the address
  function galleryLink(job, it) {
    const done = (it.photos || []).filter((p) => p.status === 'done');
    if (!done.length) return '';
    const dir = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    const q = new URLSearchParams({
      k: job.photoKey, i: it.id, p: done.map((p) => p.id).join(','),
      c: it.code, n: job.no, l: it.location || '', s: it.final ? `${it.final.w} × ${it.final.h}` : '',
    });
    return `${dir}photos.html#${q.toString()}`;
  }

  return { enabled, publicUrl, randomKey, prepare, upload, galleryLink };
})();
