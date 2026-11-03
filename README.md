# SignalTube

从 Hacker News 二十年讨论里淘出来的个人 YouTube 视频片单。纯静态单文件应用。

- **线上地址**：<https://signaltube-equ.pages.dev/>
- **仓库**：<https://github.com/gzxmren/signaltube>
- **本地版本**：`SignalTube.html`（双击即用，与线上内容相同）

## 更新

```
node pipeline\run.mjs
```

四个阶段：collect（抓 HN 评论）→ enrich（补视频元数据，走 YouTube Data API，key 在 `.env`）→ build（分类打分）→ emit（生成页面 + 同步 `public/index.html`）。各阶段有缓存，重复跑只补增量。抓取缓存 4 天过期。

计划任务 `SignalTube weekly update` 每周日 9:00 自动执行，日志在 `data\update.log`。

## 手动发布

```
$env:CLOUDFLARE_API_TOKEN = "<token>"; npx --yes wrangler@4.156.2 pages deploy public --project-name signaltube --branch main --commit-dirty=true
```

token 按用户规矩不落盘，只在当次会话用。Cloudflare 账号：a4e3da8c28c2b2e09de869c8f42a0dfe。

## 数据口径

- 数据源：HN Algolia（评论，86 个查询）+ HN Firebase（帖子分数）+ YouTube oEmbed（标题/频道）+ YouTube Data API（时长/播放量/标签）。
- 招聘类大帖（Who is hiring 等）整条丢弃，防止污染主题分类。
- 打分以「多少个不同的 HN 用户推荐过」为主，帖子分和播放量为辅。
- 主题分类用关键词规则（28 类），形式用会议名/栏目名/时长规则；HN 帖子语境权重压低并排除 Ask HN。
- 播放仍由 YouTube 提供，本站只负责「先给你看什么」。所有偏好存浏览器 localStorage。
