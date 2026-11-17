import type {
  AchievementCondition,
  AchievementDef,
  CategoryDef,
  Content,
  ElementDef,
  ElementId,
  GameConfig,
  Issue,
  Recipe,
} from './types';

/** 原始內容包（YAML 解析後的樣貌）。 */
export interface RawPack {
  pack: { id: string; name?: string; bases?: string[]; categories?: CategoryDef[] };
  elements?: Array<Partial<Omit<ElementDef, 'pack'>>>;
  recipes?: string[];
  achievements?: Array<Partial<Omit<AchievementDef, 'pack'>> & { condition?: unknown }>;
}

export function recipeKey(inputs: readonly ElementId[]): string {
  return [...inputs].sort().join('+');
}

const RECIPE_LINE = /^(.+?)=\s*([\w-]+)\s*$/;

/** 解析 `a + b = c` 形式的配方字串。 */
export function parseRecipeLine(line: string): { inputs: ElementId[]; output: ElementId } | null {
  const m = RECIPE_LINE.exec(line.trim());
  if (!m) return null;
  const inputs = m[1]!.split('+').map((s) => s.trim());
  if (inputs.some((s) => !/^[\w-]+$/.test(s))) return null;
  return { inputs, output: m[2]! };
}

function parseCondition(raw: unknown): AchievementCondition | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'count':
      return typeof c.n === 'number' ? { type: 'count', n: c.n } : null;
    case 'complete':
      return { type: 'complete' };
    case 'category':
      return typeof c.category === 'string' ? { type: 'category', category: c.category } : null;
    case 'element':
      return typeof c.element === 'string' ? { type: 'element', element: c.element } : null;
    default:
      return null;
  }
}

/**
 * 依序合併內容包並建立索引。解析層級的問題（重複 id、格式錯誤）收集在 issues，
 * 其餘語意檢查交給 validate()。
 */
export function buildContent(config: GameConfig, packs: RawPack[]): { content: Content; issues: Issue[] } {
  const issues: Issue[] = [];
  const err = (rule: string, message: string) => issues.push({ level: 'error', rule, message });

  const bases: ElementId[] = [];
  const elements = new Map<ElementId, ElementDef>();
  const elementList: ElementDef[] = [];
  const categories: CategoryDef[] = [];
  const recipes: Recipe[] = [];
  const recipesByKey = new Map<string, Recipe>();
  const achievements: AchievementDef[] = [];

  for (const raw of packs) {
    const packId = raw.pack.id;
    for (const b of raw.pack.bases ?? []) if (!bases.includes(b)) bases.push(b);

    for (const c of raw.pack.categories ?? []) {
      if (categories.some((x) => x.id === c.id)) err('duplicate-category', `分類 ${c.id} 重複定義（${packId}）`);
      else categories.push({ id: c.id, name: c.name, emoji: c.emoji ?? '' });
    }

    for (const e of raw.elements ?? []) {
      if (!e.id) {
        err('element-fields', `內容包 ${packId} 有元素缺少 id`);
        continue;
      }
      if (elements.has(e.id)) {
        err('duplicate-element', `元素 ${e.id} 重複定義（${packId}）`);
        continue;
      }
      const def: ElementDef = {
        id: e.id,
        name: e.name ?? '',
        emoji: e.emoji ?? '',
        desc: e.desc ?? '',
        category: e.category ?? '',
        pack: packId,
      };
      elements.set(def.id, def);
      elementList.push(def);
    }

    for (const line of raw.recipes ?? []) {
      const parsed = typeof line === 'string' ? parseRecipeLine(line) : null;
      if (!parsed) {
        err('recipe-syntax', `無法解析配方「${String(line)}」（${packId}）`);
        continue;
      }
      const key = recipeKey(parsed.inputs);
      const existing = recipesByKey.get(key);
      if (existing) {
        err('duplicate-recipe', `配方 ${key} 重複：→ ${existing.output} 與 → ${parsed.output}`);
        continue;
      }
      const recipe: Recipe = { inputs: key.split('+'), output: parsed.output, key, pack: packId };
      recipes.push(recipe);
      recipesByKey.set(key, recipe);
    }

    for (const a of raw.achievements ?? []) {
      const condition = parseCondition(a.condition);
      if (!a.id || !condition) {
        err('achievement-syntax', `成就 ${a.id ?? '(無 id)'} 格式錯誤（${packId}）`);
        continue;
      }
      if (achievements.some((x) => x.id === a.id)) {
        err('duplicate-achievement', `成就 ${a.id} 重複定義`);
        continue;
      }
      achievements.push({
        id: a.id,
        name: a.name ?? '',
        desc: a.desc ?? '',
        emoji: a.emoji ?? '🏅',
        condition,
        reward: { hints: a.reward?.hints ?? 0 },
        pack: packId,
      });
    }
  }

  const recipesByInput = new Map<ElementId, Recipe[]>();
  const recipesByOutput = new Map<ElementId, Recipe[]>();
  for (const r of recipes) {
    for (const id of new Set(r.inputs)) push(recipesByInput, id, r);
    push(recipesByOutput, r.output, r);
  }

  const content: Content = {
    config,
    bases,
    elements,
    elementList,
    categories,
    recipes,
    recipesByKey,
    recipesByInput,
    recipesByOutput,
    achievements,
    tiers: computeTiers(bases, recipes),
  };
  return { content, issues };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 以不動點迭代求每個元素的最短合成深度（起始元素為 0）。 */
export function computeTiers(bases: readonly ElementId[], recipes: readonly Recipe[]): Map<ElementId, number> {
  const tiers = new Map<ElementId, number>(bases.map((b) => [b, 0]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of recipes) {
      let max = 0;
      let ok = true;
      for (const i of r.inputs) {
        const t = tiers.get(i);
        if (t === undefined) {
          ok = false;
          break;
        }
        max = Math.max(max, t);
      }
      if (!ok) continue;
      const cand = max + 1;
      const cur = tiers.get(r.output);
      if (cur === undefined || cand < cur) {
        tiers.set(r.output, cand);
        changed = true;
      }
    }
  }
  return tiers;
}
