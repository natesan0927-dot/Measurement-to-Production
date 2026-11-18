/*
 * Draws a window from its design codes, to the shape of its width x height.
 *
 *   "SL SL"      two sliding panes          "OP FIX OP"   openable, fixed, openable
 *   "TH" / "BH"  top hung / bottom hung     "VENT FAN"    ventilator with a fan
 *   MESH adds a mosquito mesh, ARCH an arched top. Unknown codes are drawn as a plain pane with the code.
 *
 * Symbols follow the usual convention: the lines of a triangle meet on the handle side,
 * the open side of the triangle is the hinge side.
 */
window.DRAW = (function () {
  const PANE = ['SL', 'OP', 'TH', 'BH', 'FIX', 'VENT', 'FAN', 'LOUV', 'T&T', 'DOOR'];
  const MODS = ['MESH', 'ARCH'];

  function parse(design) {
    const tokens = String(design || '').toUpperCase().split(/[\s+,/]+/).filter(Boolean);
    const panes = tokens.filter((t) => !MODS.includes(t));
    return { panes, mesh: tokens.includes('MESH'), arch: tokens.includes('ARCH') };
  }

  let seq = 0;   // each drawing gets its own ids, so a hidden one never takes the colours of the others
  function svg(design, w, h, opt) {
    opt = opt || {};
    const id = 'mtp' + (++seq);
    const { panes, mesh, arch } = parse(design);
    if (!panes.length) return '';
    w = Number(w) || 1200; h = Number(h) || 1200;
    // keep the shape believable even for odd numbers
    const ratio = Math.max(0.3, Math.min(3.2, w / h));
    const H = 100, W = H * ratio, f = 4.5;            // frame thickness
    const archH = arch ? Math.min(W / 2, 30) : 0;
    const VH = H + archH;
    const ink = opt.ink || '#131B4E', glass = opt.glass || `url(#${id}g)`;
    const pw = (W - f * 2) / panes.length;
    const top = f + archH, bot = VH - f, ph = bot - top;
    let out = '';

    // frame
    if (arch) {
      out += `<path d="M0 ${VH} V${archH} Q${W / 2} ${-archH * 0.95} ${W} ${archH} V${VH} Z" fill="${ink}"/>`;
      out += `<path d="M${f} ${top} Q${W / 2} ${f - archH * 0.9} ${W - f} ${top} Z" fill="${glass}" stroke="${ink}" stroke-width="1"/>`;
    } else {
      out += `<rect x="0" y="0" width="${W}" height="${VH}" rx="2" fill="${ink}"/>`;
    }

    panes.forEach((p, i) => {
      const x = f + i * pw, cx = x + pw / 2, cy = top + ph / 2, m = 3.2;
      const x1 = x + m, x2 = x + pw - m, y1 = top + m, y2 = bot - m;
      const known = PANE.includes(p);
      // sash / glass
      out += `<rect x="${x + 0.8}" y="${top + 0.8}" width="${pw - 1.6}" height="${ph - 1.6}" fill="${glass}" stroke="${ink}" stroke-width="1.6"/>`;
      if (['SL', 'OP', 'TH', 'BH', 'T&T', 'DOOR'].includes(p)) {
        out += `<rect x="${x + 2.6}" y="${top + 2.6}" width="${pw - 5.2}" height="${ph - 5.2}" fill="none" stroke="${ink}" stroke-width=".9" opacity=".55"/>`;
      }
      const L = `stroke="${ink}" stroke-width="1.1" fill="none" stroke-linecap="round"`;
      const leftHinge = i < panes.length / 2;        // panes on the left open from the left edge
      if (p === 'SL') {
        const dir = i % 2 === 0 ? 1 : -1, a = Math.min(pw * 0.28, 12);
        out += `<path d="M${cx - a * dir} ${cy} H${cx + a * dir} M${cx + a * dir} ${cy} l${-4 * dir} -3 M${cx + a * dir} ${cy} l${-4 * dir} 3" ${L} stroke-width="1.6"/>`;
      } else if (p === 'OP' || p === 'DOOR') {
        out += leftHinge
          ? `<path d="M${x1} ${y1} L${x2} ${cy} L${x1} ${y2}" ${L} stroke-dasharray="3 2"/>`
          : `<path d="M${x2} ${y1} L${x1} ${cy} L${x2} ${y2}" ${L} stroke-dasharray="3 2"/>`;
        const hx = leftHinge ? x2 - 3 : x1 + 3;
        out += `<rect x="${hx - 1}" y="${cy - (p === 'DOOR' ? 2 : 4)}" width="2" height="${p === 'DOOR' ? 4 : 8}" rx="1" fill="${ink}"/>`;
      } else if (p === 'TH') {
        out += `<path d="M${x1} ${y1} L${cx} ${y2} L${x2} ${y1}" ${L} stroke-dasharray="3 2"/>`;
      } else if (p === 'BH') {
        out += `<path d="M${x1} ${y2} L${cx} ${y1} L${x2} ${y2}" ${L} stroke-dasharray="3 2"/>`;
      } else if (p === 'T&T') {
        out += `<path d="M${x1} ${y1} L${x2} ${cy} L${x1} ${y2} M${x1} ${y2} L${cx} ${y1} L${x2} ${y2}" ${L} stroke-dasharray="3 2"/>`;
      } else if (p === 'FAN') {
        const r = Math.min(pw, ph) * 0.3;
        out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${ink}" stroke-width="1.3"/>`;
        for (let k = 0; k < 3; k++) {
          const an = (k * 120 + 20) * Math.PI / 180, bx = cx + Math.cos(an) * r * 0.85, by = cy + Math.sin(an) * r * 0.85;
          out += `<path d="M${cx} ${cy} Q${cx + Math.cos(an - .6) * r} ${cy + Math.sin(an - .6) * r} ${bx} ${by} Z" fill="${ink}" opacity=".75"/>`;
        }
        out += `<circle cx="${cx}" cy="${cy}" r="${r * 0.14}" fill="#D4AF37"/>`;
      } else if (p === 'LOUV' || p === 'VENT') {
        const n = p === 'LOUV' ? Math.max(4, Math.round(ph / 9)) : 0;
        for (let k = 1; k <= n; k++) { const y = top + (ph / (n + 1)) * k; out += `<path d="M${x1} ${y - 1.5} L${x2} ${y + 1.5}" ${L}/>`; }
        if (p === 'VENT') out += `<path d="M${x1} ${y1} L${cx} ${y2} L${x2} ${y1}" ${L} stroke-dasharray="3 2"/>`;
      }
      if (p === 'FIX' || !known) {
        const fs = Math.min(pw, ph) * (known ? 0.22 : 0.18);
        out += `<text x="${cx}" y="${cy + fs * 0.35}" text-anchor="middle" font-size="${fs}" font-family="Space Grotesk, sans-serif" font-weight="700" fill="${ink}" opacity=".55">${known ? 'F' : p.replace(/[<&>"]/g, '')}</text>`;
      }
      if (mesh && ['SL', 'OP', 'DOOR', 'T&T'].includes(p)) {
        out += `<rect x="${x + 3}" y="${top + 3}" width="${pw - 6}" height="${ph - 6}" fill="url(#${id}m)"/>`;
      }
      // a fine glare line on the glass
      out += `<path d="M${x + pw * 0.18} ${top + ph * 0.18} l${pw * 0.16} ${-ph * 0.08}" stroke="#fff" stroke-width="1.4" opacity=".7" stroke-linecap="round"/>`;
    });

    const cls = opt.cls ? ` class="${opt.cls}"` : '';
    return `<svg${cls} viewBox="-1 -1 ${W + 2} ${VH + 2}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${String(design).replace(/"/g, '')}">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF3FF"/><stop offset=".55" stop-color="#CFE2F7"/><stop offset="1" stop-color="#B9D3EE"/></linearGradient>
        <pattern id="${id}m" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0 L3 3 M3 0 L0 3" stroke="#131B4E" stroke-width=".35" opacity=".45"/></pattern>
      </defs>${out}</svg>`;
  }

  return { svg, parse };
})();
