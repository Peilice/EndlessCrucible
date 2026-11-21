import { recipeKey } from '../core/content';
import { Game, type CraftResult, type HintView } from '../core/game';
import { SaveError, decodeSaveCode, encodeSaveCode } from '../core/save';
import type { ElementDef, ElementId } from '../core/types';
import { Sfx } from './audio';
import { t } from './i18n';

type SortMode = 'order' | 'name';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 觸控時輕震一下；iOS Safari 不支援 vibrate，會自動略過。 */
const buzz = (pattern: number | number[]) => navigator.vibrate?.(pattern);

/** 介面偏好（不屬於遊戲進度，不放進存檔碼）。 */
const HIDE_EXHAUSTED_KEY = 'endless-crucible:hide-exhausted';
const AMBIENT_KEY = 'endless-crucible:ambient';
function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function saveFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* 無法儲存時，只是下次開啟不會記得這個選擇 */
  }
}

function $(root: ParentNode, sel: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`找不到 ${sel}`);
  return el;
}

/** 介面圖示：同一套 24px 線條圖示，取代以 emoji 充當的圖示。 */
const ICONS = {
  hint: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.7 10.7c.7.6 1.2 1.4 1.2 2.3h5c0-.9.5-1.7 1.2-2.3A6 6 0 0 0 12 3z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a3 3 0 0 0 3 4.5M16 6h2.5a3 3 0 0 1-3 4.5"/><path d="M12 13v3.5M9 20.5h6M10 16.5h4v4h-4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  soundOn: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  lock: '<rect x="5.5" y="11" width="13" height="9.5" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  retry: '<path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  book: '<path d="M4 5.5C6.5 4 9.5 4 12 6c2.5-2 5.5-2 8-.5v13c-2.5-1.5-5.5-1.5-8 .5-2.5-2-5.5-2-8-.5z"/><path d="M12 6v13"/>',
} as const;

function icon(name: keyof typeof ICONS, cls = 'icon'): string {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

/** 鍊成台背後的煉金法陣：外環刻度、三角與方陣，四方標上古典四元素符號。 */
const SIGIL = `<svg class="sigil" viewBox="-14 -14 228 228" aria-hidden="true" focusable="false">
  <g class="spin">
  <circle cx="100" cy="100" r="97" />
  <circle cx="100" cy="100" r="92" class="ticks" />
  <circle cx="100" cy="100" r="86" />
  <circle cx="100" cy="100" r="60" class="faint" />
  <path d="M100 14L174.5 143H25.5z" />
  <path d="M57.6 57.6h84.8v84.8H57.6z" class="faint" />
  <path d="M100 100m-30 0a30 30 0 1 0 60 0a30 30 0 1 0-60 0" class="faint" />
  <g class="glyphs">
    <path d="M100 -9l6 10h-12z" />
    <path d="M100 209l6-10h-12z" />
    <path d="M-9 105l6-10l6 10zM-10.5 101h15" />
    <path d="M203 95l6 10l6-10zM201.5 99h15" />
  </g>
  </g>
</svg>`;

/**
 * 坩堝：手工鍛打的老鐵鍋——鍛痕與煙燻、厚捲邊鍋口被熔液照亮、兩道鉚釘鐵箍、
 * 一圈刻上去的煉金符號、兩側掛環；鍋腳踩在石砌火塘上，底下是交疊柴薪的火。
 */
const RUNES = `<g transform="translate(98 150.2)"><circle r="6.5"/><circle r="1.2"/></g><g transform="translate(135.4 154.3)"><circle cy="-1" r="4.5"/><path d="M-4.5-9a4.5 4 0 0 0 9 0M0 3.5v6M-3 7h6"/></g><g transform="translate(172.8 156.5)"><path d="M0-9l6.5 10h-13zM0 1v8M-3.5 5.5h7"/></g><g transform="translate(227.2 156.5)"><circle r="6.5"/><path d="M-6.5 0h13"/></g><g transform="translate(264.6 154.3)"><path d="M2-7a7 7 0 1 0 0 14a5.5 5.5 0 1 1 0-14z"/></g><g transform="translate(302 150.2)"><path d="M0-8l7 12h-14zM-5.5 0h11"/></g><g transform="translate(200 161)"><circle r="15"/><circle r="11" stroke-dasharray="2 2.6"/><path d="M0-8l7 12h-14z"/><circle cy="1" r="2.4"/></g>`;
const POT_BODY = 'M74 60C58 84 40 112 44 152c4 50 68 82 156 82s152-32 156-82c4-40-14-68-30-92z';
const CRUCIBLE = `<svg class="pot" viewBox="0 0 400 270" focusable="false">
  <defs>
    <clipPath id="cr-body"><path d="${POT_BODY}"/></clipPath>
    <linearGradient id="cr-iron" x1="0" x2="1">
      <stop offset="0" stop-color="#0d0906"/><stop offset=".22" stop-color="#2f241b"/>
      <stop offset=".38" stop-color="#40301f"/><stop offset=".62" stop-color="#241a10"/><stop offset="1" stop-color="#080503"/>
    </linearGradient>
    <linearGradient id="cr-soot" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/>
    </linearGradient>
    <linearGradient id="cr-lip" x1="0" x2="1">
      <stop offset="0" stop-color="#140d08"/><stop offset=".3" stop-color="#4a3826"/>
      <stop offset=".5" stop-color="#5b4430"/><stop offset=".75" stop-color="#2c2016"/><stop offset="1" stop-color="#0d0805"/>
    </linearGradient>
    <radialGradient id="cr-melt" cx=".5" cy=".35" r=".7">
      <stop offset="0" stop-color="#ffe7a8"/><stop offset=".35" stop-color="#f3a442"/>
      <stop offset=".75" stop-color="#c2501f"/><stop offset="1" stop-color="#4a1808"/>
    </radialGradient>
    <radialGradient id="cr-fire" cx=".5" cy="1" r=".95">
      <stop offset="0" stop-color="#ffe09a"/><stop offset=".38" stop-color="#ff8a33"/>
      <stop offset="1" stop-color="#e4642c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cr-under" cx=".5" cy="1" r=".6">
      <stop offset="0" stop-color="#ff8a33" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a33" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cr-wood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a3020"/><stop offset="1" stop-color="#1a0f08"/>
    </linearGradient>
    <linearGradient id="cr-stone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4b4036"/><stop offset="1" stop-color="#1b1612"/>
    </linearGradient>
    <filter id="cr-hammer" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".055 .09" numOctaves="3" seed="7"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.25"/>
    </filter>
    <filter id="cr-pit" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/>
      <feColorMatrix values="0 0 0 0 .55  0 0 0 0 .42  0 0 0 0 .3  0 0 0 -3 1.55"/>
    </filter>
    <filter id="cr-wobble"><feTurbulence baseFrequency=".035" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>
  </defs>

  <ellipse class="heat" cx="200" cy="252" rx="170" ry="24" fill="url(#cr-fire)"/>
  <g stroke="#120a05" stroke-width="1.5">
    <path d="M96 252l124-30c6-1.5 9 9 3 11L101 264c-7 2-11-10-5-12z" fill="url(#cr-wood)"/>
    <path d="M304 252l-124-30c-6-1.5-9 9-3 11l122 31c7 2 11-10 5-12z" fill="url(#cr-wood)"/>
    <ellipse cx="98" cy="258" rx="5.5" ry="6.5" fill="#6b4a2c"/><ellipse cx="302" cy="258" rx="5.5" ry="6.5" fill="#6b4a2c"/>
  </g>
  <g class="flames" fill="url(#cr-fire)">
    <path d="M160 266c-14-12-12-30 0-42 0 11 7 15 9 24 3-11 10-17 9-30 12 13 16 34 4 48z"/>
    <path d="M214 266c-12-14-9-30 3-42-1 12 6 15 8 23 3-9 7-13 7-22 12 14 14 31 2 41z"/>
    <path d="M150 256c-10-10-9-22-1-31-1 9 5 11 6 18 2-9 7-14 6-24 8 9 13 24 6 37z"/>
    <path d="M176 258c-13-14-11-32 0-45 0 10 6 14 8 22 3-14 11-20 10-34 13 16 18 40 6 57z"/>
    <path d="M210 258c-10-12-8-27 3-37-1 11 5 13 7 20 2-8 6-11 6-19 10 12 12 27 2 36z"/>
    <path d="M238 256c-7-9-6-19 1-26 0 7 4 9 5 14 2-6 5-9 5-15 7 9 9 20 1 27z"/>
  </g>

  <g fill="#0f0a06" stroke="#3a2c1f" stroke-width="1.5" stroke-linejoin="round">
    <path d="M118 214c-2 14-8 26-18 34 6 3 18 3 24 0 2-10 6-20 12-28z"/>
    <path d="M282 214c2 14 8 26 18 34-6 3-18 3-24 0-2-10-6-20-12-28z"/>
    <path d="M192 230c0 10-2 18-6 24h28c-4-6-6-14-6-24z"/>
  </g>

  <g filter="url(#cr-wobble)">
    <path d="${POT_BODY}" fill="url(#cr-iron)" stroke="#2a1f15" stroke-width="2"/>
    <g clip-path="url(#cr-body)">
      <rect x="30" y="50" width="340" height="190" filter="url(#cr-hammer)" opacity=".7"/>
      <rect x="30" y="50" width="340" height="190" filter="url(#cr-pit)" opacity=".12"/>
      <path d="M86 70c-26 40-24 96 6 130" fill="none" stroke="#a07a52" stroke-opacity=".14" stroke-width="16" stroke-linecap="round"/>
      <rect x="30" y="50" width="340" height="190" fill="url(#cr-soot)"/>
      <ellipse class="under" cx="200" cy="246" rx="150" ry="70" fill="url(#cr-under)"/>
      <g fill="none" stroke-linecap="round">
        <path d="M30 78Q200 116 370 78" stroke="#0b0704" stroke-width="13"/>
        <path d="M30 72Q200 110 370 72" stroke="#5e4732" stroke-opacity=".5" stroke-width="1.5"/>
        <path d="M30 186Q200 236 370 186" stroke="#0b0704" stroke-width="11"/>
        <path d="M30 181Q200 231 370 181" stroke="#5e4732" stroke-opacity=".45" stroke-width="1.5"/>
      </g>
      <g fill="#3b2d20" stroke="#000" stroke-width=".8">
        <circle cx="84.4" cy="88.2" r="3.2"/><circle cx="121.8" cy="93" r="3.2"/><circle cx="159.2" cy="95.9" r="3.2"/><circle cx="200" cy="97" r="3.2"/><circle cx="240.8" cy="95.9" r="3.2"/><circle cx="278.2" cy="93" r="3.2"/><circle cx="315.6" cy="88.2" r="3.2"/>
        <circle cx="111.6" cy="204.2" r="3"/><circle cx="142.2" cy="208.1" r="3"/><circle cx="172.8" cy="210.4" r="3"/><circle cx="200" cy="211" r="3"/><circle cx="227.2" cy="210.4" r="3"/><circle cx="257.8" cy="208.1" r="3"/><circle cx="288.4" cy="204.2" r="3"/>
      </g>
      <g fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <g stroke="#000" stroke-opacity=".7" transform="translate(0 1.2)">${RUNES}</g>
        <g class="emblem" stroke="#b8894a">${RUNES}</g>
      </g>
    </g>
    <path d="M60 78c-6 4-8 10-6 16l12-4zM340 78c6 4 8 10 6 16l-12-4z" fill="#140d08" stroke="#3a2c1f"/>
    <ellipse cx="200" cy="52" rx="152" ry="29" fill="url(#cr-lip)" stroke="#0b0704" stroke-width="2"/>
    <ellipse class="lip-glow" cx="200" cy="50" rx="143" ry="23" fill="none" stroke="#e08a3c" stroke-width="3"/>
    <ellipse cx="200" cy="50" rx="134" ry="19" fill="#070402"/>
    <ellipse class="melt" cx="200" cy="54" rx="128" ry="14.5" fill="url(#cr-melt)"/>
    <path d="M246 70c-1 6 1 12 4 14 2-3 1-9-1-14zM118 66c0 5 1 9 3 10 1-2 1-6-.5-10z" fill="#3d1a0b" opacity=".75"/>
  </g>

  <g fill="none" stroke="#0b0704" stroke-width="7">
    <circle cx="44" cy="106" r="17"/><circle cx="356" cy="106" r="17"/>
  </g>
  <g fill="none" stroke="#5e4732" stroke-width="1.5" stroke-opacity=".6">
    <path d="M31 96a17 17 0 0 0 4 24"/><path d="M369 96a17 17 0 0 1-4 24"/>
  </g>

  <g fill="url(#cr-stone)" stroke="#0e0b08" stroke-width="1.5" stroke-linejoin="round">
    <path d="M72 254c4-8 22-10 36-7 8 2 10 10 8 17l-46 3c-3-4-2-9 2-13z"/>
    <path d="M114 256c6-6 24-7 36-4 6 3 6 9 4 15h-42c-3-4-2-8 2-11z"/>
    <path d="M246 254c8-5 26-6 38-2 6 3 6 10 3 15h-42c-3-5-3-9 1-13z"/>
    <path d="M286 252c10-6 30-6 40 0 5 4 5 10 2 15l-44 1c-3-5-2-12 2-16z"/>
  </g>
</svg>`;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 原生 <dialog>：closedby="any" 提供點外面關閉；不支援的瀏覽器以座標判斷補上。 */
function setupDialog(dialog: HTMLDialogElement) {
  dialog.setAttribute('closedby', 'any');
  if ('closedBy' in HTMLDialogElement.prototype) return;
  const outside = (e: PointerEvent) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (e) => (pressedOutside = outside(e)));
  dialog.addEventListener('pointerup', (e) => {
    if (pressedOutside && outside(e)) dialog.close();
  });
}

export class App {
  private slots: (ElementId | null)[];
  /** 剛鍊成失敗、還留在框裡的組合；結果訊息已經說了沒反應，就不再重複顯示「已試過」。 */
  private justFailed: string | null = null;
  private category = 'all';
  private query = '';
  private sort: SortMode = 'order';
  private hideExhausted = loadFlag(HIDE_EXHAUSTED_KEY);
  private ambient = loadFlag(AMBIENT_KEY);
  /** 還在飛往元素框途中的格子；重繪時先把內容藏起來，等元素落下才顯示。 */
  private incoming = new Set<number>();
  private lastPointer = '';
  private busy = false;
  private suppressClick = false;
  private renderQueued = false;

  private el!: {
    progressText: HTMLButtonElement;
    libCount: HTMLElement;
    hideEx: HTMLButtonElement;
    hintCount: HTMLElement;
    crucible: HTMLElement;
    slots: HTMLElement;
    result: HTMLElement;
    craft: HTMLButtonElement;
    clear: HTMLButtonElement;
    tried: HTMLElement;
    help: HTMLElement;
    hintBanner: HTMLElement;
    search: HTMLInputElement;
    sort: HTMLButtonElement;
    tabs: HTMLElement;
    grid: HTMLElement;
    live: HTMLElement;
    dlgDiscover: HTMLDialogElement;
    dlgHint: HTMLDialogElement;
    dlgAch: HTMLDialogElement;
    dlgSettings: HTMLDialogElement;
    dlgCodex: HTMLDialogElement;
    dlgBook: HTMLDialogElement;
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly game: Game,
    private readonly sfx: Sfx,
  ) {
    this.slots = Array.from({ length: game.content.config.slots }, () => null);
  }

  mount() {
    this.root.innerHTML = this.template();
    const r = this.root;
    this.el = {
      progressText: $(r, '#progress-text') as HTMLButtonElement,
      libCount: $(r, '#lib-count'),
      hideEx: $(r, '#btn-hide-ex') as HTMLButtonElement,
      hintCount: $(r, '#hint-count'),
      crucible: $(r, '#crucible'),
      slots: $(r, '#slots'),
      result: $(r, '#result'),
      craft: $(r, '#btn-craft') as HTMLButtonElement,
      clear: $(r, '#btn-clear') as HTMLButtonElement,
      tried: $(r, '#tried'),
      help: $(r, '#help'),
      hintBanner: $(r, '#hint-banner'),
      search: $(r, '#search') as HTMLInputElement,
      sort: $(r, '#btn-sort') as HTMLButtonElement,
      tabs: $(r, '#tabs'),
      grid: $(r, '#grid'),
      live: $(document, '#live'),
      dlgDiscover: $(r, '#dlg-discover') as HTMLDialogElement,
      dlgHint: $(r, '#dlg-hint') as HTMLDialogElement,
      dlgAch: $(r, '#dlg-ach') as HTMLDialogElement,
      dlgSettings: $(r, '#dlg-settings') as HTMLDialogElement,
      dlgCodex: $(r, '#dlg-codex') as HTMLDialogElement,
      dlgBook: $(r, '#dlg-book') as HTMLDialogElement,
    };
    for (const d of [this.el.dlgDiscover, this.el.dlgHint, this.el.dlgAch, this.el.dlgSettings, this.el.dlgCodex, this.el.dlgBook]) setupDialog(d);

    // 工房環境聲：瀏覽器要等第一次互動才肯發聲；切到背景時暫停
    this.sfx.setAmbient(this.ambient);
    window.addEventListener('pointerdown', () => this.sfx.resume(), { once: true });
    document.addEventListener('visibilitychange', () =>
      document.visibilityState === 'hidden' ? this.sfx.suspend() : this.sfx.resume(),
    );

    this.bind();
    this.renderTabs();
    this.renderAll();
    this.game.onChange(() => this.queueRender());
  }

  // ───────────────────────── 範本 ─────────────────────────

  private template(): string {
    return `
<div class="app">
  <header class="topbar">
    <div class="brand">
      <h1>${t('app.title')}</h1>
      <span class="subtitle" lang="en">${t('app.subtitle')}</span>
    </div>
    <div class="tally">
      <button type="button" class="count count-btn" id="progress-text"></button>
      <nav class="actions" aria-label="${t('header.settings')}">
        <button type="button" id="btn-hint" class="icon-btn">
          ${icon('hint')}<span class="visually-hidden">${t('header.hint')}</span>
          <span class="badge" id="hint-count"></span>
        </button>
        <button type="button" id="btn-ach" class="icon-btn">
          ${icon('trophy')}<span class="visually-hidden">${t('header.achievements')}</span>
        </button>
        <button type="button" id="btn-settings" class="icon-btn">
          ${icon('gear')}<span class="visually-hidden">${t('header.settings')}</span>
        </button>
      </nav>
    </div>
  </header>

  <main class="layout">
    <section class="bench" aria-labelledby="bench-title">
      <h2 id="bench-title" class="visually-hidden">${t('crucible.title')}</h2>
      <div class="crucible" id="crucible" data-fill="0">
        ${SIGIL}
        <div class="slots" id="slots"></div>
        <div class="pot-wrap" aria-hidden="true">
          ${CRUCIBLE}
          <div class="bubbles"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="smoke"></div>
          <div class="ripple"></div>
        </div>
        <div class="result" id="result"></div>
      </div>
      <div class="bench-actions">
        <button type="button" id="btn-clear" class="ghost-btn">${t('crucible.clear')}</button>
        <button type="button" id="btn-craft" class="primary-btn">${t('crucible.craft')}</button>
      </div>
      <p class="tried" id="tried" hidden></p>
      <p class="help" id="help">${t('crucible.help')}</p>
      <button type="button" class="hint-banner" id="hint-banner" hidden></button>
    </section>

    <section class="library" aria-labelledby="lib-title">
      <div class="lib-head">
        <h2 id="lib-title">${t('list.title')}</h2>
        <span class="lib-count" id="lib-count"></span>
        <button type="button" id="btn-hide-ex" class="toggle-chip"></button>
      </div>
      <div class="lib-tools">
        <input type="search" id="search" placeholder="${t('list.search')}" aria-label="${t('list.search')}" autocomplete="off" />
        <button type="button" id="btn-sort" class="ghost-btn small"></button>
      </div>
      <div class="tabs" id="tabs"></div>
      <div class="grid" id="grid"></div>
    </section>
  </main>

  <dialog id="dlg-discover" class="dlg discover" aria-labelledby="discover-title"></dialog>
  <dialog id="dlg-hint" class="dlg" aria-labelledby="hint-title"></dialog>
  <dialog id="dlg-ach" class="dlg" aria-labelledby="ach-title"></dialog>
  <dialog id="dlg-settings" class="dlg" aria-labelledby="settings-title"></dialog>
  <dialog id="dlg-codex" class="dlg codex" aria-labelledby="codex-title"></dialog>
  <dialog id="dlg-book" class="dlg book" aria-labelledby="book-title"></dialog>
</div>`;
  }

  // ───────────────────────── 事件 ─────────────────────────

  private bind() {
    const { el } = this;
    el.craft.addEventListener('click', () => void this.craft());
    el.clear.addEventListener('click', () => {
      this.slots.fill(null);
      this.clearResult();
      this.renderBench();
    });
    el.slots.addEventListener('click', (e) => {
      const slot = (e.target as Element).closest<HTMLElement>('.slot');
      if (!slot) return;
      const i = Number(slot.dataset.index);
      if (this.slots[i]) {
        this.slots[i] = null;
        this.sfx.tick();
        this.clearResult();
        this.renderBench();
      }
    });

    el.grid.addEventListener('pointerdown', (e) => (this.lastPointer = e.pointerType));
    el.grid.addEventListener('click', (e) => {
      if (this.suppressClick) return;
      const btn = (e.target as Element).closest<HTMLElement>('.el');
      if (btn?.dataset.id) this.addToSlot(btn.dataset.id, undefined, btn);
    });
    el.grid.addEventListener('contextmenu', (e) => {
      const btn = (e.target as Element).closest<HTMLElement>('.el');
      if (!btn?.dataset.id) return;
      e.preventDefault();
      // 觸控的長按由 bindLongPress 處理；這裡負責滑鼠右鍵與鍵盤的選單鍵
      if (this.lastPointer !== 'touch') this.openCodex(btn.dataset.id);
    });
    el.result.addEventListener('click', (e) => {
      const btn = (e.target as Element).closest<HTMLElement>('[data-codex]');
      if (btn?.dataset.codex) this.openCodex(btn.dataset.codex);
    });
    el.hideEx.addEventListener('click', () => {
      this.hideExhausted = !this.hideExhausted;
      saveFlag(HIDE_EXHAUSTED_KEY, this.hideExhausted);
      this.renderLibrary();
    });
    this.bindDrag();
    this.bindLongPress();

    el.search.addEventListener('input', () => {
      this.query = el.search.value.trim();
      this.renderLibrary();
    });
    el.sort.addEventListener('click', () => {
      this.sort = this.sort === 'order' ? 'name' : 'order';
      this.renderLibrary();
    });
    el.tabs.addEventListener('click', (e) => {
      const tab = (e.target as Element).closest<HTMLElement>('[data-cat]');
      if (!tab) return;
      this.category = tab.dataset.cat!;
      this.renderTabs();
      this.renderLibrary();
    });

    $(this.root, '#btn-hint').addEventListener('click', () => this.openHint());
    el.hintBanner.addEventListener('click', () => this.openHint());
    $(this.root, '#btn-ach').addEventListener('click', () => this.openAchievements());
    el.progressText.addEventListener('click', () => this.openBook());
    $(this.root, '#btn-settings').addEventListener('click', () => this.openSettings());
  }

  /** 觸控長按元素架裡的元素，放開時翻開典籍；手指移動（捲動清單）就取消。 */
  private bindLongPress() {
    this.el.grid.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      const btn = (e.target as Element).closest<HTMLElement>('.el');
      const id = btn?.dataset.id;
      if (!btn || !id) return;
      const sx = e.clientX;
      const sy = e.clientY;
      let armed = false;
      const timer = setTimeout(() => {
        armed = true;
        btn.classList.add('pressing');
        buzz(10);
      }, 450);
      const cleanup = () => {
        clearTimeout(timer);
        btn.classList.remove('pressing');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cleanup);
      };
      const move = (ev: PointerEvent) => {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) cleanup();
      };
      const up = () => {
        cleanup();
        if (!armed) return;
        // 放開後瀏覽器還會送出 click，擋掉以免同時放進元素框
        this.suppressClick = true;
        setTimeout(() => (this.suppressClick = false), 0);
        this.openCodex(id);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cleanup);
    });
  }

  /** 桌機（滑鼠／觸控筆）可以把元素拖到指定框；觸控以點選為主，不干擾清單捲動。 */
  private bindDrag() {
    this.el.grid.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      const btn = (e.target as Element).closest<HTMLElement>('.el');
      const id = btn?.dataset.id;
      if (!id) return;
      const def = this.game.content.elements.get(id)!;
      const sx = e.clientX;
      const sy = e.clientY;
      let ghost: HTMLElement | null = null;
      let over: HTMLElement | null = null;

      const targetAt = (x: number, y: number) =>
        document.elementFromPoint(x, y)?.closest<HTMLElement>('.slot, .crucible') ?? null;

      const move = (ev: PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          ghost = document.createElement('div');
          ghost.className = 'drag-ghost';
          ghost.innerHTML = `<span class="emoji">${def.emoji}</span><span>${esc(def.name)}</span>`;
          document.body.append(ghost);
          document.body.classList.add('is-dragging');
          this.suppressClick = true;
        }
        ghost.style.translate = `${ev.clientX}px ${ev.clientY}px`;
        const target = targetAt(ev.clientX, ev.clientY);
        if (target !== over) {
          over?.classList.remove('drop-over');
          target?.classList.add('drop-over');
          over = target;
        }
      };
      const end = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        over?.classList.remove('drop-over');
        document.body.classList.remove('is-dragging');
        if (ghost) {
          ghost.remove();
          if (ev.type === 'pointerup') {
            const target = targetAt(ev.clientX, ev.clientY);
            if (target?.classList.contains('slot')) this.addToSlot(id, Number(target.dataset.index));
            else if (target) this.addToSlot(id);
          }
        }
        setTimeout(() => (this.suppressClick = false), 0);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
  }

  // ───────────────────────── 動作 ─────────────────────────

  /** from：從元素架點選時傳入被點的按鈕，用來播放飛入元素框的動畫。 */
  private addToSlot(id: ElementId, index?: number, from?: HTMLElement) {
    if (this.busy) return;
    const touch = !!from && this.lastPointer === 'touch';
    const i = index ?? this.slots.findIndex((s) => s === null);
    if (i < 0) {
      if (touch) buzz(15);
      this.showResult(`<span class="muted">${t('crucible.full')}</span>`, 'warn');
      return;
    }
    this.slots[i] = id;
    this.sfx.tick();
    if (touch) buzz(12);
    this.clearResult();
    const fly = from ? this.prepareFly(from, id, i) : null;
    this.renderBench();
    fly?.();
  }

  /**
   * 讓被點的元素沿弧線飛進元素框，落下時元素框才亮起來。
   * 回傳的函式要在 renderBench 之後呼叫，那時才量得到元素框的位置。
   */
  private prepareFly(from: HTMLElement, id: ElementId, i: number): (() => void) | null {
    from.classList.remove('picked');
    void from.offsetWidth;
    from.classList.add('picked');
    if (reducedMotion()) return null;
    const src = (from.querySelector('.emoji') ?? from).getBoundingClientRect();
    this.incoming.add(i);
    return () => {
      const slot = this.el.slots.querySelector<HTMLElement>(`.slot[data-index="${i}"]`);
      if (!slot) {
        this.incoming.delete(i);
        return;
      }
      const dst = slot.getBoundingClientRect();
      const ax = src.left + src.width / 2;
      const ay = src.top + src.height / 2;
      const bx = dst.left + dst.width / 2;
      const by = dst.top + dst.height / 2;
      const ghost = document.createElement('span');
      ghost.className = 'fly';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = this.game.content.elements.get(id)!.emoji;
      document.body.append(ghost);
      const at = (x: number, y: number, k: number) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${k})`;
      const lift = Math.min(90, Math.abs(ay - by) * 0.25);
      const anim = ghost.animate(
        [
          { transform: at(ax, ay, 1) },
          { transform: at((ax + bx) / 2, Math.min(ay, by) - lift, 1.35), offset: 0.55 },
          { transform: at(bx, by, 1.5), opacity: 0.85 },
        ],
        { duration: 380, easing: 'cubic-bezier(.45,0,.25,1)' },
      );
      const land = () => {
        ghost.remove();
        if (!this.incoming.delete(i)) return;
        this.el.slots.querySelector(`.slot[data-index="${i}"]`)?.classList.remove('incoming');
      };
      anim.onfinish = land;
      anim.oncancel = land;
      // 分頁切到背景時動畫會暫停；保險起見，時間到就直接落下，元素框不會一直空著
      setTimeout(land, 900);
    };
  }

  /** 元素框內容一變動，就清掉上一次的鍊成結果，避免和新的組合混淆。 */
  private clearResult() {
    this.el.result.className = 'result';
    this.el.result.innerHTML = '';
  }

  private filled(): ElementId[] {
    return this.slots.filter((s): s is ElementId => s !== null);
  }

  private async craft() {
    const inputs = this.filled();
    if (this.busy || !this.game.canCraft(inputs)) return;
    this.busy = true;
    this.el.crucible.classList.add('brewing');
    this.el.result.innerHTML = '';
    if (!reducedMotion()) await sleep(1100);
    let result: CraftResult;
    try {
      result = await this.game.craft(inputs);
    } finally {
      this.el.crucible.classList.remove('brewing');
      this.busy = false;
    }
    this.onCraft(result);
  }

  private onCraft(r: CraftResult) {
    switch (r.kind) {
      case 'invalid':
        return;
      case 'fail': {
        this.sfx.fail();
        const msg = r.repeated ? t('crucible.failRepeat') : t('crucible.fail');
        this.justFailed = recipeKey(this.filled());
        this.showResult(`<span class="muted">${msg}</span>`, 'fail');
        this.announce(msg);
        break;
      }
      case 'known':
        this.sfx.success();
        this.slots.fill(null);
        this.showResult(this.resultChip(r.output), 'known');
        this.announce(t('crucible.known', { name: r.output.name }));
        break;
      case 'new':
        this.sfx.discover();
        this.slots.fill(null);
        // 一般的新發現直接在坩堝下方揭曉，不打斷手上的動作；達成成就（含關鍵元素、終局）才跳出卡片
        if (r.achievements.length > 0) {
          this.showResult(this.resultChip(r.output), 'new');
          this.openDiscover(r);
        } else {
          this.showResult(this.revealCard(r), 'reveal');
          this.announce(`${t('discover.new')}：${r.output.name}。${r.output.desc}`);
        }
        break;
    }
    this.renderBench();
  }

  private resultChip(e: ElementDef): string {
    return `<button type="button" class="result-btn" data-codex="${e.id}" aria-label="${esc(t('discover.open', { name: e.name }))}">
      <span class="emoji" aria-hidden="true">${e.emoji}</span><span class="name">${esc(e.name)}</span></button>`;
  }

  /** 新發現：元素從熔液浮上來，描述直接寫在坩堝下方；點一下可翻開典籍。 */
  private revealCard(r: Extract<CraftResult, { kind: 'new' }>): string {
    const e = r.output;
    const hints = r.hintsGained > 0 ? `<span class="reveal-gain">${icon('hint')}${t('discover.hints', { n: r.hintsGained })}</span>` : '';
    return `<button type="button" class="result-btn reveal" data-codex="${e.id}" aria-label="${esc(t('discover.open', { name: e.name }))}">
      <span class="reveal-top"><span class="emoji" aria-hidden="true">${e.emoji}</span><span class="name">${esc(e.name)}</span><span class="reveal-tag">${t('discover.new')}</span></span>
      <span class="reveal-desc">${esc(e.desc)}</span>${hints}</button>`;
  }

  private showResult(html: string, kind: 'new' | 'known' | 'reveal' | 'fail' | 'warn') {
    const res = this.el.result;
    res.className = 'result';
    res.innerHTML = html;
    void res.offsetWidth; // 重新觸發動畫
    res.classList.add(`is-${kind}`);
    // 失敗：熔液暗一下、冒一縷煙；新發現：鍋面泛起一圈漣漪
    const effect = kind === 'fail' ? 'dim' : kind === 'reveal' || kind === 'new' ? 'bloom' : '';
    if (effect) {
      this.el.crucible.classList.remove('dim', 'bloom');
      void this.el.crucible.offsetWidth;
      this.el.crucible.classList.add(effect);
    }
  }

  private announce(msg: string) {
    this.el.live.textContent = msg;
    setTimeout(() => {
      if (this.el.live.textContent === msg) this.el.live.textContent = '';
    }, 1500);
  }

  // ───────────────────────── 繪製 ─────────────────────────

  private queueRender() {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.renderAll();
    });
  }

  private renderAll() {
    this.renderHeader();
    this.renderBench();
    this.renderLibrary();
  }

  private renderHeader() {
    const n = this.game.discoveredCount;
    const total = this.game.totalCount;
    // 標題列只說典籍記了幾頁，不一直提醒「還差多少」；總數放在成就頁
    // 手機寬度放不下完整文字，只顯示圖示與數字；完整文字留給讀屏軟體
    this.el.progressText.innerHTML = `${icon('book')}<span class="count-full">${t('header.progress', { n: `<b>${n}</b>` })}</span><b class="count-short" aria-hidden="true">${n}</b>`;
    this.el.progressText.title = t('achievements.discovered', { n, total });
    this.el.libCount.textContent = t('list.count', { n });
    this.el.hintCount.textContent = String(this.game.data.hints.available);
  }

  private renderBench() {
    const { content } = this.game;
    this.el.slots.innerHTML = this.slots
      .map((id, i) => {
        const n = i + 1;
        const plus = i > 0 ? '<span class="plus" aria-hidden="true">+</span>' : '';
        if (!id) {
          return `${plus}<button type="button" class="slot empty" data-index="${i}" aria-label="${t('crucible.slot.label', { n })}"><span class="slot-n" aria-hidden="true">${ROMAN[i] ?? n}</span></button>`;
        }
        const e = content.elements.get(id)!;
        const inc = this.incoming.has(i) ? ' incoming' : '';
        return `${plus}<button type="button" class="slot filled${inc}" data-index="${i}" aria-label="${esc(t('crucible.slot.filled', { n, name: e.name }))}">
          <span class="emoji">${e.emoji}</span><span class="name">${esc(e.name)}</span></button>`;
      })
      .join('');

    const inputs = this.filled();
    const can = this.game.canCraft(inputs);
    this.el.crucible.dataset.fill = String(inputs.length);
    this.el.craft.disabled = !can || this.busy;
    this.el.clear.disabled = inputs.length === 0;
    // 放好的組合以前做過：失敗過就說「已試過」，成功過就直接說會得到什麼
    const key = recipeKey(inputs);
    if (key !== this.justFailed) this.justFailed = null; // 換了組合，之後再放回來就照常顯示
    const known = can ? this.game.knownOutput(inputs) : null;
    const failed = can && !known && key !== this.justFailed && this.game.wasFailed(inputs);
    this.el.tried.hidden = !known && !failed;
    this.el.tried.classList.toggle('is-known', !!known);
    if (known) {
      this.el.tried.innerHTML = `<span class="tried-el"><span aria-hidden="true">${known.emoji}</span>${esc(known.name)}</span>`;
    } else if (failed) {
      this.el.tried.innerHTML = `${icon('retry')}${t('crucible.tried')}`;
    }
    this.el.help.hidden = this.game.data.stats.attempts > 0;

    const hint = this.game.currentHint();
    this.el.hintBanner.hidden = !hint;
    if (hint) this.el.hintBanner.innerHTML = `${icon('hint')}<span>${esc(this.hintText(hint).join(' '))}</span>`;
  }

  private renderTabs() {
    const cats = [{ id: 'all', name: t('list.all'), emoji: '' }, ...this.game.content.categories];
    this.el.tabs.innerHTML = cats
      .map(
        (c) =>
          `<button type="button" class="tab" data-cat="${c.id}" aria-pressed="${c.id === this.category}">${c.emoji ? `<span aria-hidden="true">${c.emoji}</span> ` : ''}${esc(c.name)}</button>`,
      )
      .join('');
  }

  private renderLibrary() {
    this.el.sort.textContent = this.sort === 'order' ? t('list.sort.order') : t('list.sort.name');
    const q = this.query.toLowerCase();
    const hint = this.game.currentHint();
    const hinted = new Set(hint?.revealed.map((e) => e.id));

    let list = this.game.discoveredElements();
    if (this.category !== 'all') list = list.filter((e) => e.category === this.category);
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.id.includes(q));
    if (this.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant-TW'));

    // 已用盡的元素沉到最後（穩定排序，其餘順序不變）；提示中的元素一律留在前面
    const spent = (id: ElementId) => this.game.isExhausted(id) && !hinted.has(id);
    const spentCount = list.filter((e) => spent(e.id)).length;
    list = [...list].sort((a, b) => Number(spent(a.id)) - Number(spent(b.id)));
    if (this.hideExhausted) list = list.filter((e) => !spent(e.id));

    this.el.hideEx.setAttribute('aria-pressed', String(this.hideExhausted));
    this.el.hideEx.textContent = t('list.hideExhausted', { n: spentCount });
    this.el.hideEx.hidden = spentCount === 0 && !this.hideExhausted;

    if (list.length === 0) {
      const allSpent = this.hideExhausted && spentCount > 0;
      this.el.grid.innerHTML = `<p class="empty">${allSpent ? t('list.allExhausted') : t('list.empty')}</p>`;
      return;
    }
    this.el.grid.innerHTML = list
      .map((e) => {
        const ex = this.game.isExhausted(e.id);
        const cls = ['el', ex ? 'exhausted' : '', hinted.has(e.id) ? 'hinted' : ''].filter(Boolean).join(' ');
        const label = t('list.add', { name: e.name }) + (ex ? `（${t('list.exhausted')}）` : '');
        return `<button type="button" class="${cls}" data-id="${e.id}" aria-label="${esc(label)}" title="${esc(e.desc)}">
          <span class="emoji" aria-hidden="true">${e.emoji}</span><span class="name">${esc(e.name)}</span>${ex ? icon('check', 'check') : ''}</button>`;
      })
      .join('');
  }

  // ───────────────────────── 對話框 ─────────────────────────

  private openDiscover(r: Extract<CraftResult, { kind: 'new' }>) {
    const e = r.output;
    const cat = this.game.content.categories.find((c) => c.id === e.category);
    const rewards = [
      ...r.achievements.map((a) => `<li><span aria-hidden="true">${a.emoji}</span>${esc(t('discover.achievement', { name: a.name }))}</li>`),
      r.hintsGained > 0 ? `<li>${icon('hint')}${t('discover.hints', { n: r.hintsGained })}</li>` : '',
    ].join('');
    const d = this.el.dlgDiscover;
    d.innerHTML = `
      <div class="burst" aria-hidden="true"></div>
      <p class="seal" id="discover-title"><span>${t('discover.title')}</span></p>
      <div class="big-emoji" aria-hidden="true">${e.emoji}</div>
      <h2 class="el-name">${esc(e.name)}</h2>
      ${cat ? `<p class="cat"><span aria-hidden="true">${cat.emoji}</span> ${esc(cat.name)}</p>` : ''}
      <p class="desc">${esc(e.desc)}</p>
      ${rewards ? `<ul class="rewards">${rewards}</ul>` : ''}
      <form method="dialog"><button class="primary-btn" autofocus>${t('discover.ok')}</button></form>`;
    d.showModal();
  }

  private hintText(h: HintView): string[] {
    const names = h.revealed.map((e) => e.name);
    const n = h.recipe.inputs.length;
    const lines: string[] = [];
    if (h.revealed.length === 1) lines.push(t('hint.level1', { a: names[0]! }));
    else if (h.revealed.length < n) lines.push(t('hint.levelInputs', { list: names.join(' + ') }));
    else lines.push(t('hint.levelFull', { list: names.join(' + ') }));
    if (h.outputRevealed) {
      const out = this.game.content.elements.get(h.recipe.output)!;
      lines.push(t('hint.output', { name: `${out.emoji} ${out.name}` }));
    }
    return lines;
  }

  private openHint() {
    const d = this.el.dlgHint;
    const render = (message = '') => {
      const g = this.game;
      const hint = g.currentHint();
      const per = g.content.config.hints.perDiscoveries;
      const remain = per - g.data.hints.progress;
      let body: string;
      if (hint) {
        body = `<div class="hint-box">${this.hintText(hint).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
          ${hint.level < hint.maxLevel ? `<button type="button" class="ghost-btn" data-act="more">${t('hint.more')}（${hint.level}/${hint.maxLevel}）</button>` : ''}`;
      } else {
        body = `<button type="button" class="primary-btn" data-act="use" ${g.data.hints.available <= 0 ? 'disabled' : ''}>${t('hint.use')}</button>`;
      }
      d.innerHTML = `
        <h2 id="hint-title">${icon('hint')}${t('hint.title')}</h2>
        <p>${t('hint.remaining', { n: g.data.hints.available })}</p>
        <p class="muted small">${t('hint.progress', { n: remain })}</p>
        ${message ? `<p class="notice">${message}</p>` : ''}
        ${body}
        <form method="dialog" class="dlg-foot"><button class="ghost-btn">${t('hint.close')}</button></form>`;
    };
    d.onclick = (e) => {
      const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'use') {
        const r = this.game.requestHint();
        render(r.ok ? '' : r.reason === 'no-hints' ? t('hint.none') : t('hint.noCandidates'));
      } else if (act === 'more') {
        this.game.advanceHint();
        render();
      }
    };
    render();
    d.showModal();
  }

  /**
   * 整本典籍：依分類分章，已發現的元素描述直接攤開。
   * 章節只寫頁數不寫總數；整章集齊才蓋「集齊」印記（低壓力原則，見 DESIGN.md §2.6）。
   * 現在就能鍊出來的元素留一頁空白頁，只顯示材料數量；提示揭露過的材料會寫在對應的空白頁上。
   */
  private openBook() {
    const g = this.game;
    const d = this.el.dlgBook;
    const found = g.discoveredElements();
    const chapters = g.content.categories.map((c) => ({
      ...c,
      items: found.filter((e) => e.category === c.id),
      complete: g.isCategoryComplete(c.id),
    }));
    // 空白頁：不帶名稱，只記分類、材料數與提示揭露的材料；提示中的那一頁排在該章空白頁的最前面
    const hint = g.currentHint();
    const blanks = g.codexBlanks().map((b) => {
      const hinted = hint?.recipe.output === b.id;
      return { category: b.category, inputs: hinted ? hint!.recipe.inputs.length : b.inputs, revealed: hinted ? hint!.revealed : [] };
    });
    blanks.sort((a, b) => Number(b.revealed.length > 0) - Number(a.revealed.length > 0));
    const blanksOf = (cat: string) => blanks.map((b, i) => ({ ...b, i })).filter((b) => b.category === cat);
    const shown = (c: { id: string; items: unknown[] }) => c.items.length > 0 || blanksOf(c.id).length > 0;
    const slots = (b: (typeof blanks)[number]) =>
      `<span class="mat-slots" aria-hidden="true">${Array.from({ length: b.inputs }, (_, k) => {
        const got = b.revealed[k];
        return (k ? '<span class="mat-plus">＋</span>' : '') + (got ? `<span class="mat-got">${got.emoji}</span>` : '<span class="mat-o"></span>');
      }).join('')}</span>`;
    const page = (id: ElementId) => g.data.discovered.indexOf(id) + 1;
    d.innerHTML = `<div class="book-inner">
      <div class="book-head">
        <h2 id="book-title">${t('book.title')}</h2>
        <span class="muted small">${t('book.pages', { n: found.length })}</span>
        <form method="dialog"><button class="book-close" aria-label="${t('book.close')}">×</button></form>
      </div>
      <nav class="book-nav" aria-label="${t('book.chapters')}">${chapters
        .map(
          (c) => `<button type="button" class="chap-btn" data-chap="${c.id}" ${shown(c) ? '' : 'disabled'}>
            <span><span aria-hidden="true">${c.emoji}</span> ${esc(c.name)}</span>
            ${c.complete ? `<span class="seal-dot" title="${t('book.complete')}"></span><span class="visually-hidden">${t('book.complete')}</span>` : `<span class="chap-n">${c.items.length || (shown(c) ? '' : t('book.empty'))}</span>`}
          </button>`,
        )
        .join('')}</nav>
      <div class="book-body" id="book-body"></div>
    </div>`;
    const body = $(d, '#book-body');
    let tocScroll = 0;

    const renderToc = () => {
      body.innerHTML = chapters
        .filter(shown)
        .map(
          (c) => `<section class="chapter" data-chap="${c.id}" aria-labelledby="chap-${c.id}">
            <div class="chap-title"><h3 id="chap-${c.id}"><span aria-hidden="true">${c.emoji}</span> ${esc(c.name)}</h3>
              <span class="chap-pages">${c.items.length ? t('book.chapterPages', { n: c.items.length }) : t('book.noRecord')}</span>
              ${c.complete ? `<span class="seal">${t('book.complete')}</span>` : ''}</div>
            ${c.items
              .map(
                (e) => `<button type="button" class="entry" data-id="${e.id}">
                  <span class="entry-emoji" aria-hidden="true">${e.emoji}</span>
                  <span class="entry-text"><span class="entry-name">${esc(e.name)}</span><span class="entry-desc">${esc(e.desc)}</span></span>
                  <span class="entry-page">${t('codex.page', { n: page(e.id) })}</span>
                </button>`,
              )
              .join('')}
            ${blanksOf(c.id)
              .map((b) => {
                const label = t('book.blankLabel', { cat: c.name, n: b.inputs }) + (b.revealed.length ? t('book.blankHinted') : '');
                return `<button type="button" class="entry blank${b.revealed.length ? ' hinted' : ''}" data-blank="${b.i}" aria-label="${esc(label)}">
                  <span class="entry-emoji" aria-hidden="true"><span class="blank-mark">？</span></span>
                  <span class="entry-text"><span class="entry-name">${t('book.blankName')}</span>
                    <span class="entry-desc">${slots(b)}${b.revealed.length ? `<span class="hint-tag">${t('book.hintTag')}</span>` : ''}</span></span>
                  <span class="entry-page"></span>
                </button>`;
              })
              .join('')}
          </section>`,
        )
        .join('');
      body.scrollTop = tocScroll;
      syncNav();
    };
    const renderPage = (id: ElementId) => {
      tocScroll = body.scrollTop;
      body.innerHTML = `<article class="book-page" aria-labelledby="book-page-title">
          <button type="button" class="book-back" data-act="back">${t('book.back')}</button>
          ${this.codexPage(id, 'book-page-title')}
          <div class="codex-foot"><button type="button" class="primary-btn" data-act="add" data-id="${id}">${t('codex.add')}</button></div>
        </article>`;
      body.scrollTop = 0;
      ($(body, '[data-act="back"]') as HTMLButtonElement).focus({ preventScroll: true });
    };
    // 空白頁不列材料（提示揭露過的除外），免得典籍變成免費、不限次數的提示
    const renderBlank = (i: number) => {
      const b = blanks[i]!;
      const cat = g.content.categories.find((c) => c.id === b.category)!;
      tocScroll = body.scrollTop;
      body.innerHTML = `<article class="book-page" aria-labelledby="book-page-title">
          <button type="button" class="book-back" data-act="back">${t('book.back')}</button>
          <div class="blank-page">
            <span class="blank-mark" aria-hidden="true">？</span>
            <h2 id="book-page-title"><span aria-hidden="true">${cat.emoji}</span> ${t('book.blankTitle', { cat: esc(cat.name) })}</h2>
            ${slots(b)}
            <p>${t('book.blankBody')}</p>
            ${b.revealed.length ? `<p class="hint-tag">${t('book.blankHint', { list: b.revealed.map((e) => esc(e.name)).join('、') })}</p>` : ''}
            ${b.revealed.length && b.revealed.length < b.inputs ? `<p class="muted small">${t('book.blankHintMore')}</p>` : ''}
          </div>
        </article>`;
      body.scrollTop = 0;
      ($(body, '[data-act="back"]') as HTMLButtonElement).focus({ preventScroll: true });
    };
    // 捲動時標出目前讀到哪一章
    const syncNav = () => {
      const secs = [...body.querySelectorAll<HTMLElement>('.chapter')];
      if (!secs.length) return;
      const top = body.scrollTop + 24;
      let cur = secs[0]!;
      for (const s of secs) if (s.offsetTop - body.offsetTop <= top) cur = s;
      d.querySelectorAll('.chap-btn').forEach((b) => b.setAttribute('aria-current', String((b as HTMLElement).dataset.chap === cur.dataset.chap)));
    };
    body.addEventListener('scroll', syncNav, { passive: true });

    d.onclick = (ev) => {
      const target = ev.target as Element;
      const chap = target.closest<HTMLButtonElement>('.chap-btn');
      if (chap && !chap.disabled) {
        if (!body.querySelector('.chapter')) renderToc();
        const sec = body.querySelector<HTMLElement>(`.chapter[data-chap="${chap.dataset.chap}"]`);
        if (sec) body.scrollTo({ top: sec.offsetTop - body.offsetTop - 4, behavior: reducedMotion() ? 'auto' : 'smooth' });
        return;
      }
      const blank = target.closest<HTMLElement>('[data-blank]');
      if (blank) return renderBlank(Number(blank.dataset.blank));
      const entry = target.closest<HTMLElement>('.entry');
      if (entry?.dataset.id) return renderPage(entry.dataset.id);
      if (target.closest('[data-act="back"]')) {
        renderToc();
        return;
      }
      const add = target.closest<HTMLElement>('[data-act="add"]');
      if (add?.dataset.id) {
        d.close();
        this.addToSlot(add.dataset.id);
      }
    };
    d.showModal();
    renderToc();
  }

  /** 單一元素的典籍頁內容；長按翻開的小視窗與整本典籍共用。 */
  private codexPage(id: ElementId, headingId: string): string {
    const g = this.game;
    const e = g.content.elements.get(id)!;
    const cat = g.content.categories.find((c) => c.id === e.category);
    const name = (eid: ElementId) => {
      const x = g.content.elements.get(eid)!;
      return `<span class="codex-el"><span aria-hidden="true">${x.emoji}</span>${esc(x.name)}</span>`;
    };
    const order = g.discoveryIndex(id);
    const recipes = g.knownRecipesFor(id);
    const unknown = g.unknownUseCount(id);
    return `
      <p class="codex-head"><span>${t('codex.title')}${cat ? ` · ${esc(cat.name)}` : ''}</span><span>${t('codex.page', { n: g.data.discovered.indexOf(id) + 1 })}</span></p>
      <div class="codex-title">
        <span class="codex-emoji" aria-hidden="true">${e.emoji}</span>
        <div><h2 id="${headingId}">${esc(e.name)}</h2><p class="muted small">${order ? t('codex.order', { n: order }) : t('codex.base')}</p></div>
      </div>
      <p class="codex-desc">${esc(e.desc)}</p>
      <dl class="codex-facts">
        ${recipes.length ? `<dt>${t('codex.recipes')}</dt><dd>${recipes.map((r) => `<span class="codex-recipe">${r.inputs.map(name).join(' ＋ ')}</span>`).join('')}</dd>` : ''}
        <dt>${t('codex.uses')}</dt><dd class="${unknown ? 'codex-unknown' : 'muted'}">${unknown ? t('codex.unknown', { n: unknown }) : t('codex.none')}</dd>
      </dl>`;
  }

  /** 典籍單頁（長按、右鍵或點鍊成結果翻開）。 */
  private openCodex(id: ElementId) {
    if (!this.game.isDiscovered(id)) return;
    const d = this.el.dlgCodex;
    d.innerHTML = `${this.codexPage(id, 'codex-title')}
      <div class="codex-foot">
        <form method="dialog"><button class="ghost-btn">${t('codex.close')}</button></form>
        <button type="button" class="primary-btn" data-act="add">${t('codex.add')}</button>
      </div>`;
    d.onclick = (ev) => {
      if (!(ev.target as Element).closest('[data-act="add"]')) return;
      d.close();
      this.addToSlot(id);
    };
    d.showModal();
  }

  private openAchievements() {
    const g = this.game;
    const list = g.content.achievements;
    const unlocked = list.filter((a) => g.isAchievementUnlocked(a.id)).length;
    const d = this.el.dlgAch;
    d.innerHTML = `
      <h2 id="ach-title">${icon('trophy')}${t('achievements.title')}</h2>
      <p class="muted">${t('achievements.count', { n: unlocked, total: list.length })} · ${t('achievements.discovered', { n: g.discoveredCount, total: g.totalCount })}</p>
      <ul class="ach-list">${list
        .map((a) => {
          const on = g.isAchievementUnlocked(a.id);
          return `<li class="${on ? 'on' : 'off'}">
            <span class="ach-emoji" aria-hidden="true">${on ? a.emoji : icon('lock')}</span>
            <span class="ach-text"><strong>${esc(a.name)}</strong><span>${esc(a.desc)}${a.reward.hints ? ` · ${t('achievements.reward', { n: a.reward.hints })}` : ''}</span></span>
            <span class="visually-hidden">${on ? '' : t('achievements.locked')}</span>
          </li>`;
        })
        .join('')}</ul>
      <form method="dialog" class="dlg-foot"><button class="ghost-btn" autofocus>${t('achievements.close')}</button></form>`;
    d.showModal();
  }

  private openSettings() {
    const d = this.el.dlgSettings;
    const g = this.game;
    const soundLabel = () =>
      g.data.settings.muted ? `${icon('soundOff')}${t('settings.off')}` : `${icon('soundOn')}${t('settings.on')}`;
    const fmtTime = (ms: number) => {
      const m = Math.floor(ms / 60000);
      const h = Math.floor(m / 60);
      return h > 0 ? t('time.hm', { h, m: m % 60 }) : t('time.m', { m });
    };
    d.innerHTML = `
      <h2 id="settings-title">${icon('gear')}${t('settings.title')}</h2>
      <section class="set-row">
        <span>${t('settings.sound')}</span>
        <button type="button" class="ghost-btn small with-icon" data-act="sound" aria-pressed="${!g.data.settings.muted}">
          ${soundLabel()}</button>
      </section>
      <section class="set-row">
        <span>${t('settings.ambient')}</span>
        <button type="button" class="ghost-btn small" data-act="ambient" aria-pressed="${this.ambient}" ${g.data.settings.muted ? 'disabled' : ''}>
          ${this.ambient ? t('settings.on') : t('settings.off')}</button>
      </section>
      <section>
        <h3>${t('settings.stats')}</h3>
        <p>${t('settings.attempts', { n: g.data.stats.attempts })}</p>
        <p>${t('settings.playtime', { t: fmtTime(g.data.stats.playMs) })}</p>
      </section>
      <section>
        <h3>${t('settings.export')}</h3>
        <p class="muted small">${t('settings.exportHelp')}</p>
        <textarea readonly rows="3" class="code" id="export-code" aria-label="${t('settings.export')}">${encodeSaveCode(g.data)}</textarea>
        <button type="button" class="ghost-btn small" data-act="copy">${t('settings.copy')}</button>
      </section>
      <section>
        <h3>${t('settings.import')}</h3>
        <textarea rows="3" class="code" id="import-code" placeholder="${t('settings.importPlaceholder')}" aria-label="${t('settings.import')}"></textarea>
        <button type="button" class="ghost-btn small" data-act="import">${t('settings.importConfirm')}</button>
        <p class="notice" id="import-msg" role="status"></p>
      </section>
      <section>
        <button type="button" class="danger-btn small" data-act="reset">${t('settings.reset')}</button>
        <div class="confirm" id="reset-confirm" hidden>
          <p>${t('settings.resetConfirm')}</p>
          <button type="button" class="ghost-btn small" data-act="reset-no">${t('settings.resetNo')}</button>
          <button type="button" class="danger-btn small" data-act="reset-yes">${t('settings.resetYes')}</button>
        </div>
      </section>
      <p class="muted small">${t('settings.version', { v: __APP_VERSION__ })}</p>
      <form method="dialog" class="dlg-foot"><button class="ghost-btn">${t('settings.close')}</button></form>`;

    d.onclick = async (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('[data-act]');
      switch (btn?.dataset.act) {
        case 'sound':
          g.setMuted(!g.data.settings.muted);
          this.sfx.muted = g.data.settings.muted;
          btn.setAttribute('aria-pressed', String(!g.data.settings.muted));
          btn.innerHTML = soundLabel();
          ($(d, '[data-act="ambient"]') as HTMLButtonElement).disabled = g.data.settings.muted;
          break;
        case 'ambient':
          this.ambient = !this.ambient;
          saveFlag(AMBIENT_KEY, this.ambient);
          this.sfx.setAmbient(this.ambient);
          btn.setAttribute('aria-pressed', String(this.ambient));
          btn.textContent = this.ambient ? t('settings.on') : t('settings.off');
          break;
        case 'copy': {
          const ta = $(d, '#export-code') as HTMLTextAreaElement;
          try {
            await navigator.clipboard.writeText(ta.value);
          } catch {
            ta.select();
          }
          btn.textContent = t('settings.copied');
          break;
        }
        case 'import': {
          const msg = $(d, '#import-msg');
          try {
            const save = decodeSaveCode(($(d, '#import-code') as HTMLTextAreaElement).value, g.content);
            g.replaceSave(save);
            this.sfx.muted = save.settings.muted;
            this.slots.fill(null);
            msg.textContent = t('settings.imported');
          } catch (err) {
            msg.textContent = err instanceof SaveError ? err.message : String(err);
          }
          break;
        }
        case 'reset':
          $(d, '#reset-confirm').hidden = false;
          ($(d, '[data-act="reset-no"]') as HTMLButtonElement).focus();
          break;
        case 'reset-no':
          $(d, '#reset-confirm').hidden = true;
          break;
        case 'reset-yes':
          g.reset();
          this.sfx.muted = false;
          this.slots.fill(null);
          this.el.result.innerHTML = '';
          d.close();
          break;
      }
    };
    d.showModal();
  }
}
