import { buildContent, type RawPack } from '../core/content';
import type { GameConfig } from '../core/types';
import gameConfig from '../../content/game.yaml';

/**
 * 建置期把 content/ 下所有 YAML 打包進來。
 * 每個內容包是一個資料夾：pack.yaml + elements.yaml + recipes.yaml + achievements.yaml。
 */
const files = import.meta.glob<unknown>('../../content/packs/*/*.yaml', { eager: true, import: 'default' });
const locales = import.meta.glob<Record<string, string>>('../../content/locales/*.yaml', {
  eager: true,
  import: 'default',
});

export const config = gameConfig as GameConfig;

export function rawPacks(): RawPack[] {
  const byPack = new Map<string, Record<string, unknown>>();
  for (const [path, data] of Object.entries(files)) {
    const m = /packs\/([^/]+)\/([^/]+)\.yaml$/.exec(path);
    if (!m) continue;
    const [, packId, file] = m as unknown as [string, string, string];
    const entry = byPack.get(packId) ?? {};
    entry[file] = data;
    byPack.set(packId, entry);
  }
  return config.packs.map((id) => {
    const f = byPack.get(id);
    if (!f?.pack) throw new Error(`找不到內容包 ${id}（content/packs/${id}/pack.yaml）`);
    return {
      pack: { ...(f.pack as RawPack['pack']), id },
      elements: (f.elements as RawPack['elements']) ?? [],
      recipes: (f.recipes as RawPack['recipes']) ?? [],
      achievements: (f.achievements as RawPack['achievements']) ?? [],
    };
  });
}

export function loadContent() {
  return buildContent(config, rawPacks());
}

export function loadStrings(locale = config.locale): Record<string, string> {
  const entry = Object.entries(locales).find(([p]) => p.endsWith(`/${locale}.yaml`));
  if (!entry) throw new Error(`找不到語系 ${locale}`);
  return entry[1];
}
