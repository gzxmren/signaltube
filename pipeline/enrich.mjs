// 阶段 2：补全视频元数据（标题/频道/时长/播放量/官方标签）
// 有 YT_API_KEY 时走官方 Data API（一次 50 个 ID，1 单位/次）；没有则退回 oEmbed
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS, TOPICS } from './config.mjs';
import { ROOT_DIR, YT_API_KEY } from './env.mjs';

const RAW = path.join(ROOT_DIR, 'data', 'raw');
const OEMBED_CACHE = path.join(RAW, 'oembed.json');
const META_CACHE = path.join(RAW, 'meta.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const oembed = fs.existsSync(OEMBED_CACHE) ? JSON.parse(fs.readFileSync(OEMBED_CACHE, 'utf8')) : {};
const meta = fs.existsSync(META_CACHE) ? JSON.parse(fs.readFileSync(META_CACHE, 'utf8')) : {};

function save() {
  fs.writeFileSync(OEMBED_CACHE, JSON.stringify(oembed));
  fs.writeFileSync(META_CACHE, JSON.stringify(meta));
}

async function pool(items, n, fn, label) {
  let idx = 0, done = 0;
  const total = items.length;
  if (!total) return;
  const workers = Array.from({ length: Math.min(n, total) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= total) return;
      try { await fn(items[i], i); } catch (e) { }
      done++;
      if (done % 25 === 0 || done === total) process.stdout.write(`\r  ${label} ${done}/${total}`);
    }
  });
  await Promise.all(workers);
  process.stdout.write(`\r  ${label} ${done}/${total}\n`);
}

async function fetchText(url, tries = 2, timeout = 30000) {
  for (let i = 0; i < tries; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeout);
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (r.status === 404 || r.status === 401 || r.status === 410) return { status: r.status, text: null };
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { status: r.status, text: await r.text() };
    } catch (e) {
      if (i === tries - 1) return { status: 0, text: null, error: e.message };
      await new Promise(res => setTimeout(res, 700 * (i + 1)));
    }
  }
}

// ---------- 初筛打分 + 粗分类（还没有标题，只能用 HN 帖子标题和评论片段） ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function roughTopic(c) {
  const text = ((c.stories || []).map(s => s.title).join(' ') + ' ' + (c.snippets || []).join(' ')).toLowerCase();
  if (!text.trim()) return 'other';
  let best = 'other', bestScore = 0;
  for (const t of TOPICS) {
    let s = 0;
    for (const kw of t.kw.w3 || []) if (text.includes(kw)) s += 3;
    for (const kw of t.kw.w2 || []) if (new RegExp(`\\b${esc(kw)}\\b`).test(text)) s += 2;
    if (s > bestScore) { bestScore = s; best = t.id; }
  }
  return bestScore >= 3 ? best : 'other';
}

const candidates = JSON.parse(fs.readFileSync(path.join(RAW, 'candidates.json'), 'utf8'));
for (const c of candidates) {
  c.pre = c.authors * 4 + Math.min(c.stories.length, 8) * 2 + Math.log10(c.scoreSum + 1) * 6;
  c.rt = roughTopic(c);
}
candidates.sort((a, b) => b.pre - a.pre);

function selectDiverse(sorted, total) {
  const buckets = new Map();
  for (const c of sorted) {
    if (!buckets.has(c.rt)) buckets.set(c.rt, []);
    buckets.get(c.rt).push(c);
  }
  const real = [...buckets.keys()].filter(k => k !== 'other');
  const out = [];
  let round = 0, guard = 0;
  while (out.length < total && guard++ < 500) {
    let added = 0;
    for (const k of real) {
      const b = buckets.get(k);
      if (round < b.length) {
        out.push(b[round]); added++;
        if (out.length >= total) break;
      }
    }
    if (!added) break;
    round++;
  }
  if (out.length < total) {
    for (const c of buckets.get('other') || []) {
      out.push(c);
      if (out.length >= total) break;
    }
  }
  return out;
}

const topCand = selectDiverse(candidates, LIMITS.oembedTop);

// ---------- oEmbed：标题/频道（免 key，已缓存的直接跳过） ----------
console.log(`[1/2] oEmbed 元数据（${topCand.length} 条候选，缓存命中自动跳过）`);
const todoO = topCand.map(c => c.vid).filter(v => !oembed[v]);
await pool(todoO, LIMITS.concurrencyOembed, async (vid) => {
  const { status, text } = await fetchText(
    `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + vid)}&format=json`, 2, 20000);
  if (status === 404 || status === 401 || status === 410) { oembed[vid] = { dead: true }; return; }
  if (!text) return;
  try {
    const d = JSON.parse(text);
    oembed[vid] = { title: d.title || '', channel: d.author_name || '', channelUrl: d.author_url || '' };
  } catch (e) { }
}, 'oEmbed');
save();

// ---------- YouTube Data API v3：时长/播放量/官方标签 ----------
// videos.list 一次 50 个 ID、消耗 1 单位，part 不额外计费
const ISO = /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/;
function isoToSec(s) {
  if (!s) return 0;
  const m = s.match(ISO);
  if (!m) return 0;
  return (+(m[1] || 0)) * 604800 + (+(m[2] || 0)) * 86400 + (+(m[3] || 0)) * 3600 +
    (+(m[4] || 0)) * 60 + (+(m[5] || 0));
}
const CATEGORY_NAMES = {
  '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music', '15': 'Pets & Animals',
  '17': 'Sports', '19': 'Travel & Events', '20': 'Gaming', '22': 'People & Blogs',
  '23': 'Comedy', '24': 'Entertainment', '25': 'News & Politics', '26': 'Howto & Style',
  '27': 'Education', '28': 'Science & Technology', '29': 'Nonprofits & Activism',
};

async function dataApiBatch(ids) {
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${ids.join(',')}&key=${YT_API_KEY}`;
  for (let i = 0; i < 3; i++) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(t);
      const d = await r.json().catch(() => null);
      if (r.status === 400 && JSON.stringify(d?.error?.errors || '').includes('keyInvalid')) {
        throw new Error('FATAL:keyInvalid');
      }
      if (r.status === 403 && /quota/i.test(d?.error?.message || '')) {
        throw new Error('FATAL:quotaExceeded');
      }
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (d?.error?.message || '').slice(0, 80));
      return d;
    } catch (e) {
      if (String(e.message).startsWith('FATAL:')) throw e;
      if (i === 2) return null;
      await new Promise(res => setTimeout(res, 1500 * (i + 1)));
    }
  }
  return null;
}

const alive = topCand.filter(c => oembed[c.vid] && !oembed[c.vid].dead);
const todoW = alive.map(c => c.vid).filter(v => !meta[v]);
console.log(`[2/2] YouTube Data API（${todoW.length} 条，约 ${Math.ceil(todoW.length / 50)} 次请求）`);

if (!YT_API_KEY) {
  console.log('  ⚠ .env 里没有 YT_API_KEY，本阶段跳过，时长/播放量将缺失。');
} else {
  const batches = [];
  for (let i = 0; i < todoW.length; i += 50) batches.push(todoW.slice(i, i + 50));

  let units = 0, got = 0, fatal = null, saveTick = 0;
  for (let bi = 0; bi < batches.length && !fatal; bi++) {
    try {
      const d = await dataApiBatch(batches[bi]);
      units++;
      if (d && Array.isArray(d.items)) {
        got += d.items.length;
        for (const it of d.items) {
          const sn = it.snippet || {}, st = it.statistics || {}, cd = it.contentDetails || {};
          meta[it.id] = {
            lengthSec: isoToSec(cd.duration),
            views: parseInt(st.viewCount, 10) || 0,
            uploadDate: sn.publishAt || sn.publishedAt || null,
            category: CATEGORY_NAMES[sn.categoryId] || '',
            channelId: sn.channelId || '',
            keywords: Array.isArray(sn.tags) ? sn.tags.slice(0, 30) : [],
            isLive: sn.liveBroadcastContent === 'live' ? 1 : 0,
            restricted: 0,
          };
        }
      }
      process.stdout.write(`\r  API 批次 ${bi + 1}/${batches.length}（已取 ${got} 条，配额 ${units} 单位）`);
      if (++saveTick % 10 === 0) save();
      if (bi < batches.length - 1) await new Promise(res => setTimeout(res, 180));
    } catch (e) {
      if (String(e.message).startsWith('FATAL:')) {
        fatal = e.message.split(':')[1];
        save();
        break;
      }
      console.log(`\n  ! 批次 ${bi + 1} 失败：${e.message}（跳过这批）`);
    }
  }
  save();
  console.log('');
  if (fatal) console.log(`  ⚠ API 中止：${fatal}。已保存的部分不丢，修好后重跑会接着补。`);
}

const ok = Object.values(meta).filter(m => m && m.lengthSec).length;
const dead = Object.values(oembed).filter(o => o.dead).length;
console.log(`\n完成：有效元数据 ${ok} 条，失效视频 ${dead} 个`);
