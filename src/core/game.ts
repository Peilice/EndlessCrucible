import { recipeKey } from './content';
import { StaticResolver, type RecipeResolver } from './resolver';
import { newSave, type SaveData } from './save';
import type { AchievementDef, Content, ElementDef, ElementId, Recipe } from './types';

export type CraftResult =
  | { kind: 'invalid'; reason: 'arity' | 'unknown' }
  | { kind: 'fail'; repeated: boolean }
  | { kind: 'known'; output: ElementDef }
  | { kind: 'new'; output: ElementDef; achievements: AchievementDef[]; hintsGained: number };

export interface HintView {
  recipe: Recipe;
  level: number;
  maxLevel: number;
  /** 目前揭露的材料。 */
  revealed: ElementDef[];
  /** 產物是否已揭露（僅在材料全部揭露後的下一層）。 */
  outputRevealed: boolean;
}

export type HintRequest = { ok: true; hint: HintView } | { ok: false; reason: 'no-hints' | 'no-candidates' };

export const HINT_MAX_LEVEL = 3;

/**
 * 遊戲規則本體。不碰 DOM、不碰 storage；狀態變動時呼叫 onChange。
 */
export class Game {
  readonly content: Content;
  private save: SaveData;
  private readonly resolver: RecipeResolver;
  private discoveredSet: Set<ElementId>;
  private failedSet: Set<string>;
  private listeners = new Set<() => void>();

  constructor(content: Content, save?: SaveData, resolver?: RecipeResolver) {
    this.content = content;
    this.save = save ?? newSave(content);
    this.resolver = resolver ?? new StaticResolver(content);
    this.discoveredSet = new Set(this.save.discovered);
    this.failedSet = new Set(this.save.failed);
  }

  // ---- 讀取 ----

  get data(): Readonly<SaveData> {
    return this.save;
  }

  get discoveredCount(): number {
    return this.save.discovered.length;
  }

  get totalCount(): number {
    return this.content.elementList.length;
  }

  isDiscovered(id: ElementId): boolean {
    return this.discoveredSet.has(id);
  }

  /** 依發現順序。 */
  discoveredElements(): ElementDef[] {
    return this.save.discovered.map((id) => this.content.elements.get(id)).filter((e): e is ElementDef => !!e);
  }

  canCraft(inputs: readonly ElementId[]): boolean {
    const { minInputs, maxInputs } = this.content.config;
    return inputs.length >= minInputs && inputs.length <= maxInputs;
  }

  wasFailed(inputs: readonly ElementId[]): boolean {
    return this.failedSet.has(recipeKey(inputs));
  }

  /** 所有用到此元素的配方，產物都已發現。 */
  isExhausted(id: ElementId): boolean {
    const uses = this.content.recipesByInput.get(id) ?? [];
    return uses.every((r) => this.discoveredSet.has(r.output));
  }

  // ---- 鍊成 ----

  async craft(inputs: readonly ElementId[]): Promise<CraftResult> {
    if (!this.canCraft(inputs)) return { kind: 'invalid', reason: 'arity' };
    if (inputs.some((id) => !this.discoveredSet.has(id))) return { kind: 'invalid', reason: 'unknown' };

    this.save.stats.attempts += 1;
    const outputId = await this.resolver.resolve(inputs);
    const output = outputId ? this.content.elements.get(outputId) : undefined;

    if (!output) {
      const key = recipeKey(inputs);
      const repeated = this.failedSet.has(key);
      if (!repeated) {
        this.failedSet.add(key);
        this.save.failed.push(key);
      }
      this.emit();
      return { kind: 'fail', repeated };
    }

    if (this.discoveredSet.has(output.id)) {
      this.emit();
      return { kind: 'known', output };
    }

    this.discoveredSet.add(output.id);
    this.save.discovered.push(output.id);

    let hintsGained = 0;
    const per = this.content.config.hints.perDiscoveries;
    this.save.hints.progress += 1;
    if (per > 0 && this.save.hints.progress >= per) {
      this.save.hints.progress -= per;
      hintsGained += 1;
    }

    const achievements = this.checkAchievements();
    for (const a of achievements) hintsGained += a.reward.hints;
    this.save.hints.available += hintsGained;

    const active = this.save.hints.active;
    if (active && this.discoveredSet.has(this.content.recipesByKey.get(active.recipeKey)?.output ?? '')) {
      this.save.hints.active = null;
    }

    this.emit();
    return { kind: 'new', output, achievements, hintsGained };
  }

  // ---- 成就 ----

  isAchievementUnlocked(id: string): boolean {
    return this.save.achievements.includes(id);
  }

  private checkAchievements(): AchievementDef[] {
    const unlocked: AchievementDef[] = [];
    for (const a of this.content.achievements) {
      if (this.save.achievements.includes(a.id)) continue;
      if (this.meets(a)) {
        this.save.achievements.push(a.id);
        unlocked.push(a);
      }
    }
    return unlocked;
  }

  private meets(a: AchievementDef): boolean {
    const c = a.condition;
    switch (c.type) {
      case 'count':
        return this.discoveredCount >= c.n;
      case 'complete':
        return this.discoveredCount >= this.totalCount;
      case 'category':
        return this.content.elementList.filter((e) => e.category === c.category).every((e) => this.discoveredSet.has(e.id));
      case 'element':
        return this.discoveredSet.has(c.element);
    }
  }

  // ---- 提示 ----

  /** 材料全部已發現、產物尚未發現的配方，依產物階層排序。 */
  hintCandidates(): Recipe[] {
    const tier = (id: ElementId) => this.content.tiers.get(id) ?? Number.MAX_SAFE_INTEGER;
    return this.content.recipes
      .filter((r) => !this.discoveredSet.has(r.output) && r.inputs.every((i) => this.discoveredSet.has(i)))
      .sort(
        (a, b) =>
          tier(a.output) - tier(b.output) ||
          a.inputs.length - b.inputs.length ||
          a.key.localeCompare(b.key),
      );
  }

  currentHint(): HintView | null {
    const active = this.save.hints.active;
    if (!active) return null;
    const recipe = this.content.recipesByKey.get(active.recipeKey);
    if (!recipe || this.discoveredSet.has(recipe.output)) return null;
    return this.viewHint(recipe, active.level);
  }

  /** 花費一次提示開始新的提示；若已有進行中的提示則直接回傳（不扣次數）。 */
  requestHint(): HintRequest {
    const current = this.currentHint();
    if (current) return { ok: true, hint: current };
    if (this.save.hints.available <= 0) return { ok: false, reason: 'no-hints' };
    const recipe = this.hintCandidates()[0];
    if (!recipe) return { ok: false, reason: 'no-candidates' };
    this.save.hints.available -= 1;
    this.save.hints.active = { recipeKey: recipe.key, level: 1 };
    this.emit();
    return { ok: true, hint: this.viewHint(recipe, 1) };
  }

  /** 揭露下一層（免費）。 */
  advanceHint(): HintView | null {
    const active = this.save.hints.active;
    const current = this.currentHint();
    if (!active || !current) return null;
    if (active.level < HINT_MAX_LEVEL) {
      active.level += 1;
      this.emit();
    }
    return this.currentHint();
  }

  private viewHint(recipe: Recipe, level: number): HintView {
    const n = recipe.inputs.length;
    const revealed = recipe.inputs.slice(0, Math.min(level, n)).map((id) => this.content.elements.get(id)!);
    return { recipe, level, maxLevel: HINT_MAX_LEVEL, revealed, outputRevealed: level > n };
  }

  // ---- 其他 ----

  addPlayTime(ms: number) {
    if (ms > 0) this.save.stats.playMs += ms;
  }

  setMuted(muted: boolean) {
    this.save.settings.muted = muted;
    this.emit();
  }

  /** 以另一份存檔取代目前狀態（匯入、重置）。 */
  replaceSave(save: SaveData) {
    this.save = save;
    this.discoveredSet = new Set(save.discovered);
    this.failedSet = new Set(save.failed);
    this.emit();
  }

  reset() {
    this.replaceSave(newSave(this.content));
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}
