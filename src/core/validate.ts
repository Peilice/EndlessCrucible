import type { Content, Issue } from './types';

/** 一條驗證規則。新增規則只要往 RULES 加一個函式。 */
export type Rule = (c: Content) => Issue[];

const error = (rule: string, message: string): Issue => ({ level: 'error', rule, message });
const warning = (rule: string, message: string): Issue => ({ level: 'warning', rule, message });

export const RULES: Record<string, Rule> = {
  config(c) {
    const { slots, minInputs, maxInputs } = c.config;
    const out: Issue[] = [];
    if (minInputs < 2) out.push(error('config', `minInputs 必須 ≥ 2（目前 ${minInputs}）`));
    if (maxInputs < minInputs) out.push(error('config', 'maxInputs 不可小於 minInputs'));
    if (slots < maxInputs) out.push(error('config', `slots（${slots}）不可小於 maxInputs（${maxInputs}）`));
    return out;
  },

  bases(c) {
    if (c.bases.length === 0) return [error('bases', '沒有任何起始元素')];
    return c.bases.filter((b) => !c.elements.has(b)).map((b) => error('bases', `起始元素 ${b} 不存在`));
  },

  elementFields(c) {
    const out: Issue[] = [];
    for (const e of c.elementList) {
      for (const f of ['name', 'emoji', 'desc', 'category'] as const) {
        if (!e[f]) out.push(error('element-fields', `元素 ${e.id} 缺少 ${f}`));
      }
      if (!/^[a-z][a-z0-9_]*$/.test(e.id)) out.push(error('element-id', `元素 id「${e.id}」只能用小寫英數與底線`));
      if (e.category && !c.categories.some((x) => x.id === e.category)) {
        out.push(error('element-category', `元素 ${e.id} 的分類 ${e.category} 不存在`));
      }
    }
    return out;
  },

  duplicateNames(c) {
    const seen = new Map<string, string>();
    const out: Issue[] = [];
    for (const e of c.elementList) {
      const prev = seen.get(e.name);
      if (prev) out.push(error('duplicate-name', `元素名稱「${e.name}」重複：${prev}、${e.id}`));
      else seen.set(e.name, e.id);
    }
    return out;
  },

  recipeRefs(c) {
    const out: Issue[] = [];
    for (const r of c.recipes) {
      for (const id of [...r.inputs, r.output]) {
        if (!c.elements.has(id)) out.push(error('recipe-ref', `配方 ${r.key} = ${r.output} 引用了不存在的元素 ${id}`));
      }
    }
    return out;
  },

  recipeArity(c) {
    const { minInputs, maxInputs } = c.config;
    return c.recipes
      .filter((r) => r.inputs.length < minInputs || r.inputs.length > maxInputs)
      .map((r) => error('recipe-arity', `配方 ${r.key} 的材料數 ${r.inputs.length} 不在 ${minInputs}～${maxInputs} 之間`));
  },

  recipeSanity(c) {
    const out: Issue[] = [];
    for (const r of c.recipes) {
      if (r.inputs.includes(r.output)) out.push(warning('recipe-self', `配方 ${r.key} 的產物 ${r.output} 也是材料`));
      if (c.bases.includes(r.output)) out.push(warning('recipe-base', `配方 ${r.key} 產出起始元素 ${r.output}`));
    }
    return out;
  },

  reachability(c) {
    return c.elementList
      .filter((e) => !c.tiers.has(e.id))
      .map((e) => error('unreachable', `元素 ${e.id}（${e.name}）無法從起始元素合成出來`));
  },

  deadInputs(c) {
    // 材料本身無法取得的配方永遠不會被觸發
    return c.recipes
      .filter((r) => c.tiers.has(r.output) && r.inputs.some((i) => c.elements.has(i) && !c.tiers.has(i)))
      .map((r) => warning('dead-recipe', `配方 ${r.key} 含有無法取得的材料`));
  },

  achievements(c) {
    const out: Issue[] = [];
    for (const a of c.achievements) {
      if (!a.name || !a.desc) out.push(error('achievement-fields', `成就 ${a.id} 缺少名稱或描述`));
      const cond = a.condition;
      if (cond.type === 'element' && !c.elements.has(cond.element)) {
        out.push(error('achievement-ref', `成就 ${a.id} 引用了不存在的元素 ${cond.element}`));
      }
      if (cond.type === 'category' && !c.categories.some((x) => x.id === cond.category)) {
        out.push(error('achievement-ref', `成就 ${a.id} 引用了不存在的分類 ${cond.category}`));
      }
      if (cond.type === 'count' && cond.n > c.elementList.length) {
        out.push(error('achievement-count', `成就 ${a.id} 需要 ${cond.n} 個元素，但總共只有 ${c.elementList.length} 個`));
      }
    }
    return out;
  },
};

export function validate(content: Content): Issue[] {
  return Object.values(RULES).flatMap((rule) => rule(content));
}

/** 內容統計，供驗證報告參考。 */
export function contentStats(c: Content) {
  const arity = new Map<number, number>();
  for (const r of c.recipes) arity.set(r.inputs.length, (arity.get(r.inputs.length) ?? 0) + 1);
  const deadEnds = c.elementList.filter((e) => !c.recipesByInput.has(e.id)).length;
  const maxTier = Math.max(0, ...c.tiers.values());
  const byCategory = new Map<string, number>();
  for (const e of c.elementList) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
  return {
    elements: c.elementList.length,
    recipes: c.recipes.length,
    arity: Object.fromEntries([...arity].sort((a, b) => a[0] - b[0])),
    deadEnds,
    maxTier,
    byCategory: Object.fromEntries(byCategory),
    achievements: c.achievements.length,
  };
}
