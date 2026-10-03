# 剪映工程导出（首版）

统一时间线下方点击「导出剪映工程」。导出在后台排队，界面显示帧进度；完成后下载 ZIP 和查看分层说明。每次生成独立目录，不覆盖上次工程。草稿和原素材仅保存在本机，默认不写入剪映已有草稿目录。

## 能编辑什么

| 时间线内容 | 剪映中的结果 |
| --- | --- |
| 独立图片 / 视频画面 | 原生视频轨，可剪切、移动、换素材；保存入点、速度、取景和常规位置/缩放/旋转关键帧 |
| 独立字幕 | 原生文字轨，可改内容、字体、字号、位置；宽高动画映射为缩放 |
| 原声 / 音乐 | 原生音频轨，可剪切、调音量，带源入点、速度和淡入淡出 |
| 组件镜头 | 每个镜头单独渲染成静音 MP4，可移动、剪切；其中人物、录屏、装饰文字和复杂透视不可在剪映内拆开修改 |
| 场景间空白 | 当前项目风格的背景图片 |

要在剪映替换真人或录屏，应在工作台使用**独立画面轨**；要改字幕，使用**独立文字轨**。组件内部素材仍需回工作台修改再生成。不把完整时间线合成一条视频。

关闭的轨道不导出。未绑定的独立画面/音频明确报错；组件未绑定角色仍保留占位。独立源视频长度不足时导出报错，需缩短片段或先制作尾帧延长素材；组件内的视频继续使用预览的尾帧保持策略。音频耗尽后留空静音，不循环。平滑运动按共同 `sampleRect()` 逐帧采样为剪映线性关键帧。

## 安装导出依赖

Node 使用项目的 22+ 版本。Python 包采用隔离环境和固定版本，来源为 [pyJianYingDraft 官方项目](https://github.com/GuanYixuan/pyJianYingDraft)，本适配器实际调用其 `ScriptFile`、`append_track`、`VideoSegment`、`TextSegment` 与 `AudioSegment`，不复制其库代码。

macOS / Linux：

```sh
python3 -m venv .runtime/jianying
.runtime/jianying/bin/python -m pip install -r scripts/jianying/requirements.txt
FFMPEG_PATH="你的 ffmpeg 可执行文件" BROWSER_EXECUTABLE="你的 Chrome 可执行文件" npm run studio
```

Windows 使用 `python -m venv .runtime/jianying`，然后 `.runtime/jianying/Scripts/python.exe -m pip install -r scripts/jianying/requirements.txt`。环境变量 `JIANYING_PYTHON` 可指定另一个装有同版本库的 Python。浏览器可以使用项目已安装的 Playwright Chromium；macOS 也会查找常见 Chrome / Edge 安装位置。不在点击导出时自动安装依赖或修改系统 Python。

## 打开草稿

1. 下载并解压 ZIP；保留整个文件夹的 `materials`、`fonts`、两个草稿主文件、元数据和说明。
2. **退出剪映**。在解压文件夹运行：

   ```sh
   python3 install.py "剪映本地草稿根目录"
   ```

   macOS 本机检查过的路径为 `~/Movies/JianyingPro/User Data/Projects/com.lveditor.draft`。以自己的剪映设置为准。此目录应有 `root_meta_info.json`。安装器会拒绝运行中的常见剪映进程，新增随机名称的草稿文件夹、更新索引前保存备份，已有草稿不被替换。不会自动恢复旧索引，因为之后可能新增其他草稿。
3. 重启剪映，在首页打开新增草稿。第一次打开后剪映可能迁移到它自己的版本格式；不要再用原始 JSON 覆盖已经人工修改的工程。

若只移动尚未由剪映修改的导出文件夹，可运行包内 `relocate.py` 更新素材和字体路径。安装器已自动执行这一步。导出的 ZIP 包括字体 OFL 许可与工作台项目源数据。

## 已验证范围与差异

在这台 Mac 的剪映 **11.3.13183** 中，已经实际打开三秒、四类轨道的验证工程，修改中文字幕、自动保存并成功导出 MOV。新版本需要 `draft_info.json`，只提供旧版 `draft_content.json` 会提示损坏；现在包中同时提供两者。未验证 Windows、其他剪映版本或 CapCut。

原生文字不是浏览器截图：剪映可能回退系统字体；包内字体不等于自动安装成功。字号初步按本机显示校准，文字锚点、换行、粗细和人工改字号后的布局仍需检查。文本框裁剪、透明度关键帧没有完整对应。宽高变化的画面按首帧取景后缩放，动态长宽比可能与浏览器实时裁剪不同。独立画面不生成浏览器阴影；圆形/圆角使用原生蒙版，当前版本的视觉效果仍需人工检查。

渲染组件沿用同一 `TimelinePlayer`，按整数帧采样并等待素材解码；组件原声由独立音频轨导出。文字、录屏和声音的原生映射经过结构与时间校验，不宣称与工作台逐像素相同。`export-report.json` 记录每段的原生 / 渲染模式，以及每个新包尚待人工检查的状态。

## 接口与检查

- `GET /api/studio/jianying-status` 检查固定版本 Python 库与 FFmpeg。
- `POST /api/studio/jianying-export` 接收同一项目，返回 202 和任务编号。
- `GET /api/studio/jianying-jobs/<id>` 查询 queued / running / complete / failed、进度、下载链接和分层说明。

任务状态保存在当前服务器内存，重启后需重新生成；已生成文件留在被 Git 忽略的 `work/jianying-exports/`。最多三个等待/运行任务，逐个执行，防止同时占满渲染器。

```sh
npm run test:studio
BROWSER_EXECUTABLE="你的 Chrome 路径" FFMPEG_PATH="你的 ffmpeg 路径" npm run check:jianying
```

浏览器验收实际点击工作台导出按钮，生成三段视频，校验原生文字、声音、关键帧、源时间和下载包。它不替代实际剪映 UI 的打开、修改和成片导出测试。后续优先补文字排版/字体、蒙版视觉回归和组件内部角色的分层转换。
