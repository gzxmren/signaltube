// 阶段 3：分类打分 + 生成自包含 HTML 门户
import fs from 'node:fs';
import path from 'node:path';
import { TOPICS, TYPES, TASTE, LIMITS } from './config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

const candidates = JSON.parse(fs.readFileSync(path.join(RAW, 'candidates.json'), 'utf8'));
const oembed = JSON.parse(fs.readFileSync(path.join(RAW, 'oembed.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(RAW, 'meta.json'), 'utf8'));

// ---------- 文本匹配工具 ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reCache = new Map();
function countHits(text, kw) {
  if (!text) return 0;
  let re = reCache.get(kw);
  if (!re) {
    const useWord = /^[a-z0-9 .\-']+$/i.test(kw);
    re = new RegExp(useWord ? `\\b${esc(kw)}\\b` : esc(kw), 'g');
    reCache.set(kw, re);
  }
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n++;
  return n;
}

const OTHER_TOPIC = { id: 'other', name: '其他' };

function classifyTopic(parts) {
  const { title, channel, keywords, stories, snippets } = parts;
  const tTitle = title.toLowerCase();
  const tKw = keywords.join(' ').toLowerCase();
  // 语境只用得分最高的几个帖子；"Ask HN:" 这类元讨论帖（"你最爱的 tech talk"）
  // 对判断主题没有信息量，只会把无关词带进来，直接排除
  const ctxStories = stories
    .filter(s => !/^Ask HN:/i.test(s.title || ''))
    .slice(0, 3);
  const tStories = ctxStories.map(s => s.title).join(' ').toLowerCase();
  const tSnip = snippets.join(' ').toLowerCase();
  const tChan = channel.toLowerCase();

  let best = { id: 'other', name: '其他', score: 0 };
  for (const t of TOPICS) {
    let s = 0;
    // w1 是兜底通用词（code/design/energy 这类），权重压低且不累计，防止一个泛词决定归类
    for (const [w, weight, cap] of [['w3', 3, 99], ['w2', 2, 3], ['w1', 0.5, 1]]) {
      for (const kw of t.kw[w] || []) {
        const h = (text) => Math.min(countHits(text, kw), cap);
        s += weight * 2.0 * h(tTitle);      // 标题最可信
        s += weight * 1.4 * h(tKw);         // 官方标签很强
        s += weight * 0.55 * h(tStories);   // HN 帖子语境（会串味，压低）
        s += weight * 0.2 * h(tSnip);       // 评论语境（噪声最大）
        s += weight * 0.8 * h(tChan);       // 频道名/会议名
      }
    }
    if (s > best.score) best = { id: t.id, name: t.name, score: s };
  }
  return best.score >= 6 ? best : { ...OTHER_TOPIC, score: best.score };
}

// 形式判断：按优先级匹配标题+频道+标签。会议名/栏目名是最可靠的形式信号
const TYPE_RULES = [
  ['interview', /\b(podcast|interview|in conversation|fireside|lex fridman|dwarkesh|episode \d+|q ?& ?a|conversations? with)\b/i],
  ['documentary', /\b(documentary|full movie|full film|the story of|a film about|\bdocs\b|frontline)\b/i],
  ['course', /\b(open ?course ?ware|coursera|edx|full course|chapter \d+|lesson \d+|lec \d+|cs ?\d{2,3}|18\.0\d{2}|6\.\d{4}|curriculum|university|stanford|\bmit\b|berkeley|\bcmu\b)\b/i],
  ['conference', /(\b(cppcon|cppnow|dconf|usenix|osdi|sosp|nsdi|goto ?con|strange ?loop|def ?con|black ?hat|pycon|rustconf|scala ?days|kubecon|qcon|react ?conf|google i\/o|wwdc|fosdem|linux\.conf|devops ?days|rubyconf|jsconf|dotjs|lead ?dev|srecon|sigcomm|neurips|nips|icml|iclr|cvpr|siggraph|hot ?chips|isca|asplos|europython|dockercon|re:invent|gdc|scipy|pydata|devgamm|unprompted|oopsla|popl|icfp|splash|tech ?talks?|conference|summit|meetup|symposium|colloquium|keynote|panel|masterclass|clojuretvtv)\b|(\b\d{2}c3\b))/i],
  ['lecture', /\b(lecture|talk|seminar|address|ted ?x?|prof\.|professor)\b/i],
  ['tutorial', /\b(tutorial|how to|how i |walkthrough|crash course|introduction to|for beginners|step by step|build a|from scratch|in code|live coding|getting started)\b/i],
  ['explainer', /\b(explained|explains|explaining|what is|why does|visuali[sz]ed|in \d+ minutes|but what is|the truth about|paradox|basics of)\b/i],
  ['demo', /\b(demo|demonstrat|trailer|in action|showcase|launch event|autonomy day)\b/i],
];

function classifyType(title, channel, keywords, durationSec, ctxText) {
  const text = `${title} ${channel} ${keywords.join(' ')} ${ctxText || ''}`;
  for (const [id, re] of TYPE_RULES) if (re.test(text)) return id;
  if (durationSec > 0 && durationSec < 300) return 'clip';
  return 'other';
}

// 时效性判断：命中新闻词就算不上"常青"
const NEWS_RE = /(\b20(2[3-9]|3\d)\b|launch|announc|rais(e|es|ed|ing) (a|the|\$)|funding round|valuation|layoff|lawsuit|acquire|acquisition|breaking|this week|election|tariff|earnings|ipo\b|stock (surge|plunge|drop))/i;

// ---------- 组装 ----------
const videos = [];
let droppedDead = 0, droppedNoTitle = 0, droppedLive = 0;

for (const c of candidates) {
  const oe = oembed[c.vid];
  if (!oe || oe.dead) { droppedDead++; continue; }
  const m = meta[c.vid] || {};
  if (m.dead) { droppedDead++; continue; }
  if (!oe.title) { droppedNoTitle++; continue; }

  const durationSec = m.lengthSec || 0;
  // 超长直播录像（>6h）不是"内容"，剔掉
  if (m.isLive && durationSec > 6 * 3600) { droppedLive++; continue; }
  if (durationSec > 6 * 3600) { droppedLive++; continue; }

  const topic = classifyTopic({
    title: oe.title,
    channel: oe.channel || '',
    keywords: m.keywords || [],
    stories: c.stories || [],
    snippets: c.snippets || [],
  });

  const type = classifyType(oe.title, oe.channel || '', m.keywords || [], durationSec,
    `${(c.stories || []).slice(0, 3).map(s => s.title).join(' ')} ${(c.snippets || []).join(' ')}`);
  const haystack = `${oe.title} ${(c.stories || []).map(s => s.title).join(' ')} ${(m.keywords || []).join(' ')}`;

  const quality =
    Math.log10(1 + c.authors) * 34 +
    Math.log10(1 + (c.stories || []).length) * 22 +
    Math.log10(1 + c.scoreSum) * 18 +
    Math.log10(1 + (m.views || 0)) * 3;

  videos.push({
    id: c.vid,
    title: oe.title,
    channel: oe.channel || '',
    durationSec,
    views: m.views || 0,
    uploadDate: m.uploadDate || null,
    uploadYear: m.uploadDate ? Number(String(m.uploadDate).slice(0, 4)) : null,
    topic: topic.id,
    topicScore: Math.round(topic.score * 10) / 10,
    type,
    quality: Math.round(quality * 10) / 10,
    authors: c.authors,
    mentions: c.mentions,
    stories: (c.stories || []).slice(0, 4).map(s => ({ id: s.id, t: s.title, s: s.score })),
    snippets: (c.snippets || []).slice(0, 3),
    keywords: (m.keywords || []).slice(0, 12),
    hiddenGem: (m.views || 0) > 0 && (m.views || 0) < 100000,
    evergreen: !NEWS_RE.test(haystack),
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
  });
}

console.log(`元数据齐全 ${videos.length} 条（剔除失效 ${droppedDead}，无标题 ${droppedNoTitle}，超长直播 ${droppedLive}）`);

// ---------- 去重（同一视频的不同 ID 变体不会出现，但标题重复要处理） ----------
const byTitle = new Map();
for (const v of videos) {
  const key = v.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
  const prev = byTitle.get(key);
  if (!prev || v.quality > prev.quality) byTitle.set(key, v);
}
const deduped = [...byTitle.values()];
console.log(`标题去重后 ${deduped.length} 条`);

// ---------- 排序 + 主题/频道配比 ----------
// 优先用时长/播放量齐全的（抓过 watch 页的），再按时长权重和认可度排
deduped.sort((a, b) => (b.durationSec > 0) - (a.durationSec > 0) || b.quality - a.quality);

const topicCount = new Map();
const channelCount = new Map();
const picked = [];
const MAX_PER_TOPIC = Math.max(40, Math.round(LIMITS.finalCatalog * 0.16));
const MAX_PER_CHANNEL = Math.max(12, Math.round(LIMITS.finalCatalog * 0.035));

function tryPick(v, enforce) {
  const tc = topicCount.get(v.topic) || 0;
  const cc = channelCount.get(v.channel) || 0;
  if (enforce && (tc >= MAX_PER_TOPIC || cc >= MAX_PER_CHANNEL)) return false;
  picked.push(v);
  topicCount.set(v.topic, tc + 1);
  channelCount.set(v.channel, cc + 1);
  return true;
}
for (const v of deduped) { if (picked.length >= LIMITS.finalCatalog) break; tryPick(v, true); }
for (const v of deduped) { if (picked.length >= LIMITS.finalCatalog) break; if (!picked.includes(v)) tryPick(v, false); }

console.log(`配比后入选 ${picked.length} 条`);

// ---------- 主题统计 ----------
const topicStats = TOPICS.map(t => ({ id: t.id, name: t.name, count: picked.filter(v => v.topic === t.id).length }))
  .filter(t => t.count > 0)
  .sort((a, b) => b.count - a.count);
if (picked.some(v => v.topic === 'other')) {
  topicStats.push({ id: 'other', name: '其他', count: picked.filter(v => v.topic === 'other').length });
}
const typeStats = TYPES.map(t => ({ id: t.id, name: t.name, count: picked.filter(v => v.type === t.id).length }))
  .filter(t => t.count > 0).sort((a, b) => b.count - a.count);

// ---------- 输出 ----------
const hnCacheCount = fs.readdirSync(path.join(RAW, 'hn')).length;
const withDur = picked.filter(v => v.durationSec > 0).length;
const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  stats: {
    queries: hnCacheCount,
    candidates: candidates.length,
    videos: picked.length,
    topics: topicStats.length,
    types: typeStats.length,
    totalMentions: picked.reduce((a, v) => a + v.mentions, 0),
    durCoverage: Math.round(withDur / picked.length * 100) / 100,
    totalHours: Math.round(picked.reduce((a, v) => a + v.durationSec, 0) / 360) / 10,
  },
  topics: topicStats,
  types: typeStats,
  taste: TASTE,
  videos: picked,
};

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'catalog.json'), JSON.stringify(payload, null, 1));

// 主题分布打印，方便人工检查分类质量
console.log('\n主题分布：');
topicStats.forEach(t => console.log(`  ${String(t.count).padStart(4)}  ${t.name}`));
console.log('\n类型分布：');
typeStats.forEach(t => console.log(`  ${String(t.count).padStart(4)}  ${t.name}`));
console.log(`\n统计：${payload.stats.totalMentions} 次 HN 提及 / 总时长 ${payload.stats.totalHours} 小时`);
console.log('已写出 data/catalog.json');

export { payload };
