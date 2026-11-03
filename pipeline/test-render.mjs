// 冒烟测试：把 SignalTube.html 里的脚本抠出来，用最小 DOM 桩跑一遍真实渲染
// 目的：抓运行时报错、验证卡片/侧栏/弹窗实际生成的 HTML 是否正确
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'SignalTube.html'), 'utf8');
const code = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));

const errors = [];
const warnings = [];

// ---- 最小 DOM 桩 ----
const store = new Map();
function makeEl(id) {
  const el = {
    id, _html: '', textContent: '', style: {}, dataset: {}, value: '', scrollTop: 0, className: '',
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    set onclick(f) { this._onclick = f; },
    get onclick() { return this._onclick; },
    set oninput(f) { this._oninput = f; },
    get oninput() { return this._oninput; },
    set onchange(f) { this._onchange = f; },
    get onchange() { return this._onchange; },
    set onload(f) { this._onload = f; },
    get onload() { return this._onload; },
    classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    appendChild() { },
    focus() { },
    closest() { return null; },
  };
  return el;
}
const els = new Map();
for (const id of ['tabs', 'sidebar', 'statbar', 'viewTitle', 'viewDesc', 'count', 'content', 'playAllBtn',
  'q', 'thumbBtn', 'tbtn', 'tasteBtn', 'thumbLabel', 'panel', 'sliders', 'resetTaste', 'genDate',
  'modal', 'frame', 'fallback', 'mTitle', 'mStats', 'mActions', 'mWhy', 'mStories', 'mKw', 'mKwWrap', 'mClose', 'warnbar', 'more']) {
  els.set(id, makeEl(id));
}

// durSel / sortSel 是渲染侧栏时动态生成的，桩件不解析 innerHTML，允许缺失
const DYNAMIC_IDS = new Set(['durSel', 'sortSel', 'more']);
const documentStub = {
  getElementById: (id) => {
    if (!els.has(id)) {
      if (!DYNAMIC_IDS.has(id)) errors.push('缺少元素 #' + id);
      els.set(id, makeEl(id));
    }
    return els.get(id);
  },
  querySelectorAll: () => [],
  addEventListener: () => { },
  activeElement: null,
  body: { style: {} },
};
const windowStub = { scrollTo() { }, open() { } };
const localStorageStub = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => store.set(k, v),
};

// ---- 执行 ----
let sandbox = null;
try {
  const fn = new Function('document', 'window', 'localStorage', 'setTimeout', 'clearTimeout', 'fetch', code + '\n;return {DATA, V, render, cardHTML, state, VIEWS_SHOWN};');
  sandbox = fn(documentStub, windowStub, localStorageStub, (f) => 0, () => { }, () => { throw new Error('离线测试不应发请求'); });
} catch (e) {
  console.error('脚本执行失败：', e.message);
  console.error(e.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
}

const { DATA, V, state, VIEWS_SHOWN } = sandbox;

// ---- 断言 ----
const content = els.get('content').innerHTML;
const cards = (content.match(/class="card"/g) || []).length;
console.log(`数据：${V.length} 个视频，${DATA.topics.length} 个主题，${DATA.types.length} 个形式`);
console.log(`可见视图：${VIEWS_SHOWN.map(v => v.name).join(' / ')}`);
console.log(`首屏卡片数：${cards}${cards > 0 ? ' ✓' : ' ✗'}`);
console.log(`结果计数文案：${els.get('count').textContent || '(空)'}`);
console.log(`侧栏主题数：${(els.get('sidebar').innerHTML.match(/class="frow/g) || []).length}`);
console.log(`顶部标签数：${(els.get('tabs').innerHTML.match(/class="tab/g) || []).length}`);

if (cards === 0) errors.push('首屏没有渲染出任何卡片');
if (!els.get('content').innerHTML.includes('i.ytimg.com')) warnings.push('卡片里没有缩略图 URL');

// 检查卡片结构完整性
const sample = content.slice(0, content.indexOf('</div>') + 6);
if (!/<h4>/.test(content)) errors.push('卡片缺少标题节点');
if (!/class="dur"/.test(content)) warnings.push('没有任何卡片显示时长（数据缺失时会这样）');
if (!/人推荐/.test(content)) errors.push('卡片缺少推荐人数');
if (!/class="pill/.test(content)) errors.push('卡片缺少主题/形式标签');

// 检查是否残留模板占位符或未替换内容
if (html.includes('/*__CATALOG__*/')) errors.push('HTML 里还残留模板占位符');

// 抽查几张卡片的实际内容
console.log('\n--- 首屏前 3 张卡片 ---');
const blocks = content.split('<div class="card"').slice(1, 4);
for (const b of blocks) {
  const title = (b.match(/<h4>([^<]*)<\/h4>/) || [])[1] || '(无标题)';
  const ch = (b.match(/class="ch">([^<]*)/) || [])[1] || '';
  const pills = [...b.matchAll(/class="pill[^"]*">([^<]*)</g)].map(m => m[1]).join(' / ');
  const sig = (b.match(/class="sig">([^<]*)</) || [])[1] || '';
  console.log(`  ${title.slice(0, 46)} | ${ch.slice(0, 22)} | ${pills} | ${sig}`);
}

// 测试筛选：按第一个主题过滤（首屏有 60 条上限，所以要比较结果总数而不是卡片数）
const firstTopic = DATA.topics[0].id;
const expected = DATA.topics[0].count;
state.topics = new Set([firstTopic]);
sandbox.render();
const filtered = (els.get('content').innerHTML.match(/class="card"/g) || []).length;
const countText = els.get('count').textContent;
console.log(`\n筛选「${DATA.topics[0].name}」后：结果计数「${countText}」，卡片 ${filtered}`);
if (filtered === 0) errors.push('主题筛选失效');
if (!countText.startsWith(String(Math.min(expected, DATA.videos.length)))) warnings.push(`结果计数与主题统计(${expected})不一致`);

// 测试搜索
state.topics = new Set();
state.q = 'karpathy';
sandbox.render();
const searched = (els.get('content').innerHTML.match(/class="card"/g) || []).length;
console.log(`搜索 "karpathy" 后卡片数：${searched}`);
if (searched === 0) warnings.push('搜索 karpathy 没有结果');

// 测试片单视图
state.q = '';
state.view = 'playlists';
sandbox.render();
const pls = (els.get('content').innerHTML.match(/class="pl"/g) || []).length;
console.log(`片单组数：${pls}`);
if (pls === 0) errors.push('片单视图为空');

console.log('\n--- 结论 ---');
if (errors.length) { console.log('错误：'); errors.forEach(e => console.log('  ✗ ' + e)); }
if (warnings.length) { console.log('提醒：'); warnings.forEach(w => console.log('  ! ' + w)); }
if (!errors.length) console.log('  ✓ 渲染链路正常');
process.exit(errors.length ? 1 : 0);
