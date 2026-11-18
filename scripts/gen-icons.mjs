/**
 * 從 public/icon.svg 產生 PWA 與主畫面圖示。用法：node scripts/gen-icons.mjs
 *
 * - icon-v2-192.png / icon-v2-512.png：一般圖示
 * - apple-touch-icon-v2.png：iOS 主畫面 180×180（不透明、不加圓角，系統自己裁）
 * - icon-v2-maskable-512.png：Android 自適應圖示，內容縮進 80% 安全區
 *
 * 檔名帶版本號，換圖時遞增，讓已安裝的瀏覽器和 Service Worker 確實抓新檔。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const pub = (name) => new URL(`../public/${name}`, import.meta.url);
const svg = readFileSync(pub('icon.svg'), 'utf8');

/** maskable：背景照樣鋪滿，只把法陣與坩堝（#art）縮到中央 80%，Android 最嚴格的圓形遮罩剛好切在這圈。 */
function maskable(src) {
  const out = src.replace('<g id="art">', '<g id="art" transform="translate(10 10) scale(.8)">');
  if (out === src) throw new Error('icon.svg 找不到 <g id="art">，無法產生 maskable 圖示');
  return out;
}

function render(source, size, file) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size }, background: '#0e0906' })
    .render()
    .asPng();
  writeFileSync(pub(file), png);
  console.log(`public/${file}`);
}

render(svg, 192, 'icon-v2-192.png');
render(svg, 512, 'icon-v2-512.png');
render(svg, 180, 'apple-touch-icon-v2.png');
render(maskable(svg), 512, 'icon-v2-maskable-512.png');
