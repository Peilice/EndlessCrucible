import { normalizeSave, type SaveData } from '../core/save';
import type { Content } from '../core/types';

const KEY = 'endless-crucible:save';

export function loadSave(content: Content): SaveData | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    return normalizeSave(JSON.parse(raw), content);
  } catch (e) {
    console.warn('讀取存檔失敗，將開始新遊戲', e);
    return undefined;
  }
}

export function writeSave(save: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch (e) {
    console.warn('寫入存檔失敗', e);
  }
}
