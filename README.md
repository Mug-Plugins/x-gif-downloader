<p align="center">
  <img src="assets/icon.jpg" alt="X GIF Downloader Icon" width="128" />
</p>

<h1 align="center">X (Twitter) GIF 下载与转码器</h1>

<p align="center">
  一款用于 X（Twitter）网页端的油猴（UserScript）脚本，在 GIF 卡片右上角增加 <b>MP4 原画下载</b> 与 <b>纯本地实时转码真 <code>.gif</code> 导出</b> 双功能按钮。
</p>

## 功能特性

- **双模式导出胶囊按钮**：自动识别 X / Twitter 页面中的 GIF（`tweet_video`），在播放器右上角注入「⬇ MP4 | ✨ 转GIF」悬浮胶囊。
- **MP4 原画极速下载**：直接通过 `GM_xmlhttpRequest` 拉取原始无损 MP4 视频并保存。
- **纯本地实时转码真 `.gif`**：
  - 预加载 `gif.worker.js` 并转为本地 Blob URL，绕过 X 页面的 CSP 跨域 Worker 限制；
  - 隐藏 `<video>` 逐帧绘制到 `<canvas>`，使用 `gif.js` 多线程编码导出标准 `.gif` 动图，支持直接发送至微信等平台；
  - 实时显示「抽帧 %」与「编码 %」进度。
- **可调转码参数**：脚本顶部 `GIF_CONFIG` 支持自定义帧率（默认 `15` fps）、最大宽度（默认 `480` px，超宽等比缩放）与色彩量化质量（默认 `10`）。

## 安装方法

1. 在浏览器中安装脚本管理器扩展（推荐 [ScriptCat（脚本猫）](https://docs.scriptcat.org/)，也兼容 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)）。
2. 新建脚本，将本仓库中的 [`x-gif-downloader.user.js`](./x-gif-downloader.user.js) 内容完整复制粘贴并保存（或在 GitHub 上点击该文件的 **Raw** 按钮直接安装）。
3. 打开或刷新 [X (Twitter)](https://x.com/)，任意 GIF 卡片右上角即会出现下载胶囊按钮。

## 权限说明

- `@require https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js`：前端 GIF 编码库
- `@connect video.twimg.com`：拉取 X 官方 GIF 视频流
- `@connect cdnjs.cloudflare.com`：加载 `gif.worker.js` 编码 Worker

## 许可证

[MIT License](./LICENSE)
