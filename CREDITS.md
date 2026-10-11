# Credits

## 音乐

公开版内置歌单（`public/audio/bgm/public/`）：

- J. S. Bach《哥德堡变奏曲》BWV 988，演奏：Kimiko Ishizaka，录音 *The Open Goldberg Variations*（2012），CC0 公有领域贡献。
  来源：<https://archive.org/details/OpenGoldbergVariations>
  - Aria — <https://commons.wikimedia.org/wiki/File:Goldberg_Variations_01_Aria.ogg>
  - Variation 13 — <https://commons.wikimedia.org/wiki/File:Goldberg_Variations_14_Variatio_13_a_2_Clav.ogg>
  - Aria da Capo — <https://commons.wikimedia.org/wiki/File:Goldberg_Variations_32_Aria_da_Capo_%C3%A8_Fine.ogg>
  - Variation 19 — <https://commons.wikimedia.org/wiki/File:Goldberg_Variations_20_Variatio_19_a_1_Clav.ogg>

  处理：去掉首尾静音、响度统一到约 −18 LUFS、编码为 AAC 128 kbps。

本机版 BGM（Chelsea McGough《Reminiscence》）是商业曲目，只在开发者本机使用，不包含在仓库中。

## 店铺与品牌

所有店铺名和招牌都是原创虚构，不对应任何真实品牌。

## 角色模型

玩家和 21 位店员的 VRM 模型由 `tools/vrm/` 里的脚本用代码生成（几何体 + MToon 材质），原创形象。

## 装饰插图

`public/textures/decor/` 里的 16 张海报、菜单板和图集（书封、盲盒、积木盒、美食）由 Codex CLI 内置 image_gen（模型 gpt-6.1-sol）为本项目生成，提示词和生成记录见 `tools/decor/prompts/`、`tools/decor/prompts.json`。画面中没有文字、商标或真实品牌，店名等文字由游戏代码叠加。

## 店员配音

店员语音由本机 Qwen3-TTS（Qwen3-TTS-12Hz-1.7B-VoiceDesign）根据文字描述设计音色离线生成，不模仿任何真人声音。生成脚本见 `tools/voice/`。
