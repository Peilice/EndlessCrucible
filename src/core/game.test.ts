import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { ChainResolver, type RecipeResolver } from './resolver';
import { testContent } from './testing';

const setup = () => new Game(testContent().content);

describe('鍊成', () => {
  it('新發現、已知、失敗', async () => {
    const g = setup();
    const r1 = await g.craft(['b', 'a']);
    expect(r1.kind).toBe('new');
    expect(g.isDiscovered('c')).toBe(true);

    const r2 = await g.craft(['a', 'b']);
    expect(r2).toMatchObject({ kind: 'known', output: { id: 'c' } });

    const r3 = await g.craft(['a', 'a']);
    expect(r3).toEqual({ kind: 'fail', repeated: false });
    expect(g.wasFailed(['a', 'a'])).toBe(true);
    expect(await g.craft(['a', 'a'])).toEqual({ kind: 'fail', repeated: true });
    expect(g.data.stats.attempts).toBe(4);
  });

  it('已合成過的組合可事先得知產物', async () => {
    const g = setup();
    expect(g.knownOutput(['a', 'b'])).toBeNull();
    await g.craft(['a', 'b']);
    expect(g.knownOutput(['b', 'a'])?.id).toBe('c');
    expect(g.knownOutput(['a', 'a'])).toBeNull();
    expect(g.knownOutput(['a'])).toBeNull();
  });

  it('三材料配方', async () => {
    const g = setup();
    await g.craft(['a', 'b']);
    expect((await g.craft(['c', 'b', 'a'])).kind).toBe('new');
    expect(g.isDiscovered('e')).toBe(true);
  });

  it('材料數不符或使用未發現元素時無效', async () => {
    const g = setup();
    expect(await g.craft(['a'])).toEqual({ kind: 'invalid', reason: 'arity' });
    expect(await g.craft(['a', 'b', 'a', 'b'])).toEqual({ kind: 'invalid', reason: 'arity' });
    expect(await g.craft(['c', 'c'])).toEqual({ kind: 'invalid', reason: 'unknown' });
    expect(g.data.stats.attempts).toBe(0);
  });

  it('已用盡判定', async () => {
    const g = setup();
    expect(g.isExhausted('a')).toBe(false);
    await g.craft(['a', 'b']);
    await g.craft(['a', 'b', 'c']);
    expect(g.isExhausted('a')).toBe(true);
    expect(g.isExhausted('c')).toBe(false); // c + c = d 還沒做
    expect(g.isExhausted('f')).toBe(true); // 沒有後續配方
  });

  it('可以換成其他 resolver（例如未來的 AI）', async () => {
    const ai: RecipeResolver = { resolve: async (inputs) => (inputs.join() === 'a,a' ? 'd' : null) };
    const content = testContent().content;
    const g = new Game(content, undefined, new ChainResolver([{ resolve: async () => null }, ai]));
    expect(await g.craft(['a', 'a'])).toMatchObject({ kind: 'new', output: { id: 'd' } });
  });
});

describe('提示與成就', () => {
  it('每發現 N 個新元素獲得提示，成就也會給提示', async () => {
    const g = setup(); // initial 1、perDiscoveries 2
    await g.craft(['a', 'b']); // 第 3 個元素
    expect(g.data.hints.available).toBe(1);
    const r = await g.craft(['c', 'c']); // 第 4 個，滿 2 個 +1，成就 n4 +1
    expect(r.kind === 'new' && r.hintsGained).toBe(2);
    expect(r.kind === 'new' && r.achievements.map((a) => a.id)).toEqual(['n4']);
    expect(g.data.hints.available).toBe(3);
  });

  it('分類成就', async () => {
    const g = setup();
    await g.craft(['a', 'b']);
    await g.craft(['c', 'c']);
    const r = await g.craft(['a', 'b', 'c']);
    expect(r.kind === 'new' && r.achievements.map((a) => a.id)).toEqual(['catx']);
  });

  it('提示只指向材料已齊全的配方，並分層揭露', async () => {
    const g = setup();
    const req = g.requestHint();
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    expect(req.hint.recipe.output).toBe('c');
    expect(req.hint.revealed.map((e) => e.id)).toEqual(['a']);
    expect(g.data.hints.available).toBe(0);

    // 已有進行中的提示時不重複扣次數
    expect(g.requestHint().ok).toBe(true);
    expect(g.data.hints.available).toBe(0);

    expect(g.advanceHint()?.revealed.length).toBe(2);
    const last = g.advanceHint();
    expect(last?.level).toBe(3);
    expect(last?.outputRevealed).toBe(true);

    await g.craft(['a', 'b']);
    expect(g.currentHint()).toBeNull();
    expect(g.data.hints.active).toBeNull();
  });

  it('沒有次數或沒有候選時拒絕', async () => {
    const g = setup();
    g.requestHint();
    await g.craft(['a', 'b']);
    expect(g.requestHint()).toEqual({ ok: false, reason: 'no-hints' });
  });
});
