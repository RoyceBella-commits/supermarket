import type { I18nText, ShopCategory } from '../data/layoutTypes.ts';

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'mall.lang';

const zh = {
  'app.title': '商场漫游',
  'app.subtitle': '五层卡通商场 · 自由逛店',
  'start.click': '点击开始',
  'start.resume': '点击画面继续',
  'start.relockWait': '请稍等一下再点击（浏览器限制）',
  'start.loading': '加载中…',
  'controls.move': '移动',
  'controls.run': '跑步',
  'controls.jump': '跳跃',
  'controls.look': '视角',
  'controls.music': '音乐面板',
  'controls.lang': '中 / EN',
  'controls.pause': '暂停 / 释放鼠标',
  'controls.view': '切换第一 / 第三人称',
  'controls.interact': '互动（对话、坐下、呼叫电梯、租卡丁车）',
  'controls.zoom': '镜头远近（第三人称）',
  'controls.wheel': '滚轮',
  'avatar.loadFailed': '角色模型加载失败，先用占位模型代替。',
  'elevator.call': '呼叫电梯',
  'seat.sit': '坐下',
  'seat.stand': '站起来',
  'npc.talk': '对话',
  'npc.next': '下一句',
  'time.label': '时间',
  'cinema.controls': '影片 · 播放控制',
  'cinema.pick': '选择本地视频',
  'cinema.noVideo': '还没有选择影片',
  'cinema.note': '视频只在本机播放，不会上传。支持 MP4（H.264）、WebM 等浏览器能直接播放的格式。',
  'cinema.stop': '停止',
  'cinema.hint': '坐在影厅里时按 P 暂停 / 继续',
  'cinema.unsupported': '无法播放「{name}」：浏览器不支持这个格式，请换成 MP4（H.264）或 WebM。',
  'time.pause': '暂停时间',
  'time.resume': '继续走时',
  'settings.mouse': '鼠标灵敏度',
  'announce.label': '商场广播',
  'announce.on': '开',
  'announce.off': '关',
  'kart.rent': '租一辆卡丁车上赛道',
  'kart.exit': '下车，回到大堂',
  'kart.lap': '第 {n} 圈',
  'kart.warmup': '暖胎圈：过起点线开始计时',
  'kart.current': '本圈',
  'kart.last': '上一圈',
  'kart.best': '最佳',
  'kart.help': 'W / S 油门 · 刹车　A / D 转向　R 回到赛道　E 下车',
  'kart.lapDone': '单圈 {time}',
  'kart.newBest': '新纪录！单圈 {time}',
  'kart.board': '今日最快圈',
  'kart.you': '你',
  'elevator.choose': '选择楼层',
  'elevator.panelHint': '数字键 1–5 或 B 选楼层，也可以用鼠标点；E / Esc 关闭',
  'zone.elevator': '观光电梯',
  'controls.mouse': '鼠标',
  'zone.corridor': '走廊',
  'zone.outside': '楼外',
  'hud.musicHint': 'M 音乐',
  'music.title': '音乐',
  'music.play': '播放',
  'music.pause': '暂停',
  'music.prev': '上一首',
  'music.next': '下一首',
  'music.mode.list': '列表循环',
  'music.mode.one': '单曲循环',
  'music.mode.shuffle': '随机播放',
  'music.volume': '音量',
  'music.import': '导入本地音乐',
  'music.dropHint': '也可以把音乐文件拖到这里',
  'music.importNote': '导入的歌曲只在本次打开期间有效，刷新页面后需要重新导入。',
  'music.builtin': '内置',
  'music.remove': '移除',
  'music.enable': '加入循环',
  'music.empty': '歌单里没有可播放的歌曲',
  'music.checking': '检查中…',
  'music.notPlaying': '未播放',
  'music.placeholder': '占位音乐（未找到内置 BGM）',
  'music.close': '关闭',
  'music.loopBadge': '无缝循环',
  'music.unsupported': '无法播放 {name}：浏览器不支持这种格式，建议转成 MP3 / M4A / FLAC / WAV。',
  'music.notAudio': '{name} 不是音频文件，已跳过。',
  'music.added': '已导入 {n} 首',
  'music.loadFailed': '内置 BGM 加载失败，改用占位音乐。',
  'debug.layoutProblems': '布局数据有 {n} 个问题（详见控制台）',
} as const;

export type I18nKey = keyof typeof zh;

const en: Record<I18nKey, string> = {
  'app.title': 'Mall Wander',
  'app.subtitle': 'A five-floor cartoon mall to explore',
  'start.click': 'Click to start',
  'start.resume': 'Click to resume',
  'start.relockWait': 'Please wait a moment before clicking (browser limit)',
  'start.loading': 'Loading…',
  'controls.move': 'Move',
  'controls.run': 'Run',
  'controls.jump': 'Jump',
  'controls.look': 'Look',
  'controls.music': 'Music panel',
  'controls.lang': '中 / EN',
  'controls.pause': 'Pause / free mouse',
  'controls.view': 'First / third person',
  'controls.interact': 'Interact (talk, sit, call elevator, rent a kart)',
  'controls.zoom': 'Camera distance (third person)',
  'controls.wheel': 'Wheel',
  'avatar.loadFailed': 'Failed to load the character model; using a placeholder.',
  'elevator.call': 'Call elevator',
  'seat.sit': 'Sit',
  'seat.stand': 'Stand up',
  'npc.talk': 'Talk',
  'npc.next': 'Next',
  'time.label': 'Time',
  'cinema.controls': 'Movie controls',
  'cinema.pick': 'Choose a local video',
  'cinema.noVideo': 'No movie selected',
  'cinema.note': 'The video plays on this computer only and is never uploaded. MP4 (H.264), WebM and other formats your browser can play are supported.',
  'cinema.stop': 'Stop',
  'cinema.hint': 'While seated in the hall, press P to pause / resume',
  'cinema.unsupported': 'Cannot play "{name}": your browser does not support this format. Please use MP4 (H.264) or WebM.',
  'time.pause': 'Freeze time',
  'time.resume': 'Resume time',
  'settings.mouse': 'Mouse sensitivity',
  'announce.label': 'Mall announcements',
  'announce.on': 'On',
  'announce.off': 'Off',
  'kart.rent': 'Rent a kart and hit the track',
  'kart.exit': 'Leave the kart',
  'kart.lap': 'Lap {n}',
  'kart.warmup': 'Out lap: timing starts at the line',
  'kart.current': 'Current',
  'kart.last': 'Last',
  'kart.best': 'Best',
  'kart.help': 'W / S throttle · brake   A / D steer   R back on track   E leave',
  'kart.lapDone': 'Lap {time}',
  'kart.newBest': 'New best! Lap {time}',
  'kart.board': 'Best laps today',
  'kart.you': 'You',
  'elevator.choose': 'Choose floor',
  'elevator.panelHint': 'Press 1–5 or B, or click a floor; E / Esc to close',
  'zone.elevator': 'Glass Elevator',
  'controls.mouse': 'Mouse',
  'zone.corridor': 'Concourse',
  'zone.outside': 'Outside',
  'hud.musicHint': 'M Music',
  'music.title': 'Music',
  'music.play': 'Play',
  'music.pause': 'Pause',
  'music.prev': 'Previous',
  'music.next': 'Next',
  'music.mode.list': 'Repeat all',
  'music.mode.one': 'Repeat one',
  'music.mode.shuffle': 'Shuffle',
  'music.volume': 'Volume',
  'music.import': 'Import local music',
  'music.dropHint': 'or drop audio files here',
  'music.importNote': 'Imported songs last only for this session; re-import them after a refresh.',
  'music.builtin': 'Built-in',
  'music.remove': 'Remove',
  'music.enable': 'Include in loop',
  'music.empty': 'No playable songs in the playlist',
  'music.checking': 'Checking…',
  'music.notPlaying': 'Not playing',
  'music.placeholder': 'Placeholder music (built-in BGM not found)',
  'music.close': 'Close',
  'music.loopBadge': 'Seamless loop',
  'music.unsupported': "Can't play {name}: this browser doesn't support the format. Try MP3 / M4A / FLAC / WAV.",
  'music.notAudio': '{name} is not an audio file and was skipped.',
  'music.added': 'Imported {n} song(s)',
  'music.loadFailed': 'Failed to load the built-in BGM; using placeholder music.',
  'debug.layoutProblems': 'Layout data has {n} problem(s) (see console)',
};

const CATEGORY: Record<ShopCategory, I18nText> = {
  bricks: { zh: '积木', en: 'Building Bricks' },
  blindbox: { zh: '潮玩盲盒', en: 'Blind Boxes' },
  fanmerch: { zh: '同人周边', en: 'Fan Merch' },
  devices: { zh: '手机电脑', en: 'Phones & Computers' },
  camera: { zh: '影音相机', en: 'Audio & Cameras' },
  consoles: { zh: '游戏主机', en: 'Game Consoles' },
  menswear: { zh: '男装', en: 'Menswear' },
  womenswear: { zh: '女装', en: 'Womenswear' },
  books: { zh: '书店', en: 'Bookstore' },
  cafe: { zh: '咖啡馆', en: 'Café' },
  karting: { zh: '室内卡丁车', en: 'Indoor Karting' },
  arcade: { zh: '游戏厅', en: 'Arcade' },
  vr: { zh: 'VR 体验', en: 'VR Experience' },
  running: { zh: '跑鞋', en: 'Running Shoes' },
  badminton: { zh: '羽毛球', en: 'Badminton' },
  sports: { zh: '综合运动', en: 'Sports' },
  foodcourt: { zh: '美食广场', en: 'Food Court' },
  cinema: { zh: '电影院', en: 'Cinema' },
  garden: { zh: '空中花园', en: 'Sky Garden' },
  supermarket: { zh: '超市', en: 'Supermarket' },
  stationery: { zh: '文具杂货', en: 'Stationery & Zakka' },
  cards: { zh: '集换式卡牌', en: 'Trading Cards' },
  plush: { zh: '毛绒玩偶', en: 'Plush Toys' },
  bakery: { zh: '面包房', en: 'Bakery' },
  phoneAccessories: { zh: '手机配件', en: 'Phone Accessories' },
  capsuleToys: { zh: '扭蛋', en: 'Capsule Toys' },
  crepes: { zh: '可丽饼', en: 'Crêpes' },
  drugstore: { zh: '药妆店', en: 'Drugstore' },
  shoes: { zh: '鞋履', en: 'Shoes' },
  accessories: { zh: '饰品配件', en: 'Accessories' },
  repair: { zh: '修鞋改衣', en: 'Repairs & Alterations' },
  eyewear: { zh: '眼镜', en: 'Eyewear' },
  bags: { zh: '箱包', en: 'Bags' },
  cosmetics: { zh: '美妆', en: 'Cosmetics' },
  kidswear: { zh: '童装', en: 'Kidswear' },
  toys: { zh: '玩具', en: 'Toys' },
  photoBooth: { zh: '大头贴', en: 'Photo Booths' },
  karaoke: { zh: 'KTV', en: 'Karaoke' },
  snacks: { zh: '零食饮品', en: 'Snacks' },
  playground: { zh: '儿童乐园', en: 'Kids Playground' },
  boardGameCafe: { zh: '桌游咖啡', en: 'Board Game Café' },
  escapeRoom: { zh: '密室逃脱', en: 'Escape Rooms' },
  outdoor: { zh: '户外用品', en: 'Outdoor Gear' },
  bikes: { zh: '自行车', en: 'Bicycles' },
  yoga: { zh: '瑜伽健身', en: 'Yoga & Fitness' },
  golf: { zh: '高尔夫', en: 'Golf' },
  juiceBar: { zh: '果汁轻食', en: 'Juice Bar' },
  climbing: { zh: '室内攀岩', en: 'Bouldering' },
  ramen: { zh: '拉面', en: 'Ramen' },
  sushi: { zh: '寿司', en: 'Sushi' },
  bubbleTea: { zh: '奶茶', en: 'Bubble Tea' },
  italian: { zh: '意大利菜', en: 'Italian' },
  curry: { zh: '咖喱', en: 'Curry' },
  grill: { zh: '烧烤牛排', en: 'Grill' },
  sweets: { zh: '甜品', en: 'Sweets' },
  deli: { zh: '熟食', en: 'Deli' },
};

const dicts: Record<Lang, Record<I18nKey, string>> = { zh, en };

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {
    // 隐私模式等情况下 localStorage 不可用，用默认值
  }
  return 'zh';
}

let current: Lang = readStoredLang();
const listeners = new Set<(lang: Lang) => void>();

export const i18n = {
  get lang(): Lang {
    return current;
  },
  t(key: I18nKey, vars?: Record<string, string | number>): string {
    let s = dicts[current][key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  },
  /** 取数据里的双语文本 */
  pick(text: I18nText): string {
    return text[current];
  },
  category(c: ShopCategory): string {
    return CATEGORY[c][current];
  },
  set(lang: Lang) {
    if (lang === current) return;
    current = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // 忽略
    }
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    for (const l of listeners) l(lang);
  },
  toggle() {
    this.set(current === 'zh' ? 'en' : 'zh');
  },
  onChange(cb: (lang: Lang) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
