// 抽样检查：每个主题随机看几条，人工判断分类准不准
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
const nameOf = new Map(cat.topics.map(t => [t.id, t.name]));

const per = Number(process.argv[2] || 3);
const only = process.argv[3];

for (const t of cat.topics) {
  if (only && t.id !== only) continue;
  const items = cat.videos.filter(v => v.topic === t.id).slice(0, per);
  console.log(`\n=== ${t.name} (${t.count}) ===`);
  for (const v of items) {
    const d = v.durationSec ? `${Math.round(v.durationSec / 60)}分` : '时长未知';
    console.log(`  [${v.type}] ${v.title.slice(0, 70)} | ${v.channel} | ${d} | ${v.authors}人 | kw:${v.topicScore}`);
  }
}

console.log('\n--- 类型分布 ---');
cat.types.forEach(t => console.log(`  ${String(t.count).padStart(4)}  ${t.name}`));

console.log('\n--- 质量抽查：推荐人数最多的 10 条 ---');
cat.videos.slice().sort((a, b) => b.authors - a.authors).slice(0, 10).forEach(v =>
  console.log(`  ${String(v.authors).padStart(3)}人 | ${nameOf.get(v.topic)} | ${v.title.slice(0, 60)}`));
