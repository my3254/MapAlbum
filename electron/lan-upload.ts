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

function getInterfacePriority(name: string, address: string) {
  const lowerName = name.toLowerCase();

  if (isPrivateIpv4(address) && /(wi-?fi|wlan|wireless)/.test(lowerName)) {
    return 0;
  }

  if (isPrivateIpv4(address) && /(ethernet|以太网)/.test(lowerName)) {
    return 1;
  }

  if (isPrivateIpv4(address)) {
    return 2;
  }

  if (/(vpn|tun|tap|virtual|vmware|vbox|hyper-v|loopback|bluetooth)/.test(lowerName)) {
    return 9;
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
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MapAlbum 上传</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(160deg, #f7fbff, #eef7f1);
        color: #10202a;
      }
      main {
        max-width: 36rem;
        margin: 0 auto;
        padding: 2rem 1rem 3rem;
      }
      .card {
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(16, 32, 42, 0.1);
        border-radius: 1.25rem;
        box-shadow: 0 20px 50px rgba(38, 71, 92, 0.12);
        padding: 1.25rem;
        backdrop-filter: blur(10px);
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 1.8rem;
      }
      p {
        line-height: 1.6;
      }
      .url {
        display: inline-block;
        padding: 0.5rem 0.75rem;
        border-radius: 999px;
        background: #e9f4ff;
        color: #0c5ea8;
        font-weight: 600;
        word-break: break-all;
      }
      form {
        display: grid;
        gap: 0.9rem;
        margin-top: 1rem;
      }
      input[type="file"] {
        width: 100%;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #1261c9, #14a37f);
        color: white;
        font-size: 1rem;
        font-weight: 700;
        padding: 0.85rem 1rem;
      }
      .hint {
        font-size: 0.92rem;
        color: #51626d;
      }
      .result {
        display: none;
        margin-top: 1rem;
        padding: 0.85rem 1rem;
        border-radius: 0.9rem;
        background: #eafaf4;
        color: #186144;
      }
      .result.error {
        background: #fff0ee;
        color: #b03728;
      }
      .progress {
        display: none;
        margin-top: 1rem;
      }
      .progress-bar {
        height: 10px;
        border-radius: 999px;
        background: rgba(16, 32, 42, 0.08);
        overflow: hidden;
      }
      .progress-bar > span {
        display: block;
        width: 0%;
        height: 100%;
        background: linear-gradient(135deg, #1261c9, #14a37f);
        transition: width 120ms linear;
      }
      .progress-text {
        margin-top: 0.45rem;
        font-size: 0.92rem;
        color: #51626d;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>上传照片到 MapAlbum</h1>
        <p>保持手机和电脑在同一个局域网，然后选择原始照片上传。MapAlbum 会优先读取照片里的 GPS 信息。</p>
        <p class="url">${escapedUrl}</p>
        <form id="upload-form">
          <input id="file-input" type="file" name="photos" accept="image/*" multiple required />
          <button type="submit">开始上传</button>
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
      const progress = document.getElementById('progress');
      const progressFill = document.getElementById('progress-fill');
      const progressText = document.getElementById('progress-text');
      const result = document.getElementById('result');

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
              progressText.textContent = '上传中 ' + percent + '%';
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
        } catch (error) {
          result.className = 'result error';
          result.textContent = error instanceof Error ? error.message : '上传失败';
          progressText.textContent = '上传失败';
        }
      });
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
        if (request.method === 'GET' && request.url === '/') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(buildUploadPage(this.state.url ?? ''));
          return;
        }

        if (request.method === 'POST' && request.url === '/upload') {
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
