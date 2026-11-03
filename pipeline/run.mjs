// 一键跑完整条流水线：抓取 → 补元数据 → 分类打分 → 生成 HTML
// 每个阶段都有缓存，重复执行只会补抓新增的部分
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const here = import.meta.dirname;
const stages = [
  ['collect.mjs', '抓 Hacker News 评论并聚合'],
  ['enrich.mjs', '补全视频元数据'],
  ['build.mjs', '分类打分'],
  ['emit.mjs', '生成门户页面'],
];

const t0 = Date.now();
for (const [file, label] of stages) {
  console.log(`\n${'='.repeat(56)}\n${label}\n${'='.repeat(56)}`);
  const r = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n${file} 失败，退出码 ${r.status}，流水线中止`);
    process.exit(r.status || 1);
  }
}
console.log(`\n全部完成，耗时 ${Math.round((Date.now() - t0) / 1000)} 秒`);
console.log('打开 SignalTube.html 即可');
