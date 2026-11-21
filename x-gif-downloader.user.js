// ==UserScript==
// @name         X (Twitter) GIF 下载与转码器 (MP4 / 真GIF双导出)
// @version      2.0.0
// @description  在 X (Twitter) GIF 卡片右上角增加 MP4 原画下载与纯本地实时转码真 .gif 导出按钮
// @author       Assistant
// @match        https://x.com/*
// @match        https://twitter.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js
// @grant        GM_xmlhttpRequest
// @connect      video.twimg.com
// @connect      cdnjs.cloudflare.com
// ==/UserScript==

(function () {
    "use strict";

    // 转码参数配置
    const GIF_CONFIG = {
        fps: 15,          // 采样帧率（15fps 兼顾流畅度与文件体积）
        maxWidth: 480,    // 最大宽度限制（超过自动等比缩小，防止微信发不出）
        quality: 10,      // 色彩量化质量（1-30，数值越小画质越好但越慢，10为最佳平衡）
    };

    let cachedWorkerUrl = null;

    /**
     * 预加载 gif.worker.js 并转为本地 Blob URL，绕过 X 页面的 CSP 跨域 Worker 限制
     */
    function getLocalWorkerUrl() {
        return new Promise((resolve, reject) => {
            if (cachedWorkerUrl) {
                resolve(cachedWorkerUrl);
                return;
            }
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js",
                onload: function (res) {
                    if (res.status === 200 && res.responseText) {
                        const blob = new Blob([res.responseText], { type: "application/javascript" });
                        cachedWorkerUrl = URL.createObjectURL(blob);
                        resolve(cachedWorkerUrl);
                    } else {
                        reject(new Error("Worker 脚本加载失败"));
                    }
                },
                onerror: () => reject(new Error("Worker 网络请求错误")),
            });
        });
    }

    /**
     * 拉取视频二进制 Blob
     */
    function fetchVideoBlob(videoUrl) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: videoUrl,
                responseType: "blob",
                onload: function (res) {
                    if (res.status >= 200 && res.status < 300 && res.response) {
                        resolve(res.response);
                    } else {
                        reject(new Error(`HTTP ${res.status}`));
                    }
                },
                onerror: () => reject(new Error("视频拉取网络错误")),
            });
        });
    }

    /**
     * 触发浏览器保存本地文件
     */
    function triggerDownload(blob, fileName) {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    }

    /**
     * 提取基础文件名
     */
    function getBaseFileName(videoUrl) {
        const match = videoUrl.match(/\/tweet_video\/([^/?#]+)\.mp4/i);
        return match ? `X_GIF_${match[1]}` : `X_GIF_${Date.now()}`;
    }

    /**
     * 方案 A：直接下载原始 MP4
     */
    async function handleDownloadMp4(videoUrl, btn, groupEl) {
        const origText = btn.textContent;
        groupEl.style.pointerEvents = "none";
        btn.textContent = "拉取中...";

        try {
            const mp4Blob = await fetchVideoBlob(videoUrl);
            triggerDownload(mp4Blob, `${getBaseFileName(videoUrl)}.mp4`);
            btn.textContent = "✓ MP4";
            btn.style.color = "#4ade80";
        } catch (err) {
            btn.textContent = "失败";
            btn.style.color = "#f87171";
        } finally {
            setTimeout(() => {
                btn.textContent = origText;
                btn.style.color = "#ffffff";
                groupEl.style.pointerEvents = "auto";
            }, 2000);
        }
    }

    /**
     * 方案 B：拉取 MP4 -> 隐藏 Video 逐帧绘制 Canvas -> gif.js 编码导出真 .gif
     */
    async function handleConvertAndDownloadGif(videoUrl, btn, groupEl) {
        const origText = btn.textContent;
        groupEl.style.pointerEvents = "none";
        btn.textContent = "加载中...";

        let tempVideoUrl = null;
        let hiddenVideo = null;

        try {
            // 1. 并行准备 Worker 与视频 Blob
            const [workerUrl, mp4Blob] = await Promise.all([
                getLocalWorkerUrl(),
                fetchVideoBlob(videoUrl),
            ]);

            tempVideoUrl = URL.createObjectURL(mp4Blob);
            hiddenVideo = document.createElement("video");
            hiddenVideo.muted = true;
            hiddenVideo.playsInline = true;
            hiddenVideo.src = tempVideoUrl;

            // 等待视频元数据加载完成（获取宽高与总时长）
            await new Promise((resolve, reject) => {
                hiddenVideo.onloadedmetadata = resolve;
                hiddenVideo.onerror = () => reject(new Error("视频解码失败"));
            });

            const duration = hiddenVideo.duration || 2;
            const rawWidth = hiddenVideo.videoWidth;
            const rawHeight = hiddenVideo.videoHeight;

            // 等比缩放尺寸
            const scale = rawWidth > GIF_CONFIG.maxWidth ? GIF_CONFIG.maxWidth / rawWidth : 1;
            const targetWidth = Math.round(rawWidth * scale);
            const targetHeight = Math.round(rawHeight * scale);

            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });

            // 初始化 GIF 编码器
            const gif = new GIF({
                workers: 2,
                quality: GIF_CONFIG.quality,
                width: targetWidth,
                height: targetHeight,
                workerScript: workerUrl,
            });

            const frameInterval = 1 / GIF_CONFIG.fps;
            const delayMs = Math.round(1000 / GIF_CONFIG.fps);
            const totalFrames = Math.max(1, Math.floor(duration * GIF_CONFIG.fps));

            // 2. 逐帧 seek 并抽帧写入 GIF 编码器
            for (let i = 0; i < totalFrames; i++) {
                const targetTime = Math.min(duration - 0.01, i * frameInterval);
                hiddenVideo.currentTime = targetTime;

                await new Promise((resolve) => {
                    hiddenVideo.onseeked = resolve;
                });

                ctx.drawImage(hiddenVideo, 0, 0, targetWidth, targetHeight);
                gif.addFrame(ctx, { copy: true, delay: delayMs });

                const samplePercent = Math.floor(((i + 1) / totalFrames) * 50);
                btn.textContent = `抽帧 ${samplePercent}%`;
            }

            // 3. 后台多线程渲染生成最终 .gif 文件
            const finalGifBlob = await new Promise((resolve) => {
                gif.on("progress", (p) => {
                    const renderPercent = 50 + Math.floor(p * 50);
                    btn.textContent = `编码 ${renderPercent}%`;
                });
                gif.on("finished", (blob) => resolve(blob));
                gif.render();
            });

            triggerDownload(finalGifBlob, `${getBaseFileName(videoUrl)}.gif`);
            btn.textContent = "✓ GIF";
            btn.style.color = "#4ade80";
        } catch (err) {
            console.error("[X-GIF-Converter] 转码异常:", err);
            btn.textContent = "转码失败";
            btn.style.color = "#f87171";
        } finally {
            if (tempVideoUrl) URL.revokeObjectURL(tempVideoUrl);
            if (hiddenVideo) hiddenVideo.remove();
            setTimeout(() => {
                btn.textContent = origText;
                btn.style.color = "#ffffff";
                groupEl.style.pointerEvents = "auto";
            }, 2500);
        }
    }

    /**
     * 注入双按钮胶囊组到 X 的 GIF 卡片右上角
     */
    function injectButtons() {
        const videos = document.querySelectorAll('video[src*="tweet_video/"], video source[src*="tweet_video/"]');

        videos.forEach((node) => {
            const videoEl = node.tagName === "VIDEO" ? node : node.closest("video");
            if (!videoEl) return;

            const src = videoEl.currentSrc || videoEl.src || node.src;
            if (!src || !src.includes("tweet_video/")) return;

            const playerWrapper =
                videoEl.closest('[data-testid="videoPlayer"]') ||
                videoEl.closest('[data-testid="videoComponent"]') ||
                videoEl.parentElement;

            if (!playerWrapper || playerWrapper.dataset.xGifDualInjected === "true") return;
            playerWrapper.dataset.xGifDualInjected = "true";

            if (getComputedStyle(playerWrapper).position === "static") {
                playerWrapper.style.position = "relative";
            }

            // 胶囊容器
            const group = document.createElement("div");
            group.style.cssText = `
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 9999;
                display: inline-flex;
                align-items: center;
                background: rgba(15, 20, 25, 0.82);
                backdrop-filter: blur(6px);
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 9999px;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
            `;

            const commonBtnStyle = `
                background: transparent;
                border: none;
                color: #ffffff;
                font-size: 11px;
                font-weight: 700;
                padding: 5px 10px;
                cursor: pointer;
                transition: background 0.15s;
                white-space: nowrap;
            `;

            // 左侧按钮：直接下载 MP4
            const mp4Btn = document.createElement("button");
            mp4Btn.type = "button";
            mp4Btn.textContent = "⬇ MP4";
            mp4Btn.title = "极速保存原始无损 MP4";
            mp4Btn.style.cssText = commonBtnStyle;
            mp4Btn.onmouseenter = () => (mp4Btn.style.background = "rgba(255, 255, 255, 0.15)");
            mp4Btn.onmouseleave = () => (mp4Btn.style.background = "transparent");
            mp4Btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDownloadMp4(videoEl.currentSrc || videoEl.src || src, mp4Btn, group);
            };

            // 分隔线
            const divider = document.createElement("span");
            divider.style.cssText = "width: 1px; height: 14px; background: rgba(255, 255, 255, 0.25);";

            // 右侧按钮：转码并下载真 GIF
            const gifBtn = document.createElement("button");
            gifBtn.type = "button";
            gifBtn.textContent = "✨ 转GIF";
            gifBtn.title = "本地转码为标准 .gif 动图并保存";
            gifBtn.style.cssText = commonBtnStyle;
            gifBtn.onmouseenter = () => (gifBtn.style.background = "rgba(29, 155, 240, 0.85)");
            gifBtn.onmouseleave = () => (gifBtn.style.background = "transparent");
            gifBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleConvertAndDownloadGif(videoEl.currentSrc || videoEl.src || src, gifBtn, group);
            };

            group.appendChild(mp4Btn);
            group.appendChild(divider);
            group.appendChild(gifBtn);
            playerWrapper.appendChild(group);
        });
    }

    const observer = new MutationObserver(injectButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    injectButtons();
})();
