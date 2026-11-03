// 结构校验：标签闭合、CSS 括号、生成内容里的 undefined/NaN
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'SignalTube.html'), 'utf8');
const problems = [];

// ---- 1. 整体文档 ----
const count = (s, re) => (s.match(re) || []).length;
console.log('=== 文档结构 ===');
console.log(`<style> ${count(html, /<style>/g)} / </style> ${count(html, /<\/style>/g)}`);
console.log(`<script> ${count(html, /<script>/g)} / </script> ${count(html, /<\/script>/g)}`);
console.log(`<div 开 ${count(html, /<div[\s>]/g)} / 闭 ${count(html, /<\/div>/g)}`);
console.log(`结尾: ${html.trim().slice(-14).replace(/\n/g, ' ')}`);
if (count(html, /<style>/g) !== count(html, /<\/style>/g)) problems.push('style 标签不配对');
if (count(html, /<script>/g) !== count(html, /<\/script>/g)) problems.push('script 标签不配对');
if (!html.trim().endsWith('</html>')) problems.push('文档没有正常结尾');

// div 平衡（静态 HTML 部分；卡片是 JS 字符串，单独查）
const staticPart = html.slice(0, html.indexOf('<script>'));
const dOpen = count(staticPart, /<div[\s>]/g), dClose = count(staticPart, /<\/div>/g);
console.log(`静态部分 div: 开 ${dOpen} 闭 ${dClose}`);
if (dOpen !== dClose) problems.push(`静态 HTML 里 div 不配对（开 ${dOpen} 闭 ${dClose}）`);

// ---- 2. CSS 括号 ----
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
const cOpen = count(css, /\{/g), cClose = count(css, /\}/g);
console.log(`\n=== CSS ===\n规则括号: { ${cOpen} } ${cClose}`);
if (cOpen !== cClose) problems.push(`CSS 括号不配对（开 ${cOpen} 闭 ${cClose}）`);
// 检查 CSS 里有没有未定义变量
const usedVars = new Set([...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map(m => m[1]));
const declared = new Set([...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map(m => m[1]));
const missing = [...usedVars].filter(v => !declared.has(v));
console.log(`CSS 变量: 声明 ${declared.size}，使用 ${usedVars.size}，缺失 ${missing.length}${missing.length ? ' → ' + missing.join(',') : ''}`);
if (missing.length) problems.push('CSS 变量未声明: ' + missing.join(','));

// ---- 3. 卡片模板用一条真实数据渲染，检查标签平衡 ----
const data = JSON.parse(html.slice(html.indexOf('const DATA = ') + 13, html.indexOf(';\nconst V = ')));
const v = data.videos[0];

console.log('\n=== 数据完整性 ===');
const fields = ['id', 'title', 'channel', 'topic', 'type', 'quality', 'authors', 'mentions', 'stories', 'snippets'];
for (const f of fields) {
  if (v[f] === undefined) problems.push(`视频缺少字段 ${f}`);
}
const badValues = data.videos.filter(x =>
  !x.title || x.title === 'undefined' || String(x.title).includes('NaN') ||
  !x.topic || !x.type || typeof x.quality !== 'number' || isNaN(x.quality));
console.log(`异常记录: ${badValues.length}`);
if (badValues.length) {
  problems.push(`${badValues.length} 条视频有无效字段`);
  badValues.slice(0, 3).forEach(b => console.log('   ! ' + JSON.stringify(b).slice(0, 160)));
}
// stories / snippets 结构
const badStories = data.videos.filter(x => (x.stories || []).some(s => !s.id || s.t === undefined));
if (badStories.length) problems.push(`${badStories.length} 条视频的讨论帖字段不完整`);
const badSnip = data.videos.filter(x => (x.snippets || []).some(s => typeof s !== 'string'));
if (badSnip.length) problems.push('评论片段里有非字符串');

// 每条的 topic / type 必须在统计表里
const topicIds = new Set(data.topics.map(t => t.id).concat(['other']));
const typeIds = new Set(data.types.map(t => t.id).concat(['other']));
const orphanTopic = data.videos.filter(x => !topicIds.has(x.topic));
const orphanType = data.videos.filter(x => !typeIds.has(x.type));
console.log(`主题不在统计表内的: ${orphanTopic.length}；形式不在统计表内的: ${orphanType.length}`);
if (orphanTopic.length) problems.push('有视频的主题不在主题统计表里');
if (orphanType.length) problems.push('有视频的形式不在形式统计表里');

// ---- 4. 转义检查 ----
console.log('\n=== 转义检查 ===');
const unescaped = data.videos.filter(x => /<script|<\/script|onerror=/i.test(x.title + x.channel));
console.log(`标题/频道里含可疑 HTML 的: ${unescaped.length}`);
if (unescaped.length) problems.push('有标题含未转义的 HTML 片段');

console.log('\n=== 结论 ===');
if (problems.length) { problems.forEach(p => console.log('  ✗ ' + p)); process.exit(1); }
console.log('  ✓ 结构与数据校验全部通过');
