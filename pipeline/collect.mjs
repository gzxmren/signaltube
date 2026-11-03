// 阶段 1：从 Hacker News 评论里挖 YouTube 链接，聚合成候选视频
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { QUERIES, LIMITS } from './config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const HN_CACHE = path.join(RAW, 'hn');
fs.mkdirSync(HN_CACHE, { recursive: true });

const UA = 'Mozilla/5.0 (compatible; personal-yt-portal/1.0)';

function hash(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16); }

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 45000);
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(res => setTimeout(res, 1200 * (i + 1)));
    }
  }
}

async function pool(items, n, fn, label) {
  let idx = 0, done = 0;
  const total = items.length;
  const workers = Array.from({ length: Math.min(n, total) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= total) return;
      try { await fn(items[i], i); } catch (e) { /* 单条失败不影响整体 */ }
      done++;
      if (done % 20 === 0 || done === total) process.stdout.write(`\r  ${label} ${done}/${total}`);
    }
  });
  await Promise.all(workers);
  process.stdout.write(`\r  ${label} ${done}/${total}\n`);
}

// ---------- 文本处理 ----------
function unescapeHTML(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
function stripTags(s) { return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function cleanText(s) { return stripTags(unescapeHTML(s || '')); }

// HN 的月度大帖会严重污染语料：一条视频链接可能被贴进几十个招聘帖里，
// 结果"hiring"这种词把编译原理演讲判成"管理与组织"。这类帖子整条丢弃。
const MEGATHREAD = /^(Ask HN:\s*(Who is hiring\?|Who wants to be hired\?|Freelancer\? Who is seeking work\?|Who is available for work\?|Who wants to be fired\?))|^(Ask HN:\s*(What are you working on\?|Share your projects))/i;

const VID = '[A-Za-z0-9_-]{11}';
const VID_PATTERNS = [
  new RegExp(`youtube\\.com\\/watch\\?(?:[^\\s"'<>]*&)?v=(${VID})`, 'g'),
  new RegExp(`youtu\\.be\\/(${VID})`, 'g'),
  new RegExp(`youtube\\.com\\/embed\\/(${VID})`, 'g'),
  new RegExp(`youtube\\.com\\/shorts\\/(${VID})`, 'g'),
  new RegExp(`youtube\\.com\\/live\\/(${VID})`, 'g'),
  new RegExp(`youtube-nocookie\\.com\\/embed\\/(${VID})`, 'g'),
];
function extractVids(text) {
  const out = new Set();
  for (const re of VID_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) out.add(m[1]);
  }
  return out;
}

// ---------- 1. 抓 HN 评论 ----------
async function fetchHN() {
  console.log(`[1/3] 抓 Hacker News 评论（${QUERIES.length} 个查询，每个上限 1000 条）`);
  let reused = 0;
  const failures = [];

  await pool(QUERIES, LIMITS.concurrencyFetch, async (q) => {
    const file = path.join(HN_CACHE, `${hash(q)}.json`);
    // 缓存 4 天过期：每周自动更新必定刷新，同日重跑不重复抓
    if (fs.existsSync(file)) {
      const age = (Date.now() - fs.statSync(file).mtimeMs) / 864e5;
      if (age < 4) { reused++; return; }
    }
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=comment&hitsPerPage=1000`;
    try {
      const d = await getJSON(url);
      fs.writeFileSync(file, JSON.stringify({ query: q, nbHits: d.nbHits, hits: d.hits || [] }));
    } catch (e) {
      failures.push(`${q}: ${e.message}`);
    }
  }, '查询进度');
  console.log(`  缓存命中 ${reused} 个，失败 ${failures.length} 个`);
  failures.slice(0, 5).forEach(f => console.log('   ! ' + f));
}

// ---------- 2. 聚合 ----------
function aggregate() {
  console.log('[2/3] 提取视频 ID 并聚合');
  const files = fs.readdirSync(HN_CACHE).filter(f => f.endsWith('.json'));
  const seenComment = new Set();
  const videos = new Map();
  let commentCount = 0, skippedMega = 0;

  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(HN_CACHE, f), 'utf8'));
    for (const h of d.hits) {
      const key = h.objectID;
      if (seenComment.has(key)) continue;
      if (MEGATHREAD.test(h.story_title || '')) { skippedMega++; continue; }
      seenComment.add(key);
      commentCount++;

      const text = unescapeHTML(h.comment_text || '');
      const vids = extractVids(text);
      if (!vids.size) continue;

      const plain = cleanText(h.comment_text).slice(0, 400);
      const when = h.created_at || '';

      for (const vid of vids) {
        let v = videos.get(vid);
        if (!v) {
          v = { vid, mentions: 0, authors: new Set(), stories: new Map(), snippets: [], firstSeen: when, lastSeen: when, queries: new Set() };
          videos.set(vid, v);
        }
        v.mentions++;
        if (h.author) v.authors.add(h.author);
        if (h.story_id) {
          const sid = String(h.story_id);
          if (!v.stories.has(sid)) v.stories.set(sid, { title: h.story_title || '', url: h.story_url || '' });
        }
        if (when) {
          if (!v.firstSeen || when < v.firstSeen) v.firstSeen = when;
          if (!v.lastSeen || when > v.lastSeen) v.lastSeen = when;
        }
        v.queries.add(d.query);
        // 保留较短的评论片段当语境（越短越像"推荐"，越不像长篇大论里的顺带一提）
        if (v.snippets.length < 3 && plain.length > 15) {
          if (!v.snippets.some(s => s.slice(0, 40) === plain.slice(0, 40))) {
            v.snippets.push(plain.slice(0, 220));
            v.snippets.sort((a, b) => a.length - b.length);
            v.snippets = v.snippets.slice(0, 3);
          }
        }
      }
    }
  }

  console.log(`  评论 ${commentCount} 条（去重后），提到 ${videos.size} 个不同视频`);
  console.log(`  丢弃大帖里的评论 ${skippedMega} 条（招聘/项目分享帖，噪声）`);
  return videos;
}

// ---------- 3. 拿 HN 帖子分数 ----------
async function fetchStoryScores(videos) {
  // 只抓出现频次高的帖子，够用且省请求
  const storyUsers = new Map();
  for (const v of videos.values()) {
    for (const sid of v.stories.keys()) {
      storyUsers.set(sid, (storyUsers.get(sid) || 0) + 1);
    }
  }
  const top = [...storyUsers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4000);
  console.log(`[3/3] 取 HN 帖子分数（${top.length} 个帖子里最有代表性的）`);

  const scores = new Map();
  const cacheFile = path.join(RAW, 'story-scores.json');
  if (fs.existsSync(cacheFile)) {
    for (const [k, val] of Object.entries(JSON.parse(fs.readFileSync(cacheFile, 'utf8')))) scores.set(k, val);
  }

  const todo = top.map(([sid]) => sid).filter(sid => !scores.has(sid));
  console.log(`  待抓 ${todo.length} 个`);
  await pool(todo, 8, async (sid) => {
    try {
      const d = await getJSON(`https://hacker-news.firebaseio.com/v0/item/${sid}.json`, 2);
      if (d) scores.set(sid, { score: d.score || 0, title: d.title || '', time: d.time || 0, descendants: d.descendants || 0 });
    } catch (e) { /* 忽略 */ }
  }, '帖子分数');

  fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(scores)));
  return scores;
}

// ---------- 主流程 ----------
await fetchHN();
const videos = aggregate();
const scores = await fetchStoryScores(videos);

const out = [];
for (const v of videos.values()) {
  const storyList = [...v.stories.entries()].map(([sid, s]) => ({
    id: sid,
    title: s.title,
    score: scores.get(sid)?.score || 0,
    comments: scores.get(sid)?.descendants || 0,
  }));
  storyList.sort((a, b) => b.score - a.score);
  const topStoryScore = storyList[0]?.score || 0;
  const scoreSum = storyList.reduce((a, s) => a + s.score, 0);

  out.push({
    vid: v.vid,
    mentions: v.mentions,
    authors: v.authors.size,
    stories: storyList,
    topStoryScore,
    scoreSum,
    firstSeen: v.firstSeen,
    lastSeen: v.lastSeen,
    snippets: v.snippets,
    queries: [...v.queries],
  });
}

fs.writeFileSync(path.join(RAW, 'candidates.json'), JSON.stringify(out));
console.log(`\n完成：data/raw/candidates.json  共 ${out.length} 个候选视频`);
const multi = out.filter(o => o.authors >= 2).length;
console.log(`  被 2 个以上不同用户提到过的：${multi}`);
console.log(`  被 1 个人提到的：${out.length - multi}（这类质量最杂）`);
