import { buildContent, type RawPack } from './content';
import type { GameConfig } from './types';

export const TEST_CONFIG: GameConfig = {
  slots: 3,
  minInputs: 2,
  maxInputs: 3,
  packs: ['test'],
  locale: 'zh-TW',
  hints: { initial: 1, perDiscoveries: 2 },
};

const el = (id: string, category = 'c') => ({ id, name: id.toUpperCase(), emoji: '•', desc: id, category });

/** 小型測試內容：a、b 起始；a+b=c、c+c=d、a+b+c=e、d+e=f。 */
export function testPack(overrides: Partial<RawPack> = {}): RawPack {
  return {
    pack: { id: 'test', bases: ['a', 'b'], categories: [{ id: 'c', name: 'C', emoji: '•' }, { id: 'x', name: 'X', emoji: '•' }] },
    elements: [el('a'), el('b'), el('c'), el('d', 'x'), el('e', 'x'), el('f')],
    recipes: ['a + b = c', 'c + c = d', 'a + b + c = e', 'd + e = f'],
    achievements: [
      { id: 'n4', name: 'N4', desc: 'd', condition: { type: 'count', n: 4 }, reward: { hints: 1 } },
      { id: 'catx', name: 'X', desc: 'd', condition: { type: 'category', category: 'x' }, reward: { hints: 0 } },
    ],
    ...overrides,
  };
}

export function testContent(overrides: Partial<RawPack> = {}, config: GameConfig = TEST_CONFIG) {
  return buildContent(config, [testPack(overrides)]);
}
