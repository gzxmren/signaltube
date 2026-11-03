// 配置：查询集 + 主题分类规则 + 类型规则 + 默认口味权重

// ---------- 抓取用的 HN 查询 ----------
// Algolia 单查询最多 1000 条，所以用大量不重叠角度覆盖
export const QUERIES = [
  // 链接形态
  'youtube.com/watch', 'youtu.be', 'youtube video', 'youtube.com',
  // 推荐类语境（Hacker News 的"这视频值得看"信号最强）
  'great talk youtube', 'must watch youtube', 'best video youtube',
  'worth watching youtube', 'favorite talk youtube', 'favorite video youtube',
  'recommend youtube video', 'watch this youtube', 'excellent talk youtube',
  'good talk youtube', 'amazing talk youtube',
  // 形式
  'youtube lecture', 'youtube documentary', 'youtube interview',
  'youtube podcast', 'youtube conference talk', 'youtube tutorial',
  'youtube explainer', 'youtube course', 'youtube demo',

  // AI / ML
  'youtube machine learning', 'youtube neural network', 'youtube LLM',
  'youtube transformer', 'youtube GPT', 'youtube deep learning',
  'youtube reinforcement learning', 'youtube computer vision',
  'youtube karpathy', 'youtube AI talk', 'youtube diffusion model',
  'youtube alignment',

  // 系统 / 语言
  'youtube compiler', 'youtube database', 'youtube distributed systems',
  'youtube operating system', 'youtube rust', 'youtube C++ talk',
  'youtube algorithms', 'youtube system design', 'youtube performance',
  'youtube concurrency', 'youtube kernel', 'youtube garbage collection',
  'youtube debugging',

  // 硬件 / 芯片
  'youtube CPU', 'youtube chip', 'youtube semiconductor', 'youtube GPU',
  'youtube fab', 'youtube ASIC', 'youtube transistor', 'youtube assembly',

  // 安全
  'youtube security talk', 'youtube cryptography', 'youtube hacking',
  'youtube networking',

  // 科学
  'youtube physics', 'youtube math lecture', 'youtube biology',
  'youtube chemistry', 'youtube neuroscience', 'youtube space',
  'youtube astronomy', 'youtube quantum', 'youtube climate',
  'youtube energy',

  // 钱 / 商业
  'youtube finance', 'youtube investing', 'youtube economics',
  'youtube startup talk', 'youtube business talk', 'youtube quant',
  'youtube markets',

  // 人文 / 其他
  'youtube history lecture', 'youtube design talk', 'youtube philosophy',
  'youtube psychology', 'youtube robotics', 'youtube graphics',
  'youtube game development', 'youtube career advice',
];

// ---------- 主题分类 ----------
// kw 里的词在「视频标题 + 频道名 + HN 帖子标题 + 评论片段」里匹配，加权计分
export const TOPICS = [
  {
    id: 'ai-llm', name: '大模型与 AI',
    kw: { w3: ['llm', 'large language model', 'gpt', 'chatgpt', 'claude', 'gemini', 'transformer', 'openai', 'anthropic', 'prompt engineering', 'language model', 'foundation model', 'rag'], w2: ['ai', 'artificial intelligence', 'neural', 'agent', 'inference', 'token'], w1: ['model'] },
  },
  {
    id: 'ml', name: '机器学习',
    kw: { w3: ['machine learning', 'deep learning', 'reinforcement learning', 'backprop', 'gradient descent', 'diffusion model', 'computer vision', 'pytorch', 'tensorflow', 'karpathy'], w2: ['training', 'dataset', 'classification', 'embedding', 'convolutional'], w1: ['learning', 'model'] },
  },
  {
    id: 'ai-safety', name: 'AI 安全与对齐',
    kw: { w3: ['alignment', 'ai safety', 'existential risk', 'interpretability', 'mechanistic'], w2: ['superintelligence', 'agi', 'paperclip', 'jailbreak'], w1: ['risk', 'safety'] },
  },
  {
    id: 'systems', name: '系统与底层',
    kw: { w3: ['distributed system', 'operating system', 'kernel', 'file system', 'virtual memory', 'concurrency', 'lock-free', 'raft', 'paxos', 'consensus', 'syscall', 'ebpf'], w2: ['compiler', 'memory', 'thread', 'cpu cache', 'garbage collection', 'scheduler', 'networking', 'tcp', 'dns'], w1: ['system', 'performance', 'latency', 'scale'] },
  },
  {
    id: 'programming', name: '编程语言',
    kw: { w3: ['programming language', 'type system', 'functional programming', 'haskell', 'lisp', 'clojure', 'erlang', 'ocaml', 'rust', 'golang', 'simplicity matters', 'rich hickey'], w2: ['python', 'javascript', 'typescript', 'java', 'c++', 'compiler', 'parser', 'monad', 'immutability'], w1: ['code', 'programming', 'programmer', 'developer'] },
  },
  {
    id: 'web', name: 'Web 与前端',
    kw: { w3: ['javascript framework', 'react', 'browser engine', 'css', 'http/2', 'webassembly', 'wasm'], w2: ['frontend', 'backend', 'html', 'node.js', 'api design', 'web'], w1: ['browser', 'server'] },
  },
  {
    id: 'db', name: '数据库与存储',
    kw: { w3: ['database', 'postgres', 'sqlite', 'mysql', 'mongodb', 'b-tree', 'lsm', 'query planner', 'transaction isolation'], w2: ['index', 'storage engine', 'replication', 'sharding', 'sql', 'key-value'], w1: ['data', 'query'] },
  },
  {
    id: 'security', name: '安全与密码学',
    kw: { w3: ['cryptography', 'encryption', 'zero knowledge', 'vulnerability', 'exploit', 'buffer overflow', 'reverse engineering', 'cve', 'password', 'supply chain attack'], w2: ['security', 'hacking', 'malware', 'privacy', 'tls', 'openssl'], w1: ['attack', 'secure'] },
  },
  {
    id: 'hardware', name: '芯片与硬件',
    kw: { w3: ['semiconductor', 'transistor', 'euv', 'lithography', 'fab', 'wafer', 'asic', 'fpga', 'risc-v', 'microarchitecture', 'tsmc', 'nvidia'], w2: ['cpu', 'gpu', 'chip', 'silicon', 'processor', 'hardware', 'assembly', 'arm', 'intel', 'memory bandwidth'], w1: ['board', 'device'] },
  },
  {
    id: 'robotics', name: '机器人与硬件工程',
    kw: { w3: ['robotics', 'robot', 'autonomous vehicle', 'self-driving', 'drone', 'actuator', 'slam'], w2: ['embedded', 'arduino', 'raspberry pi', 'control system', 'lidar'], w1: ['motor', 'sensor'] },
  },
  {
    id: 'physics', name: '物理',
    kw: { w3: ['physics', 'quantum mechanics', 'relativity', 'thermodynamics', 'particle physics', 'carlo rovelli', 'entropy', 'standard model', 'higgs'], w2: ['quantum', 'gravity', 'spacetime', 'photon', 'electron', 'laser', 'fusion'], w1: ['mass'] },
  },
  {
    id: 'math', name: '数学',
    kw: { w3: ['mathematics', 'mathematical', 'theorem', 'topology', 'linear algebra', 'calculus', 'number theory', 'prime', 'proof', 'geometry', 'probability'], w2: ['math', 'algebra', 'statistics', 'statistical', 'combinatorics'], w1: ['equation', 'number'] },
  },
  {
    id: 'bio', name: '生命科学与医学',
    kw: { w3: ['biology', 'genome', 'dna', 'crispr', 'protein', 'neuroscience', 'brain', 'vaccine', 'cancer', 'evolution', 'cell', 'mrna', 'antibiotic'], w2: ['medicine', 'medical', 'health', 'clinical', 'disease', 'drug', 'patient', 'species'], w1: ['human', 'body'] },
  },
  {
    id: 'space', name: '天文与航天',
    kw: { w3: ['astronomy', 'astrophysics', 'spacex', 'nasa', 'rocket', 'black hole', 'exoplanet', 'telescope', 'mars', 'satellite'], w2: ['space', 'universe', 'galaxy', 'orbit', 'cosmos', 'planet'], w1: ['star', 'moon'] },
  },
  {
    id: 'history', name: '历史与人文',
    kw: { w3: ['history', 'historical', 'world war', 'cold war', 'roman empire', 'medieval', 'civilization', 'archaeology', 'ancient'], w2: ['war', 'empire', 'century', 'revolution', 'president', 'politics'], w1: ['past', 'era'] },
  },
  {
    id: 'econ', name: '经济与金融',
    kw: { w3: ['economics', 'macroeconomics', 'monetary', 'interest rate', 'inflation', 'central bank', 'federal reserve', 'gdp', 'fiscal', 'trade deficit', 'bond market'], w2: ['economy', 'economic', 'market', 'bank', 'debt', 'currency', 'dollar'], w1: ['money', 'price', 'cost'] },
  },
  {
    id: 'investing', name: '投资与市场',
    kw: { w3: ['investing', 'investor', 'venture capital', 'stock market', 'portfolio', 'index fund', 'quantitative trading', 'hedge fund', 'valuation', 'buffett', 'munger', 'asset allocation'], w2: ['investment', 'stocks', 'equity', 'trading', 'quant', 'finance', 'financial', 'returns', 'beta'], w1: ['fund', 'market'] },
  },
  {
    id: 'startup', name: '创业与商业',
    kw: { w3: ['startup', 'founder', 'y combinator', 'product market fit', 'seed round', 'series a', 'acquisition', 'bootstrapped', 'business model', 'monetization'], w2: ['company', 'business', 'entrepreneur', 'fundraising', 'revenue', 'customer'], w1: ['grow'] },
  },
  {
    id: 'product', name: '产品与设计',
    kw: { w3: ['product design', 'user experience', 'usability', 'design system', 'typography', 'industrial design', 'interaction design'], w2: ['ux', 'interface', 'user research', 'prototype'], w1: [] },
  },
  {
    id: 'management', name: '管理与组织',
    kw: { w3: ['management', 'manager', 'leadership', 'hiring process', 'performance review', 'organizational', 'one-on-one', 'engineering culture', 'people management'], w2: ['reporting', 'promotion', 'headcount', 'remote work', 'meeting culture'], w1: ['boss', 'org chart'] },
  },
  {
    id: 'career', name: '职业与成长',
    kw: { w3: ['career', 'career advice', 'promotion', 'job hunting', 'interview tips', 'mentorship', 'burnout'], w2: ['job', 'resume', 'salary', 'learning', 'skill', 'junior', 'senior engineer'], w1: ['career', 'work'] },
  },
  {
    id: 'internet', name: '互联网与文化',
    kw: { w3: ['internet', 'social media', 'algorithm recommendation', 'attention economy', 'enshittification', 'content moderation', 'online community', 'platform economy'], w2: ['platform', 'moderation', 'user generated'], w1: ['google', 'facebook', 'twitter', 'reddit', 'tiktok', 'youtube'] },
  },
  {
    id: 'media', name: '影像与创作',
    kw: { w3: ['filmmaking', 'cinematography', 'animation', 'video editing', 'screenwriting', 'documentary film'], w2: ['film', 'movie', 'photography', 'music', 'art', 'artist', 'storytelling'], w1: ['creative', 'visual'] },
  },
  {
    id: 'game', name: '游戏与图形',
    kw: { w3: ['game development', 'game engine', 'ray tracing', 'shader', 'rendering', 'opengl', 'vulkan', 'graphics programming'], w2: ['game', 'graphics', 'unity', 'unreal', 'pixel', 'rasterization'], w1: ['render'] },
  },
  {
    id: 'energy', name: '能源与气候',
    kw: { w3: ['climate change', 'renewable energy', 'solar power', 'nuclear power', 'wind turbine', 'battery', 'carbon', 'grid', 'decarbonization'], w2: ['energy', 'climate', 'emissions', 'electric', 'hydrogen'], w1: ['power', 'fuel'] },
  },
  {
    id: 'law-policy', name: '法律与政策',
    kw: { w3: ['supreme court', 'copyright', 'patent', 'antitrust', 'gdpr', 'constitution', 'regulation', 'legal case', 'court ruling'], w2: ['court', 'policy', 'government', 'legislation', 'lawsuit', 'lawyer', 'congress'], w1: ['statute'] },
  },
  {
    id: 'philosophy', name: '哲学与思维',
    kw: { w3: ['philosophy', 'philosophical', 'epistemology', 'ethics', 'consciousness', 'free will', 'stoicism', 'rationality', 'bayesian', 'thought experiment'], w2: ['thinking', 'argument', 'truth', 'belief', 'moral', 'meaning of'], w1: ['paradox'] },
  },
  {
    id: 'learning', name: '学习与工具',
    kw: { w3: ['how to learn', 'learning technique', 'spaced repetition', 'note taking', 'second brain', 'productivity system', 'anki'], w2: ['learn', 'study', 'tool', 'workflow', 'tutorial', 'vim', 'emacs'], w1: ['practice', 'habit'] },
  },
];

// ---------- 视频形式 ----------
export const TYPES = [
  { id: 'lecture', name: '讲座', kw: ['lecture', 'talk', 'keynote', 'seminar', 'colloquium', 'symposium', 'masterclass'] },
  { id: 'conference', name: '技术分享', kw: ['conference', 'summit', 'meetup', 'devops days', 'pycon', 'defcon', 'black hat', 'qcon', 'strange loop'] },
  { id: 'tutorial', name: '教程', kw: ['tutorial', 'how to', 'walkthrough', 'crash course', 'introduction to', 'beginner', 'step by step', 'build a'] },
  { id: 'explainer', name: '讲解', kw: ['explained', 'explains', 'explaining', 'what is', 'why does', 'visualized', 'in 5 minutes', 'in 10 minutes'] },
  { id: 'interview', name: '访谈', kw: ['interview', 'conversation with', 'in conversation', 'q&a', 'fireside chat', 'podcast', 'lex friedman', 'episode'] },
  { id: 'documentary', name: '纪录片', kw: ['documentary', 'the story of', 'history of', 'a film about'] },
  { id: 'course', name: '课程', kw: ['course', 'full course', 'series', 'part 1', 'lesson', 'curriculum'] },
  { id: 'demo', name: '演示', kw: ['demo', 'showcase', 'prototype', 'launch trailer', 'in action'] },
  { id: 'clip', name: '短片', kw: ['clip', 'short', 'trailer', 'excerpt', 'snippet'] },
  { id: 'other', name: '未标注', kw: [] },
];

// ---------- 默认口味权重 ----------
// 按用户实际关注方向给初始值，门户里可以拖动重排
export const TASTE = {
  'ai-llm': 1.5, 'hardware': 1.4, 'investing': 1.4, 'ml': 1.3, 'econ': 1.3,
  'systems': 1.2, 'programming': 1.15, 'security': 1.05, 'bio': 1.0, 'startup': 1.0,
  'physics': 1.0, 'db': 0.95, 'math': 0.9, 'ai-safety': 0.95, 'robotics': 0.9,
  'space': 0.85, 'energy': 0.85, 'product': 0.8, 'management': 0.8,
  'career': 0.8, 'philosophy': 0.85, 'internet': 0.85, 'learning': 0.8,
  'law-policy': 0.7, 'history': 0.75, 'media': 0.7, 'game': 0.7, 'web': 0.7,
};

// ---------- 抓取规模 ----------
export const LIMITS = {
  oembedTop: 2600,              // 做 oEmbed 元数据抓取的条数（按主题配额挑）
  watchPageTop: 1650,           // 抓时长/播放量的条数
  finalCatalog: 1000,           // 最终进目录的条数
  concurrencyFetch: 4,
  concurrencyOembed: 8,
  concurrencyWatch: 4,
};
