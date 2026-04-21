import { randomUUID } from 'crypto';
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { promises as fs } from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AlbumLocationInput, AlbumSummary } from '../src/shared/contracts';
import { createLocationDraft } from '../src/shared/location';
import { LanUploadService } from './lan-upload';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_PATH = path.join(__dirname, '../dist');
const PUBLIC_PATH = path.join(DIST_PATH, '../public');
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const ALBUM_META_FILENAME = '_meta.json';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
const AMAP_WEB_KEY = process.env['VITE_AMAP_WEB_KEY'] || '3a1ae688ad052b3465d3d3bba2e84dd2';

type AlbumMetaFile = Omit<AlbumSummary, 'imageCount' | 'coverPath' | 'previewPaths'> & { coverImageName?: string };

let mainWindow: BrowserWindow | null = null;
let localMediaProtocolRegistered = false;
const lanUploadService = new LanUploadService(path.join(app.getPath('temp'), 'mapalbum-lan-uploads'));

app.disableHardwareAcceleration();
process.env.DIST = DIST_PATH;
process.env.VITE_PUBLIC = app.isPackaged ? DIST_PATH : PUBLIC_PATH;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isImageFile(fileName: string) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

function buildWindow() {
  const preloadPath = VITE_DEV_SERVER_URL
    ? path.join(__dirname, '../electron/preload.cjs')
    : path.join(__dirname, 'preload.cjs');

  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#081117',
    show: false,
    title: 'MapAlbum',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
  });

  window.setMenuBarVisibility(false);
  window.autoHideMenuBar = true;

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}

function checkDevServer(targetUrl: string) {
  return new Promise<boolean>((resolve) => {
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname || '/',
        method: 'GET',
      },
      () => resolve(true),
    );

    request.on('error', () => resolve(false));
    request.setTimeout(1200, () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });
}

async function waitForDevServer(targetUrl: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await checkDevServer(targetUrl)) {
      return;
    }
    await delay(500);
  }

  throw new Error(`Vite dev server did not become ready: ${targetUrl}`);
}

async function ensureLocalMediaProtocol() {
  if (localMediaProtocolRegistered) {
    return;
  }

  protocol.registerFileProtocol('local-media', (request, callback) => {
    try {
      const url = new URL(request.url);
      const rawPath = decodeURI(`${url.hostname}${url.pathname}`);
      const normalizedPath = process.platform === 'win32' && /^\/[A-Za-z]:/.test(rawPath)
        ? rawPath.slice(1)
        : rawPath;

      callback(path.normalize(normalizedPath));
    } catch (error) {
      console.error('Failed to resolve local-media URL:', request.url, error);
      callback({ error: -6 });
    }
  });

  localMediaProtocolRegistered = true;
}

async function listImageFiles(albumDirectory: string) {
  let entries: Awaited<ReturnType<typeof fs.readdir>>;

  try {
    entries = await fs.readdir(albumDirectory, { withFileTypes: true });
  } catch {
    return [];
  }

  const imagePaths = entries
    .filter((entry) => entry.isFile() && isImageFile(entry.name))
    .map((entry) => path.join(albumDirectory, entry.name));

  const withStats = await Promise.all(
    imagePaths.map(async (imagePath) => ({
      imagePath,
      stat: await fs.stat(imagePath),
    })),
  );

  return withStats
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs)
    .map((entry) => entry.imagePath);
}

async function readAlbumMeta(albumDirectory: string) {
  try {
    const content = await fs.readFile(path.join(albumDirectory, ALBUM_META_FILENAME), 'utf-8');
    return JSON.parse(content) as AlbumMetaFile;
  } catch {
    return null;
  }
}

async function writeAlbumMeta(albumDirectory: string, meta: AlbumMetaFile) {
  await fs.writeFile(
    path.join(albumDirectory, ALBUM_META_FILENAME),
    JSON.stringify(meta, null, 2),
    'utf-8',
  );
}

async function buildAlbumSummary(rootFolder: string, albumDirectory: string, meta: AlbumMetaFile): Promise<AlbumSummary> {
  const images = await listImageFiles(albumDirectory);

  let finalCoverPath = images[0] ?? null;
  if (meta.coverImageName) {
    const specified = path.join(albumDirectory, meta.coverImageName);
    if (images.includes(specified)) {
      finalCoverPath = specified;
    }
  }

  return {
    ...meta,
    relativePath: meta.relativePath || path.relative(rootFolder, albumDirectory),
    displayName: meta.displayName || createLocationDraft(meta).displayName,
    imageCount: images.length,
    coverPath: finalCoverPath,
    previewPaths: images.slice(0, 4),
  };
}

async function scanAlbums(rootFolder: string) {
  const results: AlbumSummary[] = [];

  async function visitDirectory(currentDirectory: string, depth: number) {
    if (depth > 8) {
      return;
    }

    let entries: Awaited<ReturnType<typeof fs.readdir>>;

    try {
      entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    const hasMeta = entries.some((entry) => entry.isFile() && entry.name === ALBUM_META_FILENAME);
    if (hasMeta) {
      const meta = await readAlbumMeta(currentDirectory);
      if (meta) {
        results.push(await buildAlbumSummary(rootFolder, currentDirectory, meta));
      }
    }

    const directories = entries.filter((entry) => entry.isDirectory());
    await Promise.all(
      directories.map((entry) => visitDirectory(path.join(currentDirectory, entry.name), depth + 1)),
    );
  }

  try {
    await visitDirectory(rootFolder, 0);
  } catch {
    return [];
  }

  return results.sort((left, right) => {
    const timeDifference = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    return Number.isNaN(timeDifference) ? left.displayName.localeCompare(right.displayName, 'zh-CN') : timeDifference;
  });
}

async function saveAlbum(rootFolder: string, location: AlbumLocationInput, sourcePaths: string[]) {
  if (!rootFolder) {
    throw new Error('尚未选择根目录');
  }

  if (sourcePaths.length === 0) {
    throw new Error('至少需要选择一张照片');
  }

  const draft = createLocationDraft(location);
  const albumDirectory = path.join(rootFolder, draft.relativePath);
  const existingMeta = await readAlbumMeta(albumDirectory);
  const now = new Date().toISOString();

  await fs.mkdir(albumDirectory, { recursive: true });

  const addedImages: string[] = [];
  for (const sourcePath of sourcePaths) {
    const extension = path.extname(sourcePath).toLowerCase();
    const targetName = `${Date.now()}-${randomUUID().slice(0, 8)}${extension}`;
    const targetPath = path.join(albumDirectory, targetName);
    await fs.copyFile(sourcePath, targetPath);
    addedImages.push(targetPath);
  }

  const nextMeta: AlbumMetaFile = {
    ...draft,
    createdAt: existingMeta?.createdAt ?? now,
    updatedAt: now,
  };

  await writeAlbumMeta(albumDirectory, nextMeta);

  return {
    album: await buildAlbumSummary(rootFolder, albumDirectory, nextMeta),
    addedImages,
  };
}

async function setAlbumCover(rootFolder: string, relativePath: string, imageName: string) {
  const albumDirectory = path.join(rootFolder, relativePath);
  const meta = await readAlbumMeta(albumDirectory);
  if (!meta) throw new Error('相册不存在');
  meta.coverImageName = imageName;
  meta.updatedAt = new Date().toISOString();
  await writeAlbumMeta(albumDirectory, meta);
}

function requestJson<T>(url: string) {
  return new Promise<T>((resolve, reject) => {
    https.get(url, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        const payload = Buffer.concat(chunks).toString('utf8');
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode ?? 'unknown'} from geocoder`));
          return;
        }

        try {
          resolve(JSON.parse(payload) as T);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function reverseGeocodeLocation(location: Pick<AlbumLocationInput, 'lng' | 'lat'>): Promise<AlbumLocationInput> {
  const requestUrl = new URL('https://restapi.amap.com/v3/geocode/regeo');
  requestUrl.searchParams.set('key', AMAP_WEB_KEY);
  requestUrl.searchParams.set('location', `${location.lng},${location.lat}`);
  requestUrl.searchParams.set('extensions', 'base');
  requestUrl.searchParams.set('radius', '1000');

  try {
    const response = await requestJson<{
      regeocode?: {
        addressComponent?: {
          province?: string;
          city?: string | string[];
          district?: string;
          township?: string;
        };
      };
    }>(requestUrl.toString());

    const address = response.regeocode?.addressComponent;
    const province = address?.province ?? '';
    const citySource = address?.city;
    const city = Array.isArray(citySource) ? citySource[0] ?? '' : citySource ?? '';

    return {
      province,
      city: city || province,
      district: address?.district ?? '',
      township: address?.township ?? '',
      lng: location.lng,
      lat: location.lat,
    };
  } catch (error) {
    console.error('Reverse geocode failed:', error);
    return {
      lng: location.lng,
      lat: location.lat,
    };
  }
}

async function createMainWindow() {
  const window = buildWindow();
  mainWindow = window;

  if (VITE_DEV_SERVER_URL) {
    await waitForDevServer(VITE_DEV_SERVER_URL);
    await window.loadURL(VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(DIST_PATH, 'index.html'));
  }
}

function registerIpcHandlers() {
  ipcMain.handle('system:chooseRootFolder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: '选择 MapAlbum 根目录',
      properties: ['openDirectory', 'createDirectory'],
    });

    return canceled ? null : filePaths[0];
  });

  ipcMain.handle('system:chooseImages', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: '选择照片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'] }],
    });

    return canceled ? null : filePaths;
  });

  ipcMain.handle('albums:list', async (_event, rootFolder: string) => {
    if (!rootFolder) {
      return [];
    }

    return scanAlbums(rootFolder);
  });

  ipcMain.handle('albums:images', async (_event, rootFolder: string, relativePath: string) => {
    if (!rootFolder || !relativePath) {
      return [];
    }

    return listImageFiles(path.join(rootFolder, relativePath));
  });

  ipcMain.handle('albums:save', async (_event, rootFolder: string, location: AlbumLocationInput, sourcePaths: string[]) => {
    return saveAlbum(rootFolder, location, sourcePaths);
  });

  ipcMain.handle('albums:setCover', async (_event, rootFolder: string, relativePath: string, imageName: string) => {
    return setAlbumCover(rootFolder, relativePath, imageName);
  });

  ipcMain.handle('location:reverseGeocode', async (_event, location: Pick<AlbumLocationInput, 'lng' | 'lat'>) => {
    return reverseGeocodeLocation(location);
  });

  ipcMain.handle('lanUpload:start', async () => {
    return lanUploadService.start();
  });

  ipcMain.handle('lanUpload:stop', async () => {
    return lanUploadService.stop();
  });

  ipcMain.handle('lanUpload:getState', async () => {
    return lanUploadService.getState();
  });

  ipcMain.handle('lanUpload:consumeBatches', async () => {
    return lanUploadService.consumePendingBatches();
  });
}

app.whenReady().then(async () => {
  await ensureLocalMediaProtocol();
  registerIpcHandlers();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
}).catch((error) => {
  console.error('Electron bootstrap failed:', error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  void lanUploadService.stop();
});
