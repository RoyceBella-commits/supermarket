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
