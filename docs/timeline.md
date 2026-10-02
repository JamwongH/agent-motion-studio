# 统一时间线

打开工作台的「统一时间线」，或 http://127.0.0.1:8794/studio/#timeline 。首次进入会显示一个 16 秒的占位示例；示例不代表实际口播内容或剪映工程。

## 编辑流程

1. 点选片段，在右侧修改起点、时长、素材和内容。横向拖动改变起点，拖动右边缘改变时长；修改会对齐到整帧。
2. 添加组件镜头或调用「我的封装」。每路人物、录屏、案例素材分别设置入点和速度；动效速度与素材速度独立。
3. 添加独立画面和文字字幕。文字可改内容、字体、字号、颜色、位置和宽高，当前提供 Noto Sans SC 与 Ma Shan Zheng。字幕自动换行并限制在文本框内。
4. 画面与文字的关键帧支持位置、宽高、透明度和旋转。把播放头移到选中片段内部，选择属性和数值，再「在播放头添加」。点击已有关键帧可移除。
5. 在原声/音乐轨道绑定 WAV、MP3、M4A 或带声音的视频，设置源时间、速度、音量及淡入淡出。画面轨的视频静音；播放时由音频轨发声，暂停/拖动时不播放声音。
6. 需要同时显示多个画面、字幕或混合多路音频时，添加对应类型的轨道。新轨道会成为添加目标；点击轨道空白区域也可选择目标轨道。
7. 项目支持撤销、重做、镜头前后调整、复制和移除片段。保存项目后刷新可恢复；切换导航不丢弃当前草稿。未保存修改不会跨刷新恢复。
8. 导出时间线 JSON 或生成独立整片 HTML 预览。JSON 保留可编辑数据，不包含素材本体。导入到另一台电脑前需添加对应素材并修正绑定编号。

同一轨道的片段不能重叠；需要叠加时使用另一条轨道。当前只支持一条组件镜头轨。组件镜头为底层，独立画面位于其上，文字位于最上层；同类轨道按项目顺序叠放。点击轨道的圆点可关闭画面/文字，或静音音频。

## 数据契约

`studio/timeline/model.mjs` 定义并验证项目。时间采用整数帧，源素材入点采用秒：

```json
{
  "schemaVersion": 1,
  "kind": "motion-studio-project",
  "id": "project-example",
  "name": "我的 AI 教程",
  "width": 720,
  "height": 1280,
  "fps": 30,
  "durationFrames": 480,
  "style": "完整风格快照",
  "tracks": ["scene / visual / text / audio 类型的轨道"]
}
```

上方是字段说明，不是可直接导入的完整项目。使用界面导出或 `exampleProject()` 取得有效样例。

所有片段均有 `id/name/startFrame/durationFrames`，有效范围为 `[startFrame, startFrame + durationFrames)`。四类片段：

- **scene**：完整组件封装快照，`animationIn/animationRate/showText`，每路 `bindings[role] = {assetId, source:{in,rate}}`。
- **visual**：素材编号或占位、源时间、取景、窗口形状、`rect` 与关键帧。
- **text**：文字、字体、字号、字重、颜色、文本框及关键帧。
- **audio**：素材编号、源时间、音量及淡入淡出帧数。

`resolve.mjs` 将项目与全局时间解析成面板、文字、效果、素材采样时间和音量。组件布局仍调用现有 `layout()`，其文字和效果现在返回结构化描述。`player.mjs` 只负责加载素材和按解析结果渲染，工作台与独立预览共用该播放器。

连续片段以共同的帧边界连接。视觉素材结束后保持最后一帧，音频源耗尽后停止播放。视频按目标源时间 seek 并等待解码；音频播放依据全局时钟、源入点和速度纠偏。暂停及离开页面时停止音频。

关键帧时间是片段内的整数帧。没有第 0 帧关键帧时，从静态属性插值到首个关键帧；末个关键帧之后保持其值。支持线性与平滑插值，界面新增关键帧默认平滑插值。

## 接口和验收

- `GET /api/studio/projects`：读取本机保存项目。
- `POST /api/studio/projects`：验证并保存项目；不会改动已有组件封装。
- `POST /api/studio/project-export`：验证素材是否存在，生成 `work/studio-projects/<id>/project.json` 和 HTML。

数据写在忽略的 `studio-data/projects.json`。独立预览的 `window.film.renderAt(t)` 使用相同解析器，等待完成后可 `window.film.capture()`。预览需要当前工作台服务，不是独立打包网站。

```sh
npm run test:studio
BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" FFMPEG_PATH="你的 ffmpeg 路径" npm run check:timeline
```

浏览器检查使用临时数据，涵盖拖动/时长、源时间、关键帧、音频 transport、保存刷新、JSON 与预览/导出像素一致性；截图在 `artifacts/timeline/`。

## 下一步：剪映适配器

现在完成的是统一项目数据和浏览器预览，尚未安装或集成 pyJianYingDraft，也没有生成或验证剪映草稿。

后续剪映适配器应读取同一项目契约：文字、图片、普通视频与音频转换为原生轨道，常规运动转换为关键帧；复杂 Three.js 透视和程序化撕纸按需要渲染成素材。不能把全部内容合成为单条视频后声称仍可分层编辑。

首个剪映样例应验证实际剪映版本能打开、修改、保存和导出。完整 MP4 导出、导出音频混合、自动字幕/SRT 导入、波形、吸附/波纹剪辑、轨道重排和 B-roll 接入仍未实现。
