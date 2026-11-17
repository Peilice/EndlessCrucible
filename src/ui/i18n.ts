let strings: Record<string, string> = {};

export function setStrings(s: Record<string, string>) {
  strings = s;
}

/** 取介面文字，{name} 會被代入。找不到時回傳 key 以便察覺遺漏。 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = strings[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
