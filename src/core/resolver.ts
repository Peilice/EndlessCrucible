import { recipeKey } from './content';
import type { Content, ElementId } from './types';

/**
 * 配方查詢介面。刻意設計成非同步，未來可以接上 AI 生成或遠端共用配方庫。
 * 回傳 null 表示「無反應」。
 */
export interface RecipeResolver {
  resolve(inputs: readonly ElementId[]): Promise<ElementId | null>;
}

/** 第一版：查內容包裡的靜態配方表。 */
export class StaticResolver implements RecipeResolver {
  constructor(private readonly content: Content) {}

  async resolve(inputs: readonly ElementId[]): Promise<ElementId | null> {
    return this.content.recipesByKey.get(recipeKey(inputs))?.output ?? null;
  }
}

/** 依序詢問多個 resolver，第一個有答案的勝出（例如：靜態表 → AI）。 */
export class ChainResolver implements RecipeResolver {
  constructor(private readonly resolvers: readonly RecipeResolver[]) {}

  async resolve(inputs: readonly ElementId[]): Promise<ElementId | null> {
    for (const r of this.resolvers) {
      const out = await r.resolve(inputs);
      if (out !== null) return out;
    }
    return null;
  }
}
