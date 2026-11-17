import { describe, expect, it } from 'vitest';
import { buildContent, parseRecipeLine, recipeKey } from './content';
import { TEST_CONFIG, testContent, testPack } from './testing';
import { validate } from './validate';
import { loadContent } from '../content';

describe('配方解析', () => {
  it('解析兩材料與三材料', () => {
    expect(parseRecipeLine('water + fire = steam')).toEqual({ inputs: ['water', 'fire'], output: 'steam' });
    expect(parseRecipeLine(' a+b +c=d ')).toEqual({ inputs: ['a', 'b', 'c'], output: 'd' });
  });

  it('拒絕格式錯誤', () => {
    expect(parseRecipeLine('water fire = steam')).toBeNull();
    expect(parseRecipeLine('water + fire')).toBeNull();
  });

  it('配方鍵不分順序', () => {
    expect(recipeKey(['fire', 'water'])).toBe(recipeKey(['water', 'fire']));
    expect(recipeKey(['b', 'a', 'a'])).toBe('a+a+b');
  });
});

describe('buildContent', () => {
  it('建立索引與階層', () => {
    const { content, issues } = testContent();
    expect(issues).toEqual([]);
    expect(content.recipesByKey.get('a+b')?.output).toBe('c');
    expect(content.tiers.get('a')).toBe(0);
    expect(content.tiers.get('c')).toBe(1);
    expect(content.tiers.get('e')).toBe(2);
    expect(content.tiers.get('f')).toBe(3);
  });

  it('偵測重複配方與重複元素', () => {
    const { issues } = testContent({
      recipes: ['a + b = c', 'b + a = d'],
      elements: [...testPack().elements!, { id: 'a', name: 'dup', emoji: '•', desc: 'x', category: 'c' }],
    });
    expect(issues.map((i) => i.rule).sort()).toEqual(['duplicate-element', 'duplicate-recipe']);
  });

  it('後載入的內容包可以擴充元素與配方', () => {
    const extra = {
      pack: { id: 'extra' },
      elements: [{ id: 'g', name: 'G', emoji: '•', desc: 'g', category: 'c' }],
      recipes: ['f + a = g'],
    };
    const { content, issues } = buildContent({ ...TEST_CONFIG, packs: ['test', 'extra'] }, [testPack(), extra]);
    expect(issues).toEqual([]);
    expect(content.elements.get('g')?.pack).toBe('extra');
    expect(content.tiers.get('g')).toBe(4);
  });
});

describe('validate', () => {
  it('測試內容沒有問題', () => {
    expect(validate(testContent().content)).toEqual([]);
  });

  it('抓出無法抵達的元素、未知引用與材料數超限', () => {
    const { content } = testContent({
      elements: [...testPack().elements!, { id: 'z', name: 'Z', emoji: '•', desc: 'z', category: 'c' }],
      recipes: ['a + b = c', 'c + c = d', 'a + b + c = e', 'd + e = f', 'a + nope = f', 'a + a + a + a = d'],
    });
    const rules = validate(content).map((i) => i.rule);
    expect(rules).toContain('unreachable');
    expect(rules).toContain('recipe-ref');
    expect(rules).toContain('recipe-arity');
  });

  it('框數小於最大材料數時報錯', () => {
    const { content } = testContent({}, { ...TEST_CONFIG, slots: 2 });
    expect(validate(content).map((i) => i.rule)).toContain('config');
  });
});

describe('正式內容', () => {
  it('沒有任何錯誤', () => {
    const { content, issues } = loadContent();
    const errors = [...issues, ...validate(content)].filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
    expect(content.elementList.length).toBeGreaterThanOrEqual(150);
  });
});
