import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { ImportedImageFile, LanServerState, LanUploadBatch } from '../src/shared/contracts';
import { extractImageGps } from './exif';

const IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
]);

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || `upload-${Date.now()}`;
}

function isPrivateIpv4(address: string) {
  return (
    address.startsWith('10.')
    || address.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

function isVirtualInterfaceName(name: string) {
  return /(vpn|tun|tap|virtual|vmware|vbox|hyper-v|loopback|bluetooth|wsl|docker|vEthernet)/i.test(name);
}

function getInterfacePriority(name: string, address: string) {
  const lowerName = name.toLowerCase();

  if (isVirtualInterfaceName(name)) {
    return 9;
  }

  if (isPrivateIpv4(address) && /(wi-?fi|wifi|wlan|wireless|无线)/.test(lowerName)) {
    return 0;
  }

  if (isPrivateIpv4(address) && /(ethernet|lan|local area|以太网)/.test(lowerName)) {
    return 1;
  }

  if (isPrivateIpv4(address) && /(wi-?fi|wifi|wlan|wireless|无线)/.test(lowerName)) {
    return 0;
  }

  if (isPrivateIpv4(address) && /(ethernet|以太网)/.test(lowerName)) {
    return 1;
  }

  if (isPrivateIpv4(address)) {
    return 2;
  }

  return 5;
}

function getPreferredIpv4Address() {
  const interfaces = os.networkInterfaces();
  const candidates = Object.entries(interfaces)
    .flatMap(([name, items]) =>
      (items ?? [])
        .filter((item): item is os.NetworkInterfaceInfo => Boolean(item))
        .filter((item) => item.family === 'IPv4' && !item.internal)
        .map((item) => ({
          name,
          address: item.address,
          priority: getInterfacePriority(name, item.address),
        })),
    )
    .sort((left, right) => left.priority - right.priority);

  return candidates[0]?.address ?? null;
}

function buildUploadPage(uploadUrl: string) {
  const escapedUrl = escapeHtml(uploadUrl);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <title>旅行者相册 极速上传</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        color-scheme: dark;
        --bg-base: #050505;
        --accent-main: #10b981;
        --accent-glow: rgba(16, 185, 129, 0.4);
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg-base);
        color: #fff;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-x: hidden;
        -webkit-font-smoothing: antialiased;
      }
      body::before {
        content: "";
        position: fixed;
        inset: -50%;
        z-index: -1;
        background: 
          radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.15), transparent 40%),
          radial-gradient(circle at 80% 70%, rgba(16, 185, 129, 0.15), transparent 40%),
          radial-gradient(circle at 50% 50%, rgba(236, 72, 153, 0.15), transparent 60%);
        animation: spin 30s linear infinite;
        pointer-events: none;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      main {
        width: 100%;
        max-width: 32rem;
        margin: 0 auto;
        padding: 2.5rem 1.5rem;
        box-sizing: border-box;
      }
      .card {
        background: rgba(15, 15, 17, 0.65);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 1.5rem;
        box-shadow: 0 24px 40px -8px rgba(0, 0, 0, 0.5);
        padding: 2rem 1.5rem;
        text-align: center;
      }
      h1 {
        margin: 0 0 0.8rem;
        font-size: 1.6rem;
        font-weight: 700;
        background: linear-gradient(to right, #fff, rgba(255,255,255,0.7));
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      p {
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.65);
        font-size: 0.95rem;
        margin-bottom: 1.2rem;
      }
      .url {
        display: inline-block;
        padding: 0.5rem 1rem;
        border-radius: 999px;
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid var(--accent-glow);
        color: var(--accent-main);
        font-family: monospace;
        font-weight: 600;
        word-break: break-all;
        margin-bottom: 1.5rem;
      }
      form {
        display: grid;
        gap: 1.2rem;
      }
      .file-upload-wrapper {
        position: relative;
        overflow: hidden;
        display: block;
        width: 100%;
      }
      .file-upload-wrapper input[type="file"] {
        position: absolute;
        left: 0;
        top: 0;
        opacity: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
        z-index: 2;
      }
      .file-upload-btn {
        display: block;
        width: 100%;
        padding: 1.2rem;
        border-radius: 1rem;
        background: rgba(255, 255, 255, 0.03);
        border: 2px dashed rgba(255, 255, 255, 0.15);
        color: #fff;
        font-weight: 600;
        transition: all 0.2s;
        box-sizing: border-box;
      }
      .file-upload-wrapper input[type="file"]:focus + .file-upload-btn,
      .file-upload-wrapper:hover .file-upload-btn {
        background: rgba(255, 255, 255, 0.08);
        border-color: var(--accent-main);
      }
      button[type="submit"] {
        appearance: none;
        border: 0;
        border-radius: 1rem;
        background: linear-gradient(135deg, #34d399, #10b981);
        color: #000;
        font-size: 1.1rem;
        font-weight: 700;
        padding: 1rem;
        cursor: pointer;
        box-shadow: 0 4px 15px var(--accent-glow);
        transition: transform 0.2s, filter 0.2s;
      }
      button[type="submit"]:active {
        transform: scale(0.96);
      }
      .hint {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.45);
        margin: 0;
      }
      .result {
        display: none;
        margin-top: 1.5rem;
        padding: 1rem;
        border-radius: 1rem;
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid var(--accent-main);
        color: #fff;
        font-weight: 500;
      }
      .result.error {
        background: rgba(239, 68, 68, 0.1);
        border-color: #ef4444;
      }
      .progress {
        display: none;
        margin-top: 1.5rem;
      }
      .progress-bar {
        height: 6px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }
      .progress-bar > span {
        display: block;
        width: 0%;
        height: 100%;
        background: linear-gradient(135deg, #34d399, #10b981);
        transition: width 120ms linear;
        box-shadow: 0 0 10px var(--accent-main);
      }
      .progress-text {
        margin-top: 0.8rem;
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.65);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>上传照片到旅行者相册</h1>
        <p>保持手机和电脑在同一个局域网，然后选择原始照片上传。旅行者相册会优先读取照片里的 GPS 信息。</p>
        <p class="url">${escapedUrl}</p>
        <form id="upload-form">
          <div class="file-upload-wrapper">
            <input id="file-input" type="file" name="photos" accept="image/*" multiple required />
            <div class="file-upload-btn" id="file-label">点击选择多张照片...</div>
          </div>
          <button type="submit">开始极速上传</button>
          <p class="hint">建议直接选择原图。经过截图、转发或压缩的图片，GPS 信息可能已经丢失。</p>
        </form>
        <div id="progress" class="progress">
          <div class="progress-bar"><span id="progress-fill"></span></div>
          <div id="progress-text" class="progress-text">准备上传...</div>
        </div>
        <div id="result" class="result"></div>
      </div>
    </main>
    <script>
      const form = document.getElementById('upload-form');
      const input = document.getElementById('file-input');
      const label = document.getElementById('file-label');
      const progress = document.getElementById('progress');
      const progressFill = document.getElementById('progress-fill');
      const progressText = document.getElementById('progress-text');
      const result = document.getElementById('result');

      input.addEventListener('change', () => {
        if (input.files.length > 0) {
          label.textContent = '已选择 ' + input.files.length + ' 张照片';
          label.style.borderColor = 'var(--accent-main)';
          label.style.color = 'var(--accent-main)';
        } else {
          label.textContent = '点击选择多张照片...';
          label.style.borderColor = '';
          label.style.color = '';
        }
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!input.files || input.files.length === 0) {
          return;
        }

        const data = new FormData();
        for (const file of input.files) {
          data.append('photos', file, file.name);
        }

        result.className = 'result';
        result.style.display = 'block';
        result.textContent = '正在上传，请稍候...';
        progress.style.display = 'block';
        progressFill.style.width = '0%';
        progressText.textContent = '准备上传...';

        try {
          const payload = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload');

            xhr.upload.onprogress = (progressEvent) => {
              if (!progressEvent.lengthComputable) {
                progressText.textContent = '上传中...';
                return;
              }

              const percent = Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100));
              progressFill.style.width = percent + '%';
              progressText.textContent = '已上传 ' + percent + '%';
            };

            xhr.onload = () => {
              try {
                const body = JSON.parse(xhr.responseText || '{}');
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(body);
                  return;
                }
                reject(new Error(body.error || '上传失败'));
              } catch (error) {
                reject(error);
              }
            };

            xhr.onerror = () => reject(new Error('网络连接失败'));
            xhr.send(data);
          });

          progressFill.style.width = '100%';
          progressText.textContent = '上传完成';
          result.textContent = payload.message || '上传成功';
          input.value = '';
          label.textContent = '点击继续选择照片...';
          label.style.borderColor = '';
          label.style.color = '';
        } catch (error) {
          result.className = 'result error';
          result.textContent = error instanceof Error ? error.message : '上传失败';
          progressText.textContent = '上传失败，请检查网络';
        }
      });
    </script>
  </body>
</html>`;
}

function buildMobileUploadPage(uploadUrl: string) {
  const escapedUrl = escapeHtml(uploadUrl);

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <title>旅行者相册 手机同步</title>
    <style>
      :root {
        color-scheme: dark;
        --background: #111317;
        --surface-high: #282a2e;
        --surface-highest: #333539;
        --text-primary: #e2e2e8;
        --text-secondary: #b9cbc1;
        --text-muted: rgba(226, 226, 232, 0.58);
        --primary: #fbfffa;
        --accent: #00ffc2;
        --accent-ink: #003828;
        --accent-glow: rgba(0, 255, 194, 0.34);
        --outline: rgba(255, 255, 255, 0.1);
        --danger: #ffb4ab;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        min-height: 100dvh;
        padding: 88px 16px 32px;
        background:
          radial-gradient(circle at 88% 12%, rgba(0, 255, 194, 0.08), transparent 26rem),
          linear-gradient(180deg, rgba(12, 14, 18, 0.86), var(--background) 22rem),
          var(--background);
        color: var(--text-primary);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-x: hidden;
        -webkit-font-smoothing: antialiased;
      }

      button,
      input {
        font: inherit;
      }

      button {
        border: 0;
        color: inherit;
      }

      p {
        margin: 0;
      }

      .top-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 20;
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) 44px;
        align-items: center;
        height: 64px;
        width: 100%;
        max-width: 430px;
        margin: 0 auto;
        padding: 0 14px;
        border-bottom: 1px solid var(--outline);
        background: rgba(2, 6, 23, 0.82);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08), 0 18px 38px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
      }

      .top-bar h1 {
        overflow: hidden;
        margin: 0;
        color: #fff;
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        font-size: 1.16rem;
        font-weight: 800;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .icon-button {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        background: transparent;
        color: rgba(226, 226, 232, 0.68);
      }

      .icon {
        display: inline-block;
        width: 1.25rem;
        height: 1.25rem;
        flex: 0 0 auto;
      }

      .back-icon {
        color: currentColor;
        font-size: 1.9rem;
        line-height: 1;
      }

      .upload-icon {
        width: 2.8rem;
        height: 2.8rem;
        margin-bottom: 12px;
        color: var(--accent);
        filter: drop-shadow(0 0 8px var(--accent-glow));
      }

      .sync-icon {
        width: 1.05rem;
        height: 1.05rem;
      }

      main {
        width: 100%;
        max-width: 430px;
        margin: 0 auto;
      }

      .sync-card {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--outline);
        border-radius: 12px;
        background: rgba(40, 42, 46, 0.42);
        box-shadow: 0 24px 54px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
      }

      .sync-card::before {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(0, 255, 194, 0.08), transparent 48%);
        pointer-events: none;
      }

      .upload-panel {
        position: relative;
        z-index: 1;
        padding: 24px;
      }

      .file-input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }

      .upload-drop {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 164px;
        padding: 28px 18px;
        border: 2px dashed rgba(0, 255, 194, 0.32);
        border-radius: 8px;
        background: rgba(51, 53, 57, 0.22);
        color: var(--primary);
        text-align: center;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
      }

      .upload-drop:active {
        transform: scale(0.99);
      }

      .upload-drop span:first-child {
        margin-bottom: 12px;
        color: var(--accent);
        font-size: 2.75rem;
        filter: drop-shadow(0 0 8px var(--accent-glow));
      }

      .upload-drop strong {
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        font-size: 1.42rem;
        font-weight: 800;
      }

      .upload-drop small {
        margin-top: 8px;
        color: var(--text-muted);
        font-size: 0.78rem;
        line-height: 1.45;
      }

      .upload-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        margin-top: 14px;
      }

      .primary-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 46px;
        border-radius: 999px;
        background: var(--accent);
        color: var(--accent-ink);
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 0 18px rgba(0, 255, 194, 0.24);
      }

      .primary-button:disabled {
        opacity: 0.42;
        cursor: not-allowed;
      }

      .progress-card {
        margin-top: 22px;
      }

      .progress-head {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }

      .progress-head span {
        color: var(--text-secondary);
        font-size: 0.78rem;
        font-weight: 700;
      }

      .progress-head strong {
        color: var(--accent);
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        font-size: 1.46rem;
        font-weight: 900;
        line-height: 1;
        text-shadow: 0 0 8px rgba(0, 255, 194, 0.24);
      }

      .progress-bar {
        overflow: hidden;
        height: 8px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 999px;
        background: var(--surface-highest);
      }

      .progress-fill {
        position: relative;
        width: 0%;
        height: 100%;
        border-radius: inherit;
        background: var(--accent);
        box-shadow: 0 0 10px var(--accent);
        transition: width 120ms linear;
      }

      .progress-fill::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.34), transparent);
        animation: shimmer 2s infinite;
      }

      .status-message {
        min-height: 20px;
        margin-top: 12px;
        color: var(--text-muted);
        font-size: 0.82rem;
        line-height: 1.45;
      }

      .status-message.error {
        color: var(--danger);
      }

      .section-title {
        margin: 26px 0 14px;
        color: var(--primary);
        font-family: 'Space Grotesk', 'Inter', sans-serif;
        font-size: 1.42rem;
        font-weight: 800;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.38);
      }

      .file-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .file-row {
        position: relative;
        overflow: hidden;
        display: grid;
        grid-template-columns: 52px minmax(0, 1fr);
        align-items: center;
        gap: 14px;
        min-height: 76px;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        background: rgba(40, 42, 46, 0.28);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      .file-row.is-pending {
        opacity: 0.72;
      }

      .file-row.is-complete {
        border-color: rgba(0, 255, 194, 0.22);
        background: rgba(40, 42, 46, 0.42);
      }

      .file-row.is-error {
        border-color: rgba(255, 180, 171, 0.34);
      }

      .file-row-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        width: 0%;
        background: var(--accent);
        box-shadow: 0 0 8px var(--accent);
      }

      .thumb {
        position: relative;
        overflow: hidden;
        width: 52px;
        height: 52px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: var(--surface-highest);
      }

      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .thumb-placeholder {
        display: grid;
        place-items: center;
        width: 100%;
        height: 100%;
        color: var(--text-secondary);
      }

      .thumb-placeholder::before {
        content: "";
        width: 23px;
        height: 18px;
        border: 1.7px solid currentColor;
        border-radius: 4px;
        opacity: 0.82;
        background:
          radial-gradient(circle at 72% 32%, currentColor 0 2px, transparent 2.5px),
          linear-gradient(135deg, transparent 42%, currentColor 43% 48%, transparent 49%);
      }

      .file-content {
        min-width: 0;
      }

      .file-name {
        overflow: hidden;
        color: var(--primary);
        font-size: 0.9rem;
        line-height: 1.5;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 4px;
        color: var(--text-secondary);
        font-size: 0.74rem;
        font-weight: 600;
      }

      .file-status {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--text-secondary);
        white-space: nowrap;
      }

      .file-status::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        box-shadow: 0 0 8px currentColor;
      }

      .file-status.is-active,
      .file-status.is-complete {
        color: var(--accent);
      }

      .file-status.is-error {
        color: var(--danger);
      }

      .empty-list {
        padding: 22px 16px;
        border: 1px dashed rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: var(--text-muted);
        line-height: 1.55;
        text-align: center;
      }

      @keyframes shimmer {
        0% { transform: translateX(-100%); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateX(100%); opacity: 0; }
      }

      @media (max-width: 360px) {
        body {
          padding-right: 10px;
          padding-left: 10px;
        }

        .upload-panel {
          padding: 18px;
        }
      }
    </style>
  </head>
  <body>
    <header class="top-bar">
      <button class="icon-button" type="button" aria-label="返回" onclick="history.back()">
        <span class="back-icon" aria-hidden="true">&lsaquo;</span>
      </button>
      <h1>已连接至电脑</h1>
      <span aria-hidden="true"></span>
    </header>

    <main>
      <section class="sync-card">
        <form id="upload-form" class="upload-panel">
          <input id="file-input" class="file-input" type="file" name="photos" accept="image/*" multiple required />
          <label class="upload-drop" for="file-input" id="file-label">
            <svg class="upload-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 16V7m0 0 3.5 3.5M12 7l-3.5 3.5M5 17.5A4.5 4.5 0 0 1 6.7 8.8 6 6 0 0 1 18 10.8a3.7 3.7 0 0 1 1 7.2H6.5" />
            </svg>
            <strong>点击上传</strong>
            <small>选择手机原图，旅行者相册会同步到电脑。<br />${escapedUrl}</small>
          </label>

          <div class="upload-actions">
            <button id="submit-button" class="primary-button" type="submit" disabled>
              <svg class="sync-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6v5h-5M4 18v-5h5m9.2-4.8A7.5 7.5 0 0 0 6.5 7.3L4 10m16 4-2.5 2.7A7.5 7.5 0 0 1 5.8 15.8" />
              </svg>
              <span>开始同步</span>
            </button>
          </div>

          <div class="progress-card">
            <div class="progress-head">
              <span>总体进度</span>
              <strong id="progress-percent">0%</strong>
            </div>
            <div class="progress-bar">
              <div id="progress-fill" class="progress-fill"></div>
            </div>
            <p id="status-message" class="status-message">等待选择图片。建议直接选择原图，压缩图片可能丢失 GPS 信息。</p>
          </div>
        </form>
      </section>

      <h2 class="section-title">正在上传文件</h2>
      <section id="file-list" class="file-list">
        <div class="empty-list">还没有选择文件。点击上方上传区域选择照片后，这里会显示每张图片的状态。</div>
      </section>
    </main>

    <script>
      const form = document.getElementById('upload-form');
      const input = document.getElementById('file-input');
      const submitButton = document.getElementById('submit-button');
      const progressFill = document.getElementById('progress-fill');
      const progressPercent = document.getElementById('progress-percent');
      const statusMessage = document.getElementById('status-message');
      const fileList = document.getElementById('file-list');

      let selectedFiles = [];
      let objectUrls = [];

      function formatSize(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) {
          return '未知大小';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let index = 0;
        while (value >= 1024 && index < units.length - 1) {
          value = value / 1024;
          index += 1;
        }
        return value.toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
      }

      function setOverallProgress(percent) {
        const normalized = Math.max(0, Math.min(100, Math.round(percent)));
        progressFill.style.width = normalized + '%';
        progressPercent.textContent = normalized + '%';
      }

      function clearObjectUrls() {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        objectUrls = [];
      }

      function getFileStatus(file, loadedBytes, totalBytes, isComplete, isError) {
        if (isError) {
          return { className: 'is-error', label: '上传失败', percent: 0 };
        }

        if (isComplete) {
          return { className: 'is-complete', label: '已完成', percent: 100 };
        }

        if (!totalBytes || loadedBytes <= 0) {
          return { className: 'is-pending', label: '等待中', percent: 0 };
        }

        let previousBytes = 0;
        for (const item of selectedFiles) {
          if (item === file) {
            break;
          }
          previousBytes += item.size;
        }

        const fileLoaded = Math.max(0, Math.min(file.size, loadedBytes - previousBytes));
        if (fileLoaded <= 0) {
          return { className: 'is-pending', label: '等待中', percent: 0 };
        }

        const percent = Math.max(1, Math.min(99, Math.round((fileLoaded / file.size) * 100)));
        return { className: 'is-active', label: '上传中 (' + percent + '%)', percent };
      }

      function renderFileList(loadedBytes = 0, totalBytes = 0, isComplete = false, isError = false) {
        if (selectedFiles.length === 0) {
          fileList.innerHTML = '<div class="empty-list">还没有选择文件。点击上方上传区域选择照片后，这里会显示每张图片的状态。</div>';
          return;
        }

        fileList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
          const status = getFileStatus(file, loadedBytes, totalBytes, isComplete, isError);
          const row = document.createElement('div');
          row.className = 'file-row ' + status.className;

          const progress = document.createElement('div');
          progress.className = 'file-row-progress';
          progress.style.width = status.percent + '%';
          row.appendChild(progress);

          const thumb = document.createElement('div');
          thumb.className = 'thumb';
          if (objectUrls[index]) {
            const img = document.createElement('img');
            img.src = objectUrls[index];
            img.alt = file.name;
            thumb.appendChild(img);
          } else {
            thumb.innerHTML = '<div class="thumb-placeholder" aria-hidden="true"></div>';
          }
          row.appendChild(thumb);

          const content = document.createElement('div');
          content.className = 'file-content';

          const name = document.createElement('div');
          name.className = 'file-name';
          name.textContent = file.name;
          content.appendChild(name);

          const meta = document.createElement('div');
          meta.className = 'file-meta';

          const size = document.createElement('span');
          size.textContent = formatSize(file.size);
          meta.appendChild(size);

          const state = document.createElement('span');
          state.className = 'file-status ' + status.className;
          state.textContent = status.label;
          meta.appendChild(state);

          content.appendChild(meta);
          row.appendChild(content);
          fileList.appendChild(row);
        });
      }

      input.addEventListener('change', () => {
        clearObjectUrls();
        selectedFiles = Array.from(input.files || []);
        objectUrls = selectedFiles.map((file) => file.type.startsWith('image/') ? URL.createObjectURL(file) : '');

        if (selectedFiles.length > 0) {
          submitButton.disabled = false;
          setOverallProgress(0);
          statusMessage.className = 'status-message';
          statusMessage.textContent = '已选择 ' + selectedFiles.length + ' 张图片，点击开始同步。';
          renderFileList();
        } else {
          submitButton.disabled = true;
          setOverallProgress(0);
          statusMessage.className = 'status-message';
          statusMessage.textContent = '等待选择图片。建议直接选择原图，压缩图片可能丢失 GPS 信息。';
          renderFileList();
        }
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!input.files || input.files.length === 0) {
          return;
        }

        const data = new FormData();
        for (const file of input.files) {
          data.append('photos', file, file.name);
        }

        submitButton.disabled = true;
        setOverallProgress(0);
        statusMessage.className = 'status-message';
        statusMessage.textContent = '正在建立连接并准备上传...';
        renderFileList();

        try {
          const payload = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/upload');

            xhr.upload.onprogress = (progressEvent) => {
              if (!progressEvent.lengthComputable) {
                statusMessage.textContent = '上传中...';
                return;
              }

              const percent = Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100));
              setOverallProgress(percent);
              statusMessage.textContent = '正在上传 ' + selectedFiles.length + ' 张图片...';
              renderFileList(progressEvent.loaded, progressEvent.total, false, false);
            };

            xhr.onload = () => {
              try {
                const body = JSON.parse(xhr.responseText || '{}');
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(body);
                  return;
                }
                reject(new Error(body.error || '上传失败'));
              } catch (error) {
                reject(error);
              }
            };

            xhr.onerror = () => reject(new Error('网络连接失败'));
            xhr.send(data);
          });

          setOverallProgress(100);
          statusMessage.className = 'status-message';
          statusMessage.textContent = payload.message || '上传成功';
          renderFileList(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, true, false);
          input.value = '';
          submitButton.disabled = false;
        } catch (error) {
          statusMessage.className = 'status-message error';
          statusMessage.textContent = error instanceof Error ? error.message : '上传失败，请检查网络';
          renderFileList(0, 0, false, true);
          submitButton.disabled = false;
        }
      });

      window.addEventListener('pagehide', clearObjectUrls);
    </script>
  </body>
</html>`;
}

function parseMultipartParts(body: Buffer, boundary: string) {
  const parts: Array<{ headers: string; content: Buffer }> = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let cursor = 0;

  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(boundaryBuffer, cursor);
    if (boundaryIndex === -1) {
      break;
    }

    const partStart = boundaryIndex + boundaryBuffer.length;
    if (body.subarray(partStart, partStart + 2).equals(Buffer.from('--'))) {
      break;
    }

    const normalizedStart = body.subarray(partStart, partStart + 2).equals(Buffer.from('\r\n'))
      ? partStart + 2
      : partStart;
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), normalizedStart);
    if (headerEnd === -1) {
      break;
    }

    const nextBoundaryIndex = body.indexOf(boundaryBuffer, headerEnd + 4);
    if (nextBoundaryIndex === -1) {
      break;
    }

    const headers = body.subarray(normalizedStart, headerEnd).toString('utf8');
    const content = body.subarray(headerEnd + 4, nextBoundaryIndex - 2);
    parts.push({ headers, content });
    cursor = nextBoundaryIndex;
  }

  return parts;
}

function parseContentDisposition(headers: string) {
  const dispositionLine = headers
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith('content-disposition:'));
  if (!dispositionLine) {
    return null;
  }

  const nameMatch = dispositionLine.match(/name="([^"]+)"/i);
  const fileNameMatch = dispositionLine.match(/filename="([^"]*)"/i);
  return {
    fieldName: nameMatch?.[1] ?? null,
    fileName: fileNameMatch?.[1] ?? null,
  };
}

export class LanUploadService {
  private server: http.Server | null = null;

  private state: LanServerState = {
    isRunning: false,
    url: null,
    host: null,
    port: null,
  };

  private pendingBatches: LanUploadBatch[] = [];

  constructor(private readonly tempRoot: string) {}

  getState() {
    return this.state;
  }

  consumePendingBatches() {
    const batches = [...this.pendingBatches];
    this.pendingBatches = [];
    return batches;
  }

  async start() {
    if (this.server && this.state.isRunning) {
      return this.state;
    }

    const host = getPreferredIpv4Address();
    if (!host) {
      throw new Error('No available IPv4 address found on this device.');
    }

    await fs.mkdir(this.tempRoot, { recursive: true });

    const server = http.createServer(async (request, response) => {
      try {
        const requestPath = new URL(request.url ?? '/', 'http://localhost').pathname;

        if (request.method === 'GET' && (requestPath === '/' || requestPath === '/index.html')) {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(buildMobileUploadPage(this.state.url ?? ''));
          return;
        }

        if (request.method === 'POST' && requestPath === '/upload') {
          const payload = await this.handleUploadRequest(request);
          response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify(payload));
          return;
        }

        response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: 'Not found' }));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Unexpected upload failure',
        }));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Failed to bind LAN upload server.');
    }

    this.server = server;
    this.state = {
      isRunning: true,
      host,
      port: address.port,
      url: `http://${host}:${address.port}/`,
    };

    return this.state;
  }

  async stop() {
    if (!this.server) {
      this.state = {
        isRunning: false,
        url: null,
        host: null,
        port: null,
      };
      return this.state;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.server = null;
    this.pendingBatches = [];
    this.state = {
      isRunning: false,
      url: null,
      host: null,
      port: null,
    };
    return this.state;
  }

  private async handleUploadRequest(request: http.IncomingMessage) {
    const contentType = request.headers['content-type'];
    const boundaryMatch = contentType?.match(/boundary=([^;]+)/i);
    if (!boundaryMatch) {
      throw new Error('Missing multipart boundary.');
    }

    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks);
    const parts = parseMultipartParts(body, boundaryMatch[1]);
    const batchDirectory = path.join(this.tempRoot, randomUUID());
    await fs.mkdir(batchDirectory, { recursive: true });

    const files: ImportedImageFile[] = [];
    for (const part of parts) {
      const disposition = parseContentDisposition(part.headers);
      if (!disposition?.fileName) {
        continue;
      }

      const contentTypeLine = part.headers
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-type:'));
      const partContentType = contentTypeLine?.split(':')[1]?.trim().toLowerCase() ?? '';
      if (partContentType && !IMAGE_CONTENT_TYPES.has(partContentType)) {
        continue;
      }

      const safeName = sanitizeFileName(path.basename(disposition.fileName));
      const filePath = path.join(batchDirectory, `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`);
      await fs.writeFile(filePath, part.content);

      files.push({
        path: filePath,
        originalName: safeName,
        gps: await extractImageGps(filePath),
      });
    }

    if (files.length === 0) {
      throw new Error('No image files were uploaded.');
    }

    const batch: LanUploadBatch = {
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      files,
    };
    this.pendingBatches.push(batch);

    const gpsCount = files.filter((file) => file.gps).length;
    return {
      ok: true,
      batchId: batch.id,
      message: gpsCount > 0
        ? `已上传 ${files.length} 张照片，其中 ${gpsCount} 张带有 GPS 信息。`
        : `已上传 ${files.length} 张照片，但未检测到 GPS 信息。`,
    };
  }
}
