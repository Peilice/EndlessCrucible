export type ElementId = string;

/** 全域遊戲設定（content/game.yaml）。 */
export interface GameConfig {
  /** 練成台元素框數量。 */
  slots: number;
  /** 一組配方最少材料數。 */
  minInputs: number;
  /** 一組配方最多材料數（不可超過 slots）。 */
  maxInputs: number;
  /** 依序載入的內容包 id。 */
  packs: string[];
  locale: string;
  hints: {
    initial: number;
    perDiscoveries: number;
  };
}

export interface CategoryDef {
  id: string;
  name: string;
  emoji: string;
}

export interface ElementDef {
  id: ElementId;
  name: string;
  emoji: string;
  desc: string;
  category: string;
  /** 來源內容包。 */
  pack: string;
}

export interface Recipe {
  /** 已排序的材料 id。 */
  inputs: ElementId[];
  output: ElementId;
  /** 排序後材料以 `+` 串接，作為查詢鍵。 */
  key: string;
  pack: string;
}

export type AchievementCondition =
  | { type: 'count'; n: number }
  | { type: 'complete' }
  | { type: 'category'; category: string }
  | { type: 'element'; element: ElementId };

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  emoji: string;
  condition: AchievementCondition;
  reward: { hints: number };
  pack: string;
}

/** 合併所有內容包並建好索引後的遊戲內容。 */
export interface Content {
  config: GameConfig;
  bases: ElementId[];
  elements: Map<ElementId, ElementDef>;
  /** 依載入順序排列。 */
  elementList: ElementDef[];
  categories: CategoryDef[];
  recipes: Recipe[];
  recipesByKey: Map<string, Recipe>;
  recipesByInput: Map<ElementId, Recipe[]>;
  recipesByOutput: Map<ElementId, Recipe[]>;
  achievements: AchievementDef[];
  /** 從起始元素出發的最短合成深度；無法抵達的元素不在表中。 */
  tiers: Map<ElementId, number>;
}

export interface Issue {
  level: 'error' | 'warning';
  rule: string;
  message: string;
}
