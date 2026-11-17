import { Game, type CraftResult, type HintView } from '../core/game';
import { SaveError, decodeSaveCode, encodeSaveCode } from '../core/save';
import type { ElementDef, ElementId } from '../core/types';
import { Sfx } from './audio';
import { t } from './i18n';

type SortMode = 'order' | 'name';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/** 坩堝：鑄鐵鍋身、銅邊鍋口裡的熔液、兩側提耳、三支短腳，底下燒著炭火。 */
const CRUCIBLE = `<svg class="pot" viewBox="0 0 400 270" focusable="false">
  <defs>
    <linearGradient id="cr-iron" x1="0" x2="1">
      <stop offset="0" stop-color="#22170f"/><stop offset=".26" stop-color="#5a4330"/>
      <stop offset=".46" stop-color="#36271a"/><stop offset="1" stop-color="#0f0a06"/>
    </linearGradient>
    <linearGradient id="cr-rim" x1="0" x2="1">
      <stop offset="0" stop-color="#3a2817"/><stop offset=".28" stop-color="#c79a55"/>
      <stop offset=".48" stop-color="#f6d896"/><stop offset=".72" stop-color="#a87c3e"/><stop offset="1" stop-color="#2e1f12"/>
    </linearGradient>
    <radialGradient id="cr-melt" cx=".5" cy=".3" r=".75">
      <stop offset="0" stop-color="#fff3cc"/><stop offset=".3" stop-color="#ffbf55"/>
      <stop offset=".7" stop-color="#e4642c"/><stop offset="1" stop-color="#6e240c"/>
    </radialGradient>
    <radialGradient id="cr-fire" cx=".5" cy="1" r=".95">
      <stop offset="0" stop-color="#ffe09a"/><stop offset=".38" stop-color="#ff8a33"/>
      <stop offset="1" stop-color="#e4642c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cr-shine" cx=".28" cy=".32" r=".45">
      <stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse class="heat" cx="200" cy="256" rx="160" ry="20" fill="url(#cr-fire)"/>
  <g class="flames" fill="url(#cr-fire)">
    <path d="M146 262c-12-15-5-32 8-42 0 12 8 17 10 27 3-8 9-12 9-21 10 13 10 30 0 36z"/>
    <path d="M190 264c-15-19-6-40 9-53 0 15 11 21 13 34 4-11 11-15 11-26 13 17 13 36 0 45z"/>
    <path d="M238 262c-9-13-3-28 8-36 1 11 7 15 9 24 3-7 7-11 7-18 10 11 10 26 0 30z"/>
  </g>
  <g fill="#120c08" stroke="#5a4330" stroke-width="2" stroke-linejoin="round">
    <path d="M122 210l-16 42h18l13-38z"/>
    <path d="M278 210l16 42h-18l-13-38z"/>
    <path d="M192 220v36h16v-36z"/>
  </g>
  <g fill="none" stroke="#6b5132" stroke-width="10" stroke-linecap="round">
    <path d="M60 74c-36-6-44 46-6 54"/>
    <path d="M340 74c36-6 44 46 6 54"/>
  </g>
  <path d="M52 48C38 122 70 198 138 224h124c68-26 100-102 86-176z" fill="url(#cr-iron)" stroke="#6b5132" stroke-width="2"/>
  <path d="M52 48C38 122 70 198 138 224h124c68-26 100-102 86-176z" fill="url(#cr-shine)"/>
  <path d="M50 116c64 22 236 22 300 0" fill="none" stroke="#c79a55" stroke-opacity=".55" stroke-width="4"/>
  <path d="M52 124c64 22 232 22 296 0" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2"/>
  <g class="emblem" fill="none" stroke="#e0ad4f" stroke-width="2.2">
    <circle cx="200" cy="178" r="21"/><path d="M200 161l15 26h-30z"/><path d="M186 178h28"/>
  </g>
  <ellipse cx="200" cy="48" rx="156" ry="30" fill="url(#cr-rim)"/>
  <ellipse cx="200" cy="46" rx="140" ry="21" fill="#0b0704"/>
  <ellipse class="melt" cx="200" cy="51" rx="132" ry="16" fill="url(#cr-melt)"/>
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
  private category = 'all';
  private query = '';
  private sort: SortMode = 'order';
  private busy = false;
  private suppressClick = false;
  private renderQueued = false;

  private el!: {
    progressText: HTMLElement;
    progressN: HTMLElement;
    progressTotal: HTMLElement;
    libCount: HTMLElement;
    progressFill: HTMLElement;
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
      progressText: $(r, '#progress-text'),
      progressN: $(r, '#progress-n'),
      progressTotal: $(r, '#progress-total'),
      libCount: $(r, '#lib-count'),
      progressFill: $(r, '#progress-fill'),
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
    };
    for (const d of [this.el.dlgDiscover, this.el.dlgHint, this.el.dlgAch, this.el.dlgSettings]) setupDialog(d);

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
      <p class="count">
        <span class="visually-hidden" id="progress-text"></span>
        <span class="count-vis" aria-hidden="true"><b id="progress-n"></b><span id="progress-total"></span></span>
      </p>
      <div class="bar" aria-hidden="true"><div id="progress-fill"></div></div>
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
        </div>
        <div class="result" id="result"></div>
      </div>
      <div class="bench-actions">
        <button type="button" id="btn-clear" class="ghost-btn">${t('crucible.clear')}</button>
        <button type="button" id="btn-craft" class="primary-btn">${t('crucible.craft')}</button>
      </div>
      <p class="tried" id="tried" hidden>${icon('retry')}${t('crucible.tried')}</p>
      <p class="help" id="help">${t('crucible.help')}</p>
      <button type="button" class="hint-banner" id="hint-banner" hidden></button>
    </section>

    <section class="library" aria-labelledby="lib-title">
      <div class="lib-head">
        <h2 id="lib-title">${t('list.title')}</h2>
        <span class="lib-count" id="lib-count"></span>
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

    el.grid.addEventListener('click', (e) => {
      if (this.suppressClick) return;
      const btn = (e.target as Element).closest<HTMLElement>('.el');
      if (btn?.dataset.id) this.addToSlot(btn.dataset.id);
    });
    this.bindDrag();

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
    $(this.root, '#btn-settings').addEventListener('click', () => this.openSettings());
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

  private addToSlot(id: ElementId, index?: number) {
    if (this.busy) return;
    const i = index ?? this.slots.findIndex((s) => s === null);
    if (i < 0) {
      this.showResult(`<span class="muted">${t('crucible.full')}</span>`, 'warn');
      return;
    }
    this.slots[i] = id;
    this.sfx.tick();
    this.clearResult();
    this.renderBench();
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
    if (!reducedMotion()) await sleep(420);
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
        this.showResult(this.resultChip(r.output), 'new');
        this.openDiscover(r);
        break;
    }
    this.renderBench();
  }

  private resultChip(e: ElementDef): string {
    return `<span class="emoji">${e.emoji}</span><span class="name">${esc(e.name)}</span>`;
  }

  private showResult(html: string, kind: 'new' | 'known' | 'fail' | 'warn') {
    const res = this.el.result;
    res.className = 'result';
    res.innerHTML = html;
    void res.offsetWidth; // 重新觸發動畫
    res.classList.add(`is-${kind}`);
    if (kind === 'fail') {
      this.el.crucible.classList.remove('shake');
      void this.el.crucible.offsetWidth;
      this.el.crucible.classList.add('shake');
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
    this.el.progressText.textContent = t('header.progress', { n, total });
    this.el.progressN.textContent = String(n);
    this.el.progressTotal.textContent = t('header.progressTotal', { total });
    this.el.libCount.textContent = t('list.count', { n });
    this.el.progressFill.style.inlineSize = `${(n / total) * 100}%`;
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
        return `${plus}<button type="button" class="slot filled" data-index="${i}" aria-label="${esc(t('crucible.slot.filled', { n, name: e.name }))}">
          <span class="emoji">${e.emoji}</span><span class="name">${esc(e.name)}</span></button>`;
      })
      .join('');

    const inputs = this.filled();
    const can = this.game.canCraft(inputs);
    this.el.crucible.dataset.fill = String(inputs.length);
    this.el.craft.disabled = !can || this.busy;
    this.el.clear.disabled = inputs.length === 0;
    this.el.tried.hidden = !(can && this.game.wasFailed(inputs));
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
    let list = this.game.discoveredElements();
    if (this.category !== 'all') list = list.filter((e) => e.category === this.category);
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.id.includes(q));
    if (this.sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant-TW'));

    const hint = this.game.currentHint();
    const hinted = new Set(hint?.revealed.map((e) => e.id));

    if (list.length === 0) {
      this.el.grid.innerHTML = `<p class="empty">${t('list.empty')}</p>`;
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

  private openAchievements() {
    const g = this.game;
    const list = g.content.achievements;
    const unlocked = list.filter((a) => g.isAchievementUnlocked(a.id)).length;
    const d = this.el.dlgAch;
    d.innerHTML = `
      <h2 id="ach-title">${icon('trophy')}${t('achievements.title')}</h2>
      <p class="muted">${t('achievements.count', { n: unlocked, total: list.length })}</p>
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
