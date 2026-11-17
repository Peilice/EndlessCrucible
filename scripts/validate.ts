/**
 * 內容驗證：npm run validate
 * 有任何 error 時以非零狀態結束，CI 會因此停止部署。
 */
import { loadContent } from '../src/content';
import { contentStats, validate } from '../src/core/validate';

const { content, issues: loadIssues } = loadContent();
const issues = [...loadIssues, ...validate(content)];
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

for (const i of errors) console.error(`✖ [${i.rule}] ${i.message}`);
for (const i of warnings) console.warn(`⚠ [${i.rule}] ${i.message}`);

const s = contentStats(content);
const total = s.recipes || 1;
console.log('\n內容統計');
console.log(`  元素：${s.elements}（最深階層 ${s.maxTier}，無後續配方的終端元素 ${s.deadEnds}）`);
console.log(
  `  配方：${s.recipes}（${Object.entries(s.arity)
    .map(([n, c]) => `${n} 材料 ${c} 組 ${Math.round((c / total) * 100)}%`)
    .join('、')}）`,
);
console.log(`  分類：${Object.entries(s.byCategory).map(([k, v]) => `${k} ${v}`).join('、')}`);
console.log(`  成就：${s.achievements}`);
console.log(`\n${errors.length} 個錯誤、${warnings.length} 個警告`);

if (errors.length > 0) process.exit(1);
