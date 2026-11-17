import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { SaveError, decodeSaveCode, encodeSaveCode, newSave, normalizeSave } from './save';
import { testContent } from './testing';

const content = testContent().content;

describe('存檔', () => {
  it('存檔碼可以來回轉換', async () => {
    const g = new Game(content);
    await g.craft(['a', 'b']);
    await g.craft(['a', 'a']);
    const code = encodeSaveCode(g.data);
    expect(code.startsWith('EC1.')).toBe(true);
    expect(decodeSaveCode(code, content)).toEqual(g.data);
  });

  it('容忍存檔碼中的換行與空白', () => {
    const code = encodeSaveCode(newSave(content));
    const spaced = `  ${code.slice(0, 10)}\n${code.slice(10)}  `;
    expect(decodeSaveCode(spaced, content).discovered).toEqual(['a', 'b']);
  });

  it('拒絕錯誤的存檔碼', () => {
    expect(() => decodeSaveCode('hello', content)).toThrow(SaveError);
    expect(() => decodeSaveCode('EC1.!!!', content)).toThrow(SaveError);
  });

  it('拒絕較新版本的存檔', () => {
    expect(() => normalizeSave({ ...newSave(content), version: 99 }, content)).toThrow(SaveError);
  });

  it('忽略內容中已不存在的元素、補回起始元素、清掉已變成合法配方的失敗紀錄', () => {
    const save = normalizeSave(
      { ...newSave(content), discovered: ['c', 'removed'], failed: ['a+b', 'a+a'] },
      content,
    );
    expect(save.discovered).toEqual(['a', 'b', 'c']);
    expect(save.failed).toEqual(['a+a']);
  });

  it('修補缺漏或錯誤的欄位', () => {
    const save = normalizeSave({ version: 1, hints: { available: -5 }, stats: null }, content);
    expect(save.hints.available).toBe(content.config.hints.initial);
    expect(save.stats.attempts).toBe(0);
    expect(save.settings.muted).toBe(false);
  });
});
