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
    <div class="progress">
      <span id="progress-text"></span>
      <div class="bar" aria-hidden="true"><div id="progress-fill"></div></div>
    </div>
    <nav class="actions" aria-label="${t('header.settings')}">
      <button type="button" id="btn-hint" class="chip-btn">
        <span aria-hidden="true">💡</span><span class="label">${t('header.hint')}</span>
        <span class="badge" id="hint-count"></span>
      </button>
      <button type="button" id="btn-ach" class="chip-btn">
        <span aria-hidden="true">🏆</span><span class="label">${t('header.achievements')}</span>
      </button>
      <button type="button" id="btn-settings" class="chip-btn">
        <span aria-hidden="true">⚙️</span><span class="label">${t('header.settings')}</span>
      </button>
    </nav>
  </header>

  <main class="layout">
    <section class="bench" aria-labelledby="bench-title">
      <h2 id="bench-title" class="visually-hidden">${t('crucible.title')}</h2>
      <div class="crucible" id="crucible">
        <div class="slots" id="slots"></div>
        <div class="bowl" aria-hidden="true">
          <div class="bowl-glow"></div>
          <div class="bubbles"><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="result" id="result"></div>
      </div>
      <div class="bench-actions">
        <button type="button" id="btn-clear" class="ghost-btn">${t('crucible.clear')}</button>
        <button type="button" id="btn-craft" class="primary-btn">${t('crucible.craft')}</button>
      </div>
      <p class="tried" id="tried" hidden>⟲ ${t('crucible.tried')}</p>
      <p class="help" id="help">${t('crucible.help')}</p>
      <button type="button" class="hint-banner" id="hint-banner" hidden></button>
    </section>

    <section class="library" aria-labelledby="lib-title">
      <h2 id="lib-title" class="visually-hidden">${t('list.title')}</h2>
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
          return `${plus}<button type="button" class="slot empty" data-index="${i}" aria-label="${t('crucible.slot.label', { n })}"></button>`;
        }
        const e = content.elements.get(id)!;
        return `${plus}<button type="button" class="slot filled" data-index="${i}" aria-label="${esc(t('crucible.slot.filled', { n, name: e.name }))}">
          <span class="emoji">${e.emoji}</span><span class="name">${esc(e.name)}</span></button>`;
      })
      .join('');

    const inputs = this.filled();
    const can = this.game.canCraft(inputs);
    this.el.craft.disabled = !can || this.busy;
    this.el.clear.disabled = inputs.length === 0;
    this.el.tried.hidden = !(can && this.game.wasFailed(inputs));
    this.el.help.hidden = this.game.data.stats.attempts > 0;

    const hint = this.game.currentHint();
    this.el.hintBanner.hidden = !hint;
    if (hint) this.el.hintBanner.innerHTML = `<span aria-hidden="true">💡</span> ${esc(this.hintText(hint).join(' '))}`;
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
          <span class="emoji" aria-hidden="true">${e.emoji}</span><span class="name">${esc(e.name)}</span>${ex ? '<span class="check" aria-hidden="true">✓</span>' : ''}</button>`;
      })
      .join('');
  }

  // ───────────────────────── 對話框 ─────────────────────────

  private openDiscover(r: Extract<CraftResult, { kind: 'new' }>) {
    const e = r.output;
    const cat = this.game.content.categories.find((c) => c.id === e.category);
    const rewards = [
      ...r.achievements.map((a) => `<li>${a.emoji} ${esc(t('discover.achievement', { name: a.name }))}</li>`),
      r.hintsGained > 0 ? `<li>💡 ${t('discover.hints', { n: r.hintsGained })}</li>` : '',
    ].join('');
    const d = this.el.dlgDiscover;
    d.innerHTML = `
      <div class="burst" aria-hidden="true"></div>
      <p class="eyebrow" id="discover-title">${t('discover.title')}</p>
      <div class="big-emoji" aria-hidden="true">${e.emoji}</div>
      <h2 class="el-name">${esc(e.name)}</h2>
      ${cat ? `<p class="cat">${cat.emoji} ${esc(cat.name)}</p>` : ''}
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
        <h2 id="hint-title">💡 ${t('hint.title')}</h2>
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
      <h2 id="ach-title">🏆 ${t('achievements.title')}</h2>
      <p class="muted">${t('achievements.count', { n: unlocked, total: list.length })}</p>
      <ul class="ach-list">${list
        .map((a) => {
          const on = g.isAchievementUnlocked(a.id);
          return `<li class="${on ? 'on' : 'off'}">
            <span class="ach-emoji" aria-hidden="true">${on ? a.emoji : '🔒'}</span>
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
    const fmtTime = (ms: number) => {
      const m = Math.floor(ms / 60000);
      const h = Math.floor(m / 60);
      return h > 0 ? t('time.hm', { h, m: m % 60 }) : t('time.m', { m });
    };
    d.innerHTML = `
      <h2 id="settings-title">⚙️ ${t('settings.title')}</h2>
      <section class="set-row">
        <span>${t('settings.sound')}</span>
        <button type="button" class="ghost-btn small" data-act="sound" aria-pressed="${!g.data.settings.muted}">
          ${g.data.settings.muted ? `🔇 ${t('settings.off')}` : `🔊 ${t('settings.on')}`}</button>
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
          btn.textContent = g.data.settings.muted ? `🔇 ${t('settings.off')}` : `🔊 ${t('settings.on')}`;
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
