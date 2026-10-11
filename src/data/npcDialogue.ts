import type { I18nText } from './layoutTypes.ts';

// 21 家主要店（mallLayout.ts 里 tier: 'main'）的店员和台词。
// - 玩家按 E 逐句查看，播完循环，所以第 1 句要能当开场白。
// - zh 是字幕和配音文本；en 只用于英文界面的字幕，配音始终是中文。
// - tts 只在 zh 里有容易读错的东西（带符号的店名、连写的英文店名、B1 之类）时才写。
// - 配音由 tools/voice/generate.ts 离线生成（Qwen3-TTS VoiceDesign），改了 tts/zh、instruct 或 seed 后重跑即可，
//   脚本按哈希只重做改动过的句子。顺序与 mallLayout.ts 的店铺顺序一致。

export interface DialogueLine {
  id: string;
  zh: string;
  en: string;
  /** 朗读文本（品牌名读法等），省略则用 zh */
  tts?: string;
}

export interface NpcDef {
  shopId: string; // = shop id
  name: I18nText; // 店员称呼，如 { zh: '店长 小乐', en: 'Manager Leo' }
  personality: string; // 一句话性格（中文，给自己看）
  voice: { instruct: string; seed: number }; // VoiceDesign 声音描述（中文）+ 固定 seed
  lines: DialogueLine[]; // 3–5 句；id 形如 `${shopId}-01`
}

type LineSpec = Omit<DialogueLine, 'id'>;

function npc(shopId: string, name: I18nText, personality: string, voice: NpcDef['voice'], lines: LineSpec[]): NpcDef {
  return {
    shopId,
    name,
    personality,
    voice,
    lines: lines.map((l, i) => ({ id: `${shopId}-${String(i + 1).padStart(2, '0')}`, ...l })),
  };
}

export const npcs: NpcDef[] = [
  // ---------- B1 ----------
  npc(
    'dailyharvest',
    { zh: '收银员 小麦', en: 'Cashier Mia' },
    '元气满满的超市收银员，记得每一张打折贴，扫码快得像一阵风。',
    { instruct: '二十出头的年轻女声，音调偏高，声音明亮清脆，标准普通话，语速偏快，热情开朗、元气十足，说话带着笑意。', seed: 1001 },
    [
      { zh: '欢迎光临Daily Harvest！今天草莓特价，红得跟我的围裙一个颜色！', en: 'Welcome to Daily Harvest! Strawberries are on sale today—same red as my apron!' },
      { zh: '购物车在前厅，篮子在入口旁边，想拿几个拿几个！', en: 'Carts are out in the hall and baskets are by the entrance—grab as many as you like!' },
      { zh: '东西太多拿不动？前厅有寄存柜，存好了再上楼慢慢逛。', en: 'Too much to carry? There are lockers in the hall—stash your bags and take your time upstairs.' },
      { zh: '我扫码一秒一件，店长说我是收银台上的小旋风！', en: 'I scan one item a second—the manager calls me the checkout whirlwind!' },
      { zh: '东边的扶梯从这儿直通楼上，观光电梯在中间，能一路坐到五楼。', en: 'The east escalators go straight up from here, and the glass elevator in the middle runs all the way to 5F.' },
    ],
  ),

  // ---------- 1F ----------
  npc(
    'pixelfox',
    { zh: '店长 阿凯', en: 'Manager Kai' },
    '说话全是游戏术语的资深玩家，自称“试玩区连胜王”。',
    { instruct: '二十五岁左右的年轻男声，中音偏亮，标准普通话，语速较快，带点慵懒的玩家腔调，自信又爱开玩笑。', seed: 1002 },
    [
      { zh: '欢迎来到PixelFox！试玩区的手柄随便拿，输了可别怪手柄哦。', tts: '欢迎来到Pixel Fox！试玩区的手柄随便拿，输了可别怪手柄哦。', en: "Welcome to PixelFox! Grab any controller in the demo area—just don't blame it when you lose." },
      { zh: '新到的掌机游戏我已经通关三遍了。剧透要收费，不剧透免费。', en: "I've already beaten the new handheld game three times. Spoilers cost extra; silence is free." },
      { zh: '我的人生信条：先存档，再冒险。买东西也一样，先试玩再付款！', en: 'My motto: save first, then adventure. Same with shopping—try before you buy!' },
      { zh: '玩饿了就去B1的Daily Harvest回回血，东边的扶梯能直达。', tts: '玩饿了就去地下一层的Daily Harvest回回血，东边的扶梯能直达。', en: 'Hungry from gaming? Restore your HP at Daily Harvest on B1—the east escalators go straight there.' },
    ],
  ),
  npc(
    'orbit',
    { zh: '产品顾问 诺娃', en: 'Specialist Nova' },
    '说话像新品发布会的科技控，什么都想“重新定义”一下。',
    { instruct: '二十多岁的成年女声，音调中等，声音干净利落，标准普通话，吐字非常清晰，语速适中偏快，自信专业，像新品发布会的主持人。', seed: 1003 },
    [
      { zh: '你好，欢迎来到Orbit。今天，想重新定义生活的哪一部分？', en: 'Hello, and welcome to Orbit. Which part of your life shall we redefine today?' },
      { zh: '这款耳机降噪特别强，戴上它，连闹钟都听不见。所以，别戴着睡觉。', en: "These headphones cancel noise so well you won't even hear your alarm. So, don't sleep in them." },
      { zh: '我每天给手机更新三次系统。可惜，我本人还没有升级。', en: "I update my phone three times a day. Sadly, I myself haven't been upgraded yet." },
      { zh: '扶梯在东西两个中庭，北边上行，南边下行，别走反了哦。', en: "The escalators are in the east and west courts—up on the north side, down on the south. Don't mix them up!" },
    ],
  ),
  npc(
    'bricknest',
    { zh: '店长 方叔', en: 'Uncle Fang' },
    '一丝不苟的积木大叔，零件按颜色排队，谁插队他都看得出来。',
    { instruct: '四十多岁的中年男声，音调偏低，声音温厚，标准普通话，语速平稳偏慢，耐心和蔼，带一点憨厚的幽默。', seed: 1004 },
    [
      { zh: '来啦？BrickNest的试拼桌正空着，坐下拼一会儿吧。', tts: '来啦？Brick Nest的试拼桌正空着，坐下拼一会儿吧。', en: 'Hey there! The build table at BrickNest is free—have a seat and build for a bit.' },
      { zh: '我把零件按颜色排好了队，谁偷偷插队，我一眼就看得出来。', en: 'I line my pieces up by color. If one sneaks out of line, I spot it right away.' },
      { zh: '那座城堡我拼了三个月，别碰塔尖，它脾气不太好。', en: "That castle took me three months. Don't touch the spire—it has a bit of a temper." },
      { zh: '友情提示：光着脚的时候，千万别走进我家客厅。', en: 'Friendly tip: never walk into my living room barefoot.' },
    ],
  ),
  npc(
    'kaze',
    { zh: '摄影师 林岚', en: 'Photographer Lan' },
    '酷酷的摄影师，三句话离不开“光线”，看谁都在找角度。',
    { instruct: '三十岁左右的女声，中低音，声音略带沙哑，标准普通话，语速偏慢，语气淡定、有点酷，带一点文艺感。', seed: 1005 },
    [
      { zh: '欢迎来到Kaze。别动……嗯，你站的这个位置，光线刚刚好。', en: "Welcome to Kaze. Don't move... yes, the light right where you're standing is perfect." },
      { zh: '新手先试试这台定焦相机，轻，安静，拍什么都好看。', en: 'Beginners, try this prime-lens camera. Light, quiet, and everything looks good through it.' },
      { zh: '中央中庭有天窗，下午的阳光最好，拍照记得去那儿。', en: 'The center court has a skylight. The afternoon sun there is the best—go take some photos.' },
      { zh: '我拍过一万张照片。最满意的那一张，镜头盖没摘。', en: "I've taken ten thousand photos. My favorite one? Lens cap still on." },
    ],
  ),
  npc(
    'blindstar',
    { zh: '店员 星星', en: 'Clerk Stella' },
    '迷信开盒玄学的少女，每个盒子都要先摇三下再许愿。',
    { instruct: '十八九岁的少女声，音调偏高，声音甜美俏皮，标准普通话，语速轻快，神神秘秘又忍不住兴奋。', seed: 1006 },
    [
      { zh: '嘘——欢迎来到BlindStar！今天的星象说，隐藏款就在你手边。', tts: '嘘——欢迎来到Blind Star！今天的星象说，隐藏款就在你手边。', en: 'Shh—welcome to BlindStar! The stars say the secret edition is within reach today.' },
      { zh: '开盒之前先摇三下，再对着它许个愿，这是我的独家玄学。', en: 'Shake it three times before opening, then make a wish. My secret ritual.' },
      { zh: '我上次连开十个，全是同一款。它一定是爱上我了。', en: 'Last time I opened ten in a row—all the same one. It must be in love with me.' },
      { zh: '抽到重复的也别难过，拿去和朋友换一换，就是双倍的快乐！', en: "Got a duplicate? Don't be sad—trade with a friend and that's double the fun!" },
    ],
  ),
  npc(
    'dimhub',
    { zh: '店员 阿杰', en: 'Clerk Jay' },
    '超级狂热的追番迷，一聊到新番，语速就自动翻倍。',
    { instruct: '二十岁出头的年轻男声，音调偏高，声音明亮，标准普通话，语速很快，情绪高涨、激动兴奋，像见到同好的狂热粉丝。', seed: 1007 },
    [
      { zh: '欢迎来到DimHub！你也是来找限定周边的吗？同好啊！', tts: '欢迎来到Dim Hub！你也是来找限定周边的吗？同好啊！', en: 'Welcome to DimHub! Are you here for the limited merch too? A fellow fan!' },
      { zh: '这季新番我每集看三遍：一遍看剧情，一遍看作画，一遍专门哭。', en: 'I watch every episode this season three times: once for the story, once for the art, once just to cry.' },
      { zh: '徽章墙每周一上新，来晚了，就只剩我的眼泪了！', en: "The badge wall restocks every Monday. Come late and all that's left is my tears!" },
      { zh: '我房间只有一面墙没贴海报，因为那面是窗户。', en: "Only one wall in my room has no posters—because it's a window." },
    ],
  ),

  // ---------- 2F ----------
  npc(
    'threadco',
    { zh: '裁缝 严师傅', en: 'Master Tailor Yan' },
    '讲究的老派裁缝，一眼就能报出你的尺码，说话慢条斯理。',
    { instruct: '六十岁左右的老年男声，音调低沉，声音醇厚、带磁性，标准普通话，语速缓慢，从容优雅，像一位老派绅士。', seed: 1008 },
    [
      { zh: '欢迎光临Thread&Co。请随意看看，衬衫在您左手边。', tts: '欢迎光临Thread and Co。请随意看看，衬衫在您左手边。', en: 'Welcome to Thread&Co. Please, take your time. Shirts are on your left.' },
      { zh: '不必量了，我看一眼就知道：中号，袖子再放长半寸。', en: 'No need to measure. One look tells me: a medium, with the sleeves let out half an inch.' },
      { zh: '好衣服和好朋友一样，要合身，也要经得起时间。', en: 'Good clothes are like good friends: they should fit you, and stand the test of time.' },
      { zh: '我做了四十年衣服，唯一做坏的，是给自己做的那条裤子。', en: 'Forty years of tailoring, and the only thing I ever ruined was a pair of trousers I made for myself.' },
    ],
  ),
  npc(
    'lumi',
    { zh: '造型师 小卢', en: 'Stylist Lu' },
    '热情洋溢的造型师，见谁都夸“太有氛围感了”。',
    { instruct: '二十七八岁的年轻男声，音调中等偏高，声音轻快柔和，标准普通话，语速适中，热情洋溢，语气夸张，爱用感叹。', seed: 1009 },
    [
      { zh: '哇，欢迎来到Lumi！你今天这一身，太有氛围感了！', en: 'Wow, welcome to Lumi! Your outfit today has such a vibe!' },
      { zh: '这季主打奶油色和薄荷绿，配什么都好看，配心情也行。', en: 'This season is all cream and mint—they go with everything, even your mood.' },
      { zh: '试衣间在最里面，那面镜子是我亲自挑的，照谁都好看。', en: 'Fitting rooms are at the very back. I picked that mirror myself—everyone looks great in it.' },
      { zh: '逛累了？二楼西边有Kumo Coffee，喝一杯再回来接着试！', en: 'Tired? Kumo Coffee is on the west side of this floor—grab a cup and come back to try on more!' },
    ],
  ),
  npc(
    'nibnote',
    { zh: '店员 小诺', en: 'Clerk Nora' },
    '害羞的文具控，说话轻声细语，一提到胶带就停不下来。',
    { instruct: '二十出头的年轻女声，音调中等，声音轻柔细腻，标准普通话，语速偏慢，有点害羞腼腆，轻声细语。', seed: 1010 },
    [
      { zh: '你、你好，欢迎来到Nib & Note……试写区的钢笔都可以用。', tts: '你、你好，欢迎来到Nib and Note……试写区的钢笔都可以用。', en: 'H-hello, welcome to Nib & Note... You can try any of the pens at the writing desk.' },
      { zh: '这卷纸胶带今天刚到，上面印着小猫……我已经偷偷买了五卷。', en: "This washi tape just came in today, with little cats on it... I've secretly bought five rolls." },
      { zh: '写信的话，用蓝黑墨水吧，收信的人会觉得你很认真。', en: "If you're writing a letter, try blue-black ink. Whoever gets it will know you mean it." },
      { zh: '我的笔记本比朋友还多……那个，你愿意当我的朋友吗？', en: 'I have more notebooks than friends... Um, would you like to be my friend?' },
    ],
  ),
  npc(
    'kumo',
    { zh: '咖啡师 阿云', en: 'Barista Yun' },
    '淡定的咖啡师，说话像手冲咖啡一样慢慢来。',
    { instruct: '三十多岁的成年男声，音调偏低，声音温和醇厚，标准普通话，语速缓慢，平静放松，像深夜电台的主持人。', seed: 1011 },
    [
      { zh: '欢迎来到Kumo Coffee。不急，先闻闻咖啡香，再慢慢决定。', en: 'Welcome to Kumo Coffee. No rush—breathe in the aroma first, then decide.' },
      { zh: '今天推荐浅烘手冲，带一点莓果的酸甜，像晴天的味道。', en: 'Today I recommend a light-roast pour-over. A little berry sweetness, like a sunny day.' },
      { zh: '拉花我只会画云。因为不管画什么，最后都会变成云。', en: 'The only latte art I do is clouds. Whatever I try to draw, it ends up a cloud anyway.' },
      { zh: '隔壁就是Margin Books，端一杯咖啡过去看书，刚刚好。', en: 'Margin Books is right next door. Take a coffee over and read—just right.' },
    ],
  ),
  npc(
    'marginbooks',
    { zh: '店主 温奶奶', en: 'Grandma Wen' },
    '慢悠悠的哲学派书店主人，每句话都像写在书页边上的批注。',
    { instruct: '六十多岁的老年女声，音调中低，声音温柔慈祥，标准普通话，语速很慢，从容淡定，句子之间带着思考的停顿。', seed: 1012 },
    [
      { zh: '欢迎来到Margin Books。书不会跑，你也不用急。', en: "Welcome to Margin Books. The books aren't going anywhere, so there's no need to hurry." },
      { zh: '书页边上的那片空白，是留给读者说话的地方。', en: "The blank space in a book's margins is where the reader gets to speak." },
      { zh: '找不到想要的书，就随手抽一本吧。也许，是书在找你。', en: "Can't find the book you want? Pick one at random. Maybe the book is looking for you." },
      { zh: '年轻时我想读完全世界的书，后来发现，读懂一本就够忙了。', en: 'When I was young I wanted to read every book in the world. Turns out understanding one keeps me busy enough.' },
      { zh: '窗边那把椅子最舒服，坐着坐着，一个下午就过去了。', en: 'The chair by the window is the comfiest. Sit there, and the whole afternoon slips away.' },
    ],
  ),

  // ---------- 3F ----------
  npc(
    'turbokart',
    { zh: '教练 雷哥', en: 'Coach Ray' },
    '热血沸腾的卡丁车教练，说话像在赛道边喊口令。',
    { instruct: '三十多岁的成年男声，音调偏高，嗓门洪亮有力，标准普通话，语速快，热血激昂，像在赛道边喊口令的教练。', seed: 1013 },
    [
      { zh: '欢迎来到TurboKart！头盔戴好，安全带系紧，准备——出发！', tts: '欢迎来到Turbo Kart！头盔戴好，安全带系紧，准备——出发！', en: 'Welcome to TurboKart! Helmet on, belt tight, ready—go!' },
      { zh: '记住！入弯前减速，出弯再加油！人生也是这样！', en: 'Remember! Brake before the corner, hit the gas coming out! Life works the same way!' },
      { zh: '第一次开？没关系！我第一次开的时候，是倒着冲过终点线的！', en: 'First time driving? No problem! My first time, I crossed the finish line backwards!' },
      { zh: '跑完口渴了？四楼有果汁吧，给身体加满油，再来一圈！', en: "Thirsty after a race? There's a juice bar on 4F—fill up the tank and come back for another lap!" },
    ],
  ),
  npc(
    'coinplanet',
    { zh: '管理员 琪姐', en: 'Attendant Kiki' },
    '爽朗的电玩城大姐，口袋里的代币叮当响，是抓娃娃的隐藏高手。',
    { instruct: '四十岁左右的成年女声，中音，嗓音爽朗响亮，标准普通话，语速偏快，热情豪爽，说话时爱笑。', seed: 1014 },
    [
      { zh: '欢迎来到CoinPlanet！代币在柜台换，口袋装满，快乐也装满！', tts: '欢迎来到Coin Planet！代币在柜台换，口袋装满，快乐也装满！', en: 'Welcome to CoinPlanet! Tokens at the counter—fill your pockets, and fill up on fun!' },
      { zh: '抓娃娃有诀窍：等爪子停稳了再按。别急，娃娃也会紧张。', en: 'Claw machine tip: wait till the claw stops swaying, then press. Easy—the plushies get nervous too.' },
      { zh: '跳舞机最火了，昨天有位大爷连跳十首，比年轻人还猛！', en: 'The dance machine is the hottest one—yesterday an old gent danced ten songs straight, tougher than the kids!' },
      { zh: '我的最高纪录是一下午抓了二十只娃娃，全送给小朋友啦。', en: 'My record is twenty plushies in one afternoon—I gave them all away to the kids.' },
    ],
  ),
  npc(
    'blinkvr',
    { zh: '体验官 阿泽', en: 'Guide Zed' },
    '在虚拟世界待太久的体验官，常常分不清自己在哪一层现实。',
    { instruct: '二十多岁的年轻男声，音调中等，声音轻飘、略带空灵，标准普通话，语速偏慢，迷迷糊糊、若有所思。', seed: 1015 },
    [
      { zh: '欢迎来到BlinkVR……等等，这里是现实，还是又一个关卡？', tts: '欢迎来到Blink V R……等等，这里是现实，还是又一个关卡？', en: 'Welcome to BlinkVR... wait, is this reality, or just another level?' },
      { zh: '戴上头盔，你可以在海底散步，也可以在月亮上跳绳。', en: 'Put on the headset and you can stroll along the seabed, or skip rope on the moon.' },
      { zh: '体验前请把周围清空。上次有位客人，把我当成怪兽打了一拳。', en: 'Please clear the space around you first. Last time, a guest mistook me for a monster and punched me.' },
      { zh: '我今天摘了三次头盔，可总觉得，还有一层没摘掉。', en: "I've taken off my headset three times today, but it feels like there's still one more layer." },
    ],
  ),

  // ---------- 4F ----------
  npc(
    'arc',
    { zh: '教练 安娜', en: 'Coach Anna' },
    '阳光的健身教练，说什么都要配个动作，顺便让你做个深蹲。',
    { instruct: '二十八岁左右的成年女声，音调中等偏高，声音清亮有活力，标准普通话，语速偏快，阳光积极，充满鼓励。', seed: 1016 },
    [
      { zh: '欢迎来到Arc！来，先深呼吸——吸气，呼气，很好！', en: 'Welcome to Arc! Come on, deep breath—in, and out. Great!' },
      { zh: '哑铃和瑜伽垫都在左边，选不好的话，每样都举起来试试！', en: "Dumbbells and yoga mats are on the left. Can't decide? Lift them all and see!" },
      { zh: '想坐电梯？走楼梯更健康！楼梯就在东南角，冲！', en: "Taking the elevator? Stairs are healthier! They're in the southeast corner—go, go!" },
      { zh: '我连排队都在踮脚尖，每天都比昨天强壮一点点。', en: 'I even do calf raises while waiting in line—a little stronger than yesterday, every day.' },
    ],
  ),
  npc(
    'stride',
    { zh: '跑者 老马', en: 'Runner Ma' },
    '跑了二十年马拉松的乐天大叔，什么都爱拿跑步打比方。',
    { instruct: '五十岁左右的中年男声，中低音，声音沉稳有力，标准普通话，语速适中，乐观豁达，爽朗随和。', seed: 1017 },
    [
      { zh: '欢迎来到Stride！跑步机可以试鞋，先跑两步感受一下。', en: 'Welcome to Stride! You can test shoes on the treadmill—take a few steps and feel the difference.' },
      { zh: '买跑鞋最好下午来，那时候脚会大一点点，这是老跑者的秘密。', en: "Buy running shoes in the afternoon—your feet are a little bigger then. An old runner's secret." },
      { zh: '我跑过二十场马拉松，最累的一次，是陪家人逛商场。', en: "I've run twenty marathons. The most exhausting one? Shopping at the mall with my family." },
      { zh: '跑完饿了就上五楼，Food Alley的饭，跑完吃最香。', en: 'Hungry after a run? Head up to 5F—food at Food Alley tastes best after a workout.' },
      { zh: '慢慢跑不丢人，停下来，才会被风超过。', en: 'Running slow is nothing to be ashamed of. Only when you stop does the wind pass you by.' },
    ],
  ),
  npc(
    'shuttle',
    { zh: '店员 小羽', en: 'Clerk Yu' },
    '好胜的羽毛球少女，三句话不离“杀球”，随时想找人单挑。',
    { instruct: '二十岁左右的年轻女声，音调偏高，声音清脆利落，标准普通话，语速快，好胜爽快，带点俏皮的挑衅。', seed: 1018 },
    [
      { zh: '欢迎来到Shuttle！会打羽毛球吗？不会也没关系，我教你杀球！', en: "Welcome to Shuttle! Play badminton? If not, no problem—I'll teach you to smash!" },
      { zh: '新手选拍子别贪重，轻一点的拍子，挥起来更快。', en: "Beginners, don't go for a heavy racket. A lighter one swings faster." },
      { zh: '我的杀球可快了，快到连我自己都没看清。', en: "My smash is so fast even I can't see it." },
      { zh: '隔壁Stride卖跑鞋。脚步快了，接球也就快了！', en: 'Stride next door sells running shoes. Faster feet, faster returns!' },
    ],
  ),

  // ---------- 5F ----------
  npc(
    'garden',
    { zh: '园丁 陶爷爷', en: 'Grandpa Tao' },
    '会跟植物聊天的老园丁，记得每一盆花的生日。',
    { instruct: '七十岁左右的老年男声，音调低，声音温暖、略带沙哑，标准普通话，语速很慢，慈祥悠闲，说话带着笑意。', seed: 1019 },
    [
      { zh: '哟，欢迎来到Skyline Garden。慢点走，别踩着我的小番茄。', en: 'Oh, welcome to Skyline Garden. Easy now—mind my little tomatoes.' },
      { zh: '这盆薄荷今天心情不错，你闻闻，它在跟你打招呼呢。', en: "This mint is in a good mood today. Have a sniff—it's saying hello." },
      { zh: '傍晚来看日落最好，整座城市都会变成橘子色。', en: 'Come at dusk for the sunset. The whole city turns the color of oranges.' },
      { zh: '种花和交朋友一样，多晒太阳，多浇水，别老催它。', en: "Growing flowers is like making friends: plenty of sun, plenty of water, and don't rush them." },
      { zh: '逛饿了？往东走几步，就是Food Alley。', en: "Getting hungry? A few steps east and you're at Food Alley." },
    ],
  ),
  npc(
    'cinema',
    { zh: '引座员 朵拉', en: 'Usher Dora' },
    '戏精附体的引座员，把每一次检票都演成电影首映礼。',
    { instruct: '三十岁左右的成年女声，音调中等，声音饱满有感染力，标准普通话，语速时快时慢，抑扬顿挫非常夸张，像舞台剧演员在念台词。', seed: 1020 },
    [
      { zh: '欢迎来到——Starlight Cinema！今晚的主角，就是你！', en: 'Welcome to—Starlight Cinema! Tonight, the star of the show is you!' },
      { zh: '爆米花要大桶的。因为精彩的剧情，总是来得猝不及防！', en: 'Get the big bucket of popcorn. Great plot twists always strike without warning!' },
      { zh: '请把手机调成静音。上次有人铃声一响，反派都吓得忘词了。', en: 'Please silence your phone. Last time one rang, the villain was so startled he forgot his lines.' },
      { zh: '影厅足足有两层楼高，坐最后一排，也看得清主角的睫毛。', en: "The theater is two stories tall—even from the back row you can see the hero's eyelashes." },
    ],
  ),
  npc(
    'foodalley',
    { zh: '大厨 老周', en: 'Chef Zhou' },
    '乐呵呵的美食广场大厨，什么话题都能绕回到吃上。',
    { instruct: '四十多岁的中年男声，音调中低，声音洪亮圆润，标准普通话，语速适中，乐呵呵的，热情好客，像邻家的大厨。', seed: 1021 },
    [
      { zh: '欢迎来到Food Alley！饿了吧？我听见了，你的肚子在叫。', en: "Welcome to Food Alley! Hungry? I can hear it—your stomach's growling." },
      { zh: '拉面、寿司、咖喱都在这排档口，选不出来，就每样来一点！', en: "Ramen, sushi, curry—all along this row of stalls. Can't choose? Have a bit of each!" },
      { zh: '吃饱了去西边的空中花园走走，消化好了，下一顿才香。', en: 'Once you are full, take a stroll in the rooftop garden to the west. Digest well, and the next meal tastes even better.' },
      { zh: '我这辈子只减过一次肥。减到一半，开饭了。', en: 'I have only tried dieting once in my life. Halfway through, dinner was served.' },
    ],
  ),
];

const byShop = new Map(npcs.map((n) => [n.shopId, n]));

export function npcByShop(shopId: string): NpcDef | undefined {
  return byShop.get(shopId);
}
