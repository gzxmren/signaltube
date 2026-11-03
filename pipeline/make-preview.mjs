// 生成一个只含少量数据的预览版，用于肉眼/截图检查版式
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'SignalTube.html'), 'utf8');
const start = html.indexOf('const DATA = ');
const end = html.indexOf(';\nconst V = ');
const data = JSON.parse(html.slice(start + 'const DATA = '.length, end));

const keep = 9;
data.videos = data.videos.slice(0, keep);
data.stats.videos = keep;
// 主题统计按实际保留的重新算
const counts = new Map();
data.videos.forEach(v => counts.set(v.topic, (counts.get(v.topic) || 0) + 1));
data.topics = data.topics.filter(t => counts.has(t.id)).map(t => ({ ...t, count: counts.get(t.id) }));
const tcounts = new Map();
data.videos.forEach(v => tcounts.set(v.type, (tcounts.get(v.type) || 0) + 1));
data.types = data.types.filter(t => tcounts.has(t.id)).map(t => ({ ...t, count: tcounts.get(t.id) }));

const small = html.slice(0, start + 'const DATA = '.length) + JSON.stringify(data) + html.slice(end);
fs.writeFileSync(path.join(ROOT, 'preview-small.html'), small);
console.log('已生成 preview-small.html（' + keep + ' 条数据）');
