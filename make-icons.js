#!/usr/bin/env node
/* Icons for Campfire. The PNG writer is duplicated in each property rather
   than shared, because these are separate deployments and none of them should
   be able to break another. Run: node make-icons.js */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const OUT = path.resolve(__dirname, 'icons');
fs.mkdirSync(OUT, { recursive: true });

const T = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){ let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t; })();
const crc = b => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const ch = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const b = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(b));
  return Buffer.concat([l, b, c]); };
function png(file, w, h, px){
  const raw = Buffer.alloc((w * 3 + 1) * h); let o = 0;
  for (let y = 0; y < h; y++){ raw[o++] = 0;
    for (let x = 0; x < w; x++){ const p = px[y][x]; raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw, { level: 9 })), ch('IEND', Buffer.alloc(0))]));
}
const mk = (size, bg) => { const px = [];
  for (let y = 0; y < size; y++){ px[y] = [];
    for (let x = 0; x < size; x++) px[y][x] = bg.slice(); } return px; };
const box = (px, x0, y0, x1, y1, col) => { const s = px.length;
  for (let y = Math.max(0, y0|0); y < Math.min(s, y1|0); y++)
    for (let x = Math.max(0, x0|0); x < Math.min(s, x1|0); x++) px[y][x] = col.slice(); };
const disc = (px, cx, cy, r, col) => { const s = px.length;
  for (let y = Math.max(0,(cy-r-1)|0); y < Math.min(s,(cy+r+2)|0); y++)
    for (let x = Math.max(0,(cx-r-1)|0); x < Math.min(s,(cx+r+2)|0); x++){
      const d = Math.hypot(x+.5-cx, y+.5-cy);
      if (d <= r) px[y][x] = col.slice();
      else if (d <= r+1){ const a = r+1-d, q = px[y][x];
        px[y][x] = [0,1,2].map(i => Math.round(q[i]*(1-a)+col[i]*a)); } } };
const rounded = (px, pad, radius, col) => { const s = px.length;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++){
    const fx = x+.5, fy = y+.5;
    if (fx < pad || fy < pad || fx > s-pad || fy > s-pad) continue;
    const a = pad+radius, b = s-pad-radius;
    const qx = Math.min(Math.max(fx,a),b), qy = Math.min(Math.max(fy,a),b);
    if ((fx-qx)**2 + (fy-qy)**2 <= radius*radius) px[y][x] = col.slice(); } };

const NIGHT = [0x22,0x45,0x2F], FOREST = [0x2D,0x5A,0x3D];
const GOLD = [0xC9,0x92,0x2A], TERRA = [0xC4,0x52,0x2A], MIST = [0xC8,0xDD,0xD0];
/* a fire, and two logs under it */
function icon(size, maskable){
  const px = mk(size, NIGHT);
  if (!maskable) rounded(px, size*.06, size*.22, FOREST);
  const cx = size/2, base = size*.66;
  /* the flame as stacked discs, widest at the bottom */
  disc(px, cx, base - size*.06, size*.175, TERRA);
  disc(px, cx, base - size*.17, size*.125, TERRA);
  disc(px, cx, base - size*.26, size*.075, TERRA);
  disc(px, cx, base - size*.05, size*.105, GOLD);
  disc(px, cx, base - size*.14, size*.062, GOLD);
  /* two logs, crossed */
  const log = (x0, y0, x1, y1, w) => {
    const n = Math.hypot(x1-x0, y1-y0), ux = (x1-x0)/n, uy = (y1-y0)/n;
    for (let t = 0; t <= n; t++) disc(px, x0+ux*t, y0+uy*t, w, MIST);
  };
  log(cx - size*.26, base + size*.13, cx + size*.26, base + size*.05, size*.035);
  log(cx - size*.26, base + size*.05, cx + size*.26, base + size*.13, size*.035);
  return px;
}

for (const [s, n] of [[192,'icon-192.png'],[512,'icon-512.png'],[180,'apple-touch-icon.png']])
  png(path.join(OUT, n), s, s, icon(s, false));
png(path.join(OUT, 'icon-maskable-512.png'), 512, 512, icon(512, true));
console.log('  icons/ written: ' + fs.readdirSync(OUT).sort().join(', '));
