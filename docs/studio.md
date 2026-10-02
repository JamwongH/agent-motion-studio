# Agent Motion Studio 工作台

本分支在 Agent Motion 上增加本地组件工作台。上游的制作 Skill、历史、许可证和署名保留；新增代码与修改入口由本 fork 维护。

## 启动

需要 Node.js 22+，首次运行先 `npm ci`，随后：

```sh
npm run studio
```

打开 http://127.0.0.1:8794/studio/ 。端口占用时使用 `PORT=8795 npm run studio`。

## 使用

1. 在组件库选择镜头，右侧可播放、暂停、拖动时间，并修改参数。
2. 在风格管理选择预设，或修改五种颜色、背景材料，保存为自己的风格。
3. 在素材库添加本地 PNG、JPG、WebP、MP4、MOV、WebM，再在右侧素材绑定中选择。每份素材上限 150 MB；实际解码取决于浏览器支持的编码。
4. 「另存为我的组件」把参数、风格快照和素材编号保存为一个封装，在「我的封装」重新打开。编辑已有封装后，可「保存当前封装的修改」，也可以另存新版本。
5. 「导出配置」生成 JSON。「生成镜头」生成独立 HTML 镜头，点击链接预览。当前没有整片时间线或一键 MP4 导出。

数据写在 `studio-data/`，镜头写在 `work/studio-scenes/`；都被 Git 忽略。这里的“添加素材”只将文件复制到本机。JSON 不包含素材本体；迁移电脑需重新添加并绑定。

## 组件扩展与 Skill

`studio/catalog.mjs` 注册组件 ID、版本、参数范围和素材角色；`studio/components/draw.mjs` 实现绝对时间布局；`studio/core/player.mjs` 用 Three.js 展示同一组件。管理页与生成镜头复用此播放器，避免分别维护两套效果。

添加组件需同步注册表和布局分支。参数以声明式 JSON 保存，不执行配置中的 JavaScript。修改已保存配置的含义时提高组件版本，并明确提供迁移，不能静默套用新行为。

项目内 [AI Tutorial Studio Skill](../.agents/skills/ai-tutorial-studio/SKILL.md) 帮助 agent 从已保存封装开始制作。它是工作台与现有制作 Skill 的桥接入口。

生成镜头暴露：

```js
window.film.ready
window.film.duration
window.film.fps
await window.film.renderAt(seconds)
window.film.capture() // PNG data URL
```

在镜头 URL 加 `?export=1` 停止自动播放，方便按绝对时间抓帧。视频素材先 seek 并等待解码；`sourceIn` 是入点，`rate` 是速度，结束时保持最后一帧。当前单组件内共用入点与速度；各路独立源时间、原声与整片编排列入下一阶段。

## 验证

```sh
npm run test:studio
BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run check:studio
```

第二项使用独立临时数据，检查真实页面保存/刷新、参数修改、素材解码与源时间、重复 seek、独立镜头复用，并将截图保存到忽略的 `artifacts/studio/`。浏览器路径可以替换为自己的 Chrome/Chromium。

本工作台是可用的组件管理第一版。纸纹和撕纸是程序化效果；高质量抠像、真实纸纤维、案例 CG、B-roll 镜头接入与整片导出仍需开发或独立制作。原 Motion Craft Community License 1.0 的非商业条件继续适用，私有仓库不改变许可。
