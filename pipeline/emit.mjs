// 把 catalog.json 注入模板，产出单个自包含 HTML 文件
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(import.meta.dirname, 'portal.template.html'), 'utf8');

// 安全内联：转义 < 防止提前闭合 script
const json = JSON.stringify(catalog)
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

// 用函数做替换，避免 JSON 里的 $& / $' 被当成替换模式
const html = tpl.replace('/*__CATALOG__*/', () => json);
const out = path.join(ROOT, 'SignalTube.html');
fs.writeFileSync(out, html, 'utf8');

// 回读校验：内联的 JSON 必须能被原样解析回来
const back = fs.readFileSync(out, 'utf8');
const start = back.indexOf('const DATA = ');
const end = back.indexOf(';\nconst V = ');
if (start < 0 || end < 0) throw new Error('模板占位符没有被替换');
const parsed = JSON.parse(back.slice(start + 'const DATA = '.length, end));
if (parsed.videos.length !== catalog.videos.length) throw new Error('内联数据条数不一致，可能被替换模式破坏');

const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`已生成 ${out}`);
console.log(`  文件大小 ${mb} MB · ${parsed.videos.length} 个视频 · ${parsed.topics.length} 个主题（内联数据回读校验通过）`);

// 同步一份到 public/（Cloudflare Pages 部署目录，index.html 即首页）
const pubDir = path.join(ROOT, 'public');
fs.mkdirSync(pubDir, { recursive: true });
fs.writeFileSync(path.join(pubDir, 'index.html'), html, 'utf8');
console.log(`已同步 public/index.html（部署用）`);
