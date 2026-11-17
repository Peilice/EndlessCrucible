/**
 * 產生 PWA 圖示（public/icon-192.png、icon-512.png）。
 * 以純 JS 光柵化 + zlib 編碼 PNG，不需額外套件。用法：node scripts/gen-icons.mjs
 * 圖形與 public/icon.svg 相同：深色底、金色坩堝、上方火焰。
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [20, 16, 12];
const GOLD = [224, 173, 79];
const RIM = [246, 207, 122];
const FLAME = [228, 100, 44];
const CORE = [246, 207, 122];

function shade(x, y) {
  // 背景帶一點暖光
  const d = Math.hypot(x - 0.5, y - 0.42);
  const glow = Math.max(0, 1 - d / 0.45) * 0.35;
  let c = BG.map((v, i) => v + ([110, 50, 15][i] - v) * glow);

  // 坩堝本體：下半橢圓
  const bx = (x - 0.5) / 0.3;
  const by = (y - 0.56) / 0.26;
  if (y >= 0.56 && bx * bx + by * by <= 1) c = GOLD;
  // 碗口
  if (y >= 0.52 && y <= 0.585 && x >= 0.16 && x <= 0.84) c = RIM;

  // 火焰：圓 + 往上收尖
  const flame = (cx, cy, r, tip) => {
    if (Math.hypot(x - cx, y - cy) <= r) return true;
    if (y < cy && y >= tip) {
      const w = r * ((y - tip) / (cy - tip)) ** 0.8;
      return Math.abs(x - cx) <= w;
    }
    return false;
  };
  if (flame(0.5, 0.4, 0.1, 0.14)) c = FLAME;
  if (flame(0.5, 0.43, 0.05, 0.27)) c = CORE;
  return c;
}

function render(size) {
  const ss = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          for (let i = 0; i < 3; i++) acc[i] += c[i];
        }
      for (let i = 0; i < 3; i++) row[1 + px * 3 + i] = Math.round(acc[i] / (ss * ss));
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), render(size));
  console.log(`public/icon-${size}.png`);
}
