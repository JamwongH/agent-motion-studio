---
name: ai-tutorial-studio
description: 在 Agent Motion Studio 中维护、调用或扩展 AI 教程镜头组件、个人风格与保存的封装，将可视化配置接入视频制作。
---

# AI Tutorial Studio

此 fork 的工作台负责可复用镜头配置。先读取 `docs/studio.md`；组件和参数以 `studio/catalog.mjs` 为准，不猜测未注册能力。

## 使用个人封装

通过本机 `GET /api/studio/catalog` 查找已有 presets/styles；`GET /api/studio/assets` 查找素材。服务未启动时，可读取 `studio-data/presets.json`、`styles.json` 和 `assets.json`。不存在时从内置组件默认值开始，不把它描述为用户已经确定的风格。

封装保存完整风格快照和素材角色编号。先验证角色对应的素材确实存在，再调用 `POST /api/studio/export` 生成镜头。跨机器配置缺失素材时恢复占位并说明需要重新绑定；配置不可执行代码。

生成镜头使用 `?export=1`，等待 `window.film.ready`，随后 `await window.film.renderAt(t)` 再捕获。检查非顺序 seek 和重复时间，确保动效不依赖上一帧。真实视频帧须等待解码；画面上的占位框不是软件真实操作记录。

## 扩展组件

同步修改 catalog 参数契约、draw 布局和必要的播放器能力；管理页与生成镜头共用播放器。用参数范围验证与一次真实浏览器往返检验新增能力。改变保存配置含义时提高组件版本并提供迁移。

## 接入整片

涉及整片制作时仍读取项目本地 Motion Craft；SRT/真人口播任务同时读取 SRT 与参考驱动制作。Studio 只是镜头输入层，不替代全片节奏、声音和验收流程。

本 fork 的人物圆形小窗可保留原背景；只有需要透明人物叠层时才执行抠像与边缘检查。此范围选择覆盖上游把所有真人任务统一要求抠像的默认步骤，其余制作要求继续适用。

当前没有整片多轨、原声编排或工作台一键 MP4 导出。B-roll 与 CG 是待接入的独立镜头/素材来源，不宣称已经集成。不得把独立 HTML 镜头或截图当作完成的成片。
