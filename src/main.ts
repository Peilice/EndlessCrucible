import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { loadContent, loadStrings } from './content';
import { Game } from './core/game';
import { validate } from './core/validate';
import { App } from './ui/app';
import { Sfx } from './ui/audio';
import { setStrings } from './ui/i18n';
import { loadSave, writeSave } from './ui/storage';

const { content, issues } = loadContent();
if (import.meta.env.DEV) {
  for (const i of [...issues, ...validate(content)]) console[i.level === 'error' ? 'error' : 'warn'](`[${i.rule}] ${i.message}`);
}
setStrings(loadStrings());

const game = new Game(content, loadSave(content));
const sfx = new Sfx();
sfx.muted = game.data.settings.muted;

// 存檔：狀態變動後稍等再寫入；離開頁面時立即寫入
let saveTimer: ReturnType<typeof setTimeout> | undefined;
game.onChange(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeSave(game.data), 300);
});

// 遊玩時間：只計算頁面可見的時間
let last = performance.now();
const tickPlaytime = () => {
  const now = performance.now();
  if (document.visibilityState === 'visible') game.addPlayTime(now - last);
  last = now;
};
setInterval(tickPlaytime, 10_000);
document.addEventListener('visibilitychange', () => {
  tickPlaytime();
  if (document.visibilityState === 'hidden') writeSave(game.data);
});

new App(document.getElementById('app')!, game, sfx).mount();

registerSW({ immediate: true });
