import type { DialogueLine, NpcDef } from './npcDialogue.ts';

// 商场广播：叮咚提示音 + 中文配音 + 字幕（中文界面显示中文，英文界面显示英文），播放时 BGM 压低。
// trigger：timed 定时轮播；其余按游戏内时间触发（清晨、日落、入夜）或影院开场前。
// 配音由 tools/voice/generate.ts 生成到 public/audio/voice/announcer/。广播员音色先试音（三个候选），确认后批量生成。

export type AnnouncementTrigger = 'timed' | 'morning' | 'sunset' | 'night' | 'cinema';

export interface Announcement extends DialogueLine {
  trigger: AnnouncementTrigger;
}

export interface AnnouncerVoice {
  key: string;
  label: string;
  instruct: string;
  seed: number;
}

/** 广播员音色候选（试音用） */
export const ANNOUNCER_CANDIDATES: AnnouncerVoice[] = [
  {
    key: 'a',
    label: '亲切年轻女声',
    instruct: '二十多岁的年轻女声，音调中等偏高，声音甜美清亮，标准普通话，吐字清晰，语速平稳适中，亲切温柔，像商场里的广播员，说话带着微笑。',
    seed: 2001,
  },
  {
    key: 'b',
    label: '端庄播音女声',
    instruct: '三十岁左右的成熟女声，音调中等，声音温润饱满，标准普通话，播音腔，吐字非常清晰，语速平稳偏慢，端庄大方，像电视台的播音员。',
    seed: 2002,
  },
  {
    key: 'c',
    label: '明亮主持男声',
    instruct: '二十多岁的年轻男声，音调中等，声音明亮干净，标准普通话，吐字清晰，语速适中，热情有活力，像活动现场的主持人。',
    seed: 2003,
  },
];

/** 选定的广播员音色（试音确认后改这里，再批量生成） */
export const ANNOUNCER_VOICE: AnnouncerVoice = ANNOUNCER_CANDIDATES[0];

type Spec = Omit<Announcement, 'id'>;

const specs: Spec[] = [
  {
    trigger: 'timed',
    zh: '各位顾客，欢迎光临Mall Wander商场漫游。B1是Daily Harvest超市，五楼是美食广场和空中花园，祝您逛得开心。',
    tts: '各位顾客，欢迎光临Mall Wander商场漫游。地下一层是Daily Harvest超市，五楼是美食广场和空中花园，祝您逛得开心。',
    en: 'Welcome to Mall Wander! Daily Harvest supermarket is on B1, and the food court and sky garden are on 5F. Enjoy your visit!',
  },
  {
    trigger: 'timed',
    zh: 'Daily Harvest生鲜限时特卖开始啦！草莓和当季蔬菜正在特价，欢迎到B1选购。',
    tts: 'Daily Harvest生鲜限时特卖开始啦！草莓和当季蔬菜正在特价，欢迎到地下一层选购。',
    en: 'The Daily Harvest fresh-food time sale has begun! Strawberries and seasonal vegetables are on special on B1.',
  },
  {
    trigger: 'timed',
    zh: '五楼Food Alley美食广场正在营业，多家档口等您品尝。用餐后，请将餐盘送回档口。',
    en: 'Food Alley on 5F is open with plenty of stalls to try. After your meal, please return your tray to the stall.',
  },
  {
    trigger: 'timed',
    zh: '三楼TurboKart卡丁车场正在营业，在前台登记就能开跑，欢迎来挑战全场最快圈速！',
    tts: '三楼Turbo Kart卡丁车场正在营业，在前台登记就能开跑，欢迎来挑战全场最快圈速！',
    en: 'TurboKart on 3F is open. Sign up at the front desk and hit the track — come and set the fastest lap!',
  },
  {
    trigger: 'timed',
    zh: '乘坐扶梯时，请站稳扶好，照看好身边的小朋友，不要在扶梯上奔跑。',
    en: 'When riding the escalators, please hold the handrail, keep an eye on children, and do not run.',
  },
  {
    trigger: 'timed',
    zh: '中央中庭的观光电梯可以直达B1到五楼，推婴儿车和行动不便的顾客请优先乘坐。',
    tts: '中央中庭的观光电梯可以直达地下一层到五楼，推婴儿车和行动不便的顾客请优先乘坐。',
    en: 'The glass elevator in the central atrium serves B1 to 5F. Priority is given to guests with strollers or limited mobility.',
  },
  {
    trigger: 'timed',
    zh: '如果您遗失了物品，请到一楼服务中心咨询，我们会尽快帮您寻找。',
    en: 'If you have lost an item, please visit Guest Services on 1F and we will help you look for it.',
  },
  {
    trigger: 'timed',
    zh: '逛累了的话，商业街和中庭旁都有休息长椅，欢迎随时坐下来歇一歇。',
    en: 'Feeling tired? There are benches along the main street and around the atrium — take a seat anytime.',
  },
  {
    trigger: 'cinema',
    zh: 'Starlight Cinema的下一场电影即将开始，请前往五楼影院检票口入场。',
    tts: 'Starlight Cinema的下一场电影即将开始，请前往五楼影院检票口入场。',
    en: 'The next screening at Starlight Cinema is about to begin. Please proceed to the ticket gate on 5F.',
  },
  {
    trigger: 'morning',
    zh: '早上好！新的一天开始了。二楼Kumo Coffee的手冲咖啡已经准备好，欢迎来坐一坐。',
    tts: '早上好！新的一天开始了。二楼Kumo Coffee的手冲咖啡已经准备好，欢迎来坐一坐。',
    en: 'Good morning! A new day has begun. The pour-over coffee at Kumo Coffee on 2F is ready — drop by for a cup.',
  },
  {
    trigger: 'sunset',
    zh: '傍晚到了，五楼Skyline Garden空中花园的日落非常美，欢迎上去看一看。',
    tts: '傍晚到了，五楼Skyline Garden空中花园的日落非常美，欢迎上去看一看。',
    en: 'Evening is here. The sunset from Skyline Garden on 5F is beautiful — come up and take a look.',
  },
  {
    trigger: 'night',
    zh: '夜幕降临，各层灯光已经点亮。空中花园的夜景同样迷人，走动时请注意脚下安全。',
    en: 'Night has fallen and the lights are on. The sky garden is lovely at night too — please watch your step.',
  },
];

export const announcements: Announcement[] = specs.map((s, i) => ({ id: `announcer-${String(i + 1).padStart(2, '0')}`, ...s }));

const asSpeaker = (shopId: string, voice: AnnouncerVoice, lines: DialogueLine[]): NpcDef => ({
  shopId,
  name: { zh: `广播员（${voice.label}）`, en: `Announcer (${voice.key})` },
  personality: '商场广播员',
  voice: { instruct: voice.instruct, seed: voice.seed },
  lines,
});

/**
 * 配音脚本用：广播员当作一位“说话人”。
 * announcer 是正式音色的全部广播；announcer-a/b/c 是试音候选，每个只有第 1 句。
 */
export function announcerSpeakers(): NpcDef[] {
  return [
    asSpeaker('announcer', ANNOUNCER_VOICE, announcements),
    ...ANNOUNCER_CANDIDATES.map((v) => asSpeaker(`announcer-${v.key}`, v, [{ ...announcements[0], id: `announcer-${v.key}-01` }])),
  ];
}
