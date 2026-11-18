import type { Content, ElementId } from './types';

export const SAVE_VERSION = 1;

export interface ActiveHint {
  recipeKey: string;
  /** 1～3，數字越大揭露越多。 */
  level: number;
}

export interface SaveData {
  version: number;
  /** 依發現順序排列。 */
  discovered: ElementId[];
  /** 失敗過的組合鍵。 */
  failed: string[];
  achievements: string[];
  hints: {
    available: number;
    /** 距離下一次提示已累積的新發現數。 */
    progress: number;
    active: ActiveHint | null;
  };
  stats: {
    attempts: number;
    playMs: number;
    startedAt: number;
  };
  settings: {
    muted: boolean;
  };
}

export function newSave(content: Content, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    discovered: [...content.bases],
    failed: [],
    achievements: [],
    hints: { available: content.config.hints.initial, progress: 0, active: null },
    stats: { attempts: 0, playMs: 0, startedAt: now },
    settings: { muted: false },
  };
}

/**
 * 存檔版本遷移。鍵為「來源版本」，函式把資料升級到下一版。
 * 例：未來 v2 時加入 `1: (d) => ({ ...d, version: 2, newField: ... })`。
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

export class SaveError extends Error {}

/** 把任意來源的存檔資料遷移到最新版，並與目前內容對齊。 */
export function normalizeSave(raw: unknown, content: Content): SaveData {
  if (!raw || typeof raw !== 'object') throw new SaveError('存檔碼格式不對');
  let data = raw as Record<string, unknown>;
  let version = typeof data.version === 'number' ? data.version : NaN;
  if (!Number.isInteger(version) || version < 1) throw new SaveError('這串存檔碼不完整');
  if (version > SAVE_VERSION) throw new SaveError('這串存檔碼來自比較新的版本，請先更新遊戲');
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new SaveError(`缺少 v${version} 的遷移程式`);
    data = migrate(data);
    version += 1;
  }

  const fresh = newSave(content);
  const d = data as Partial<SaveData>;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);

  // 內容調整後，已不存在的元素直接略過；起始元素永遠在
  const discovered = [...new Set([...content.bases, ...strings(d.discovered).filter((id) => content.elements.has(id))])];
  const active = d.hints?.active;
  return {
    version: SAVE_VERSION,
    discovered,
    failed: [...new Set(strings(d.failed))].filter((k) => !content.recipesByKey.has(k)),
    achievements: strings(d.achievements).filter((id) => content.achievements.some((a) => a.id === id)),
    hints: {
      available: num(d.hints?.available, fresh.hints.available),
      progress: num(d.hints?.progress, 0),
      active:
        active && typeof active.recipeKey === 'string' && content.recipesByKey.has(active.recipeKey)
          ? { recipeKey: active.recipeKey, level: Math.min(3, Math.max(1, num(active.level, 1))) }
          : null,
    },
    stats: {
      attempts: num(d.stats?.attempts, 0),
      playMs: num(d.stats?.playMs, 0),
      startedAt: num(d.stats?.startedAt, fresh.stats.startedAt),
    },
    settings: { muted: d.settings?.muted === true },
  };
}

const CODE_PREFIX = 'EC1.';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 存檔碼：`EC1.` + base64(JSON)。前綴中的數字是存檔碼格式版本。 */
export function encodeSaveCode(save: SaveData): string {
  return CODE_PREFIX + toBase64(JSON.stringify(save));
}

export function decodeSaveCode(code: string, content: Content): SaveData {
  const trimmed = code.trim().replace(/\s+/g, '');
  if (!trimmed.startsWith(CODE_PREFIX)) throw new SaveError('這不是無垠鍊成的存檔碼');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64(trimmed.slice(CODE_PREFIX.length)));
  } catch {
    throw new SaveError('存檔碼不完整或有錯字，請重新複製一次');
  }
  return normalizeSave(parsed, content);
}
