import { randomUUID } from 'crypto';
import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { promises as fs } from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AlbumLocationInput, AlbumSummary, ImageMetadata, TimelineImageMetadata, TimelinePage } from '../src/shared/contracts';
import { createLocationDraft } from '../src/shared/location';
import { LanUploadService } from './lan-upload';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_PATH = path.join(__dirname, '../dist');
const PUBLIC_PATH = path.join(DIST_PATH, '../public');
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
const ALBUM_META_FILENAME = '_meta.json';
const CONFIG_FILENAME = 'config.json';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif']);
const AMAP_WEB_KEY = process.env['VITE_AMAP_WEB_KEY']?.trim() || '';
const SHOULD_DISABLE_HARDWARE_ACCELERATION = process.env['MAPALBUM_DISABLE_GPU'] === '1';

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'MapAlbum-dev'));
}

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILENAME);
}

async function isExistingDirectory(targetPath: string) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

let mainWindow: BrowserWindow | null = null;
let localMediaProtocolRegistered = false;
let lanUploadService: LanUploadService | null = null;
const timelineIndexCache = new Map<string, TimelineImageMetadata[]>();

function getLanUploadService() {
  if (!lanUploadService) {
    lanUploadService = new LanUploadService(path.join(app.getPath('temp'), 'mapalbum-lan-uploads'));
  }
  return lanUploadService;
}

if (SHOULD_DISABLE_HARDWARE_ACCELERATION) {
  app.disableHardwareAcceleration();
}
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
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050505',
      symbolColor: '#ffffff',
      height: 32,
    },
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
    // window.webContents.openDevTools();
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

async function listImageFiles(albumDirectory: string): Promise<ImageMetadata[]> {
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
      path: imagePath,
      mtimeMs: (await fs.stat(imagePath)).mtimeMs,
    })),
  );

  return withStats.sort((left, right) => right.mtimeMs - left.mtimeMs);
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
  const imageEntries = await listImageFiles(albumDirectory);
  const images = imageEntries.map((e) => e.path);

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
    throw new Error('尚未选择根目录。');
  }

  if (sourcePaths.length === 0) {
    throw new Error('至少需要选择一张照片。');
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
    note: existingMeta?.note ?? '',
    createdAt: existingMeta?.createdAt ?? now,
    updatedAt: now,
  };

  await writeAlbumMeta(albumDirectory, nextMeta);
  timelineIndexCache.delete(rootFolder);

  return {
    album: await buildAlbumSummary(rootFolder, albumDirectory, nextMeta),
    addedImages,
  };
}

async function setAlbumCover(rootFolder: string, relativePath: string, imageName: string) {
  const albumDirectory = path.join(rootFolder, relativePath);
  const meta = await readAlbumMeta(albumDirectory);
  if (!meta) {
    throw new Error('相册不存在。');
  }
  meta.coverImageName = imageName;
  meta.updatedAt = new Date().toISOString();
  await writeAlbumMeta(albumDirectory, meta);
}

async function setAlbumNote(rootFolder: string, relativePath: string, note: string) {
  const albumDirectory = path.join(rootFolder, relativePath);
  const meta = await readAlbumMeta(albumDirectory);
  if (!meta) {
    throw new Error('相册不存在。');
  }
  meta.note = note.trim();
  meta.updatedAt = new Date().toISOString();
  await writeAlbumMeta(albumDirectory, meta);
}

async function deleteAlbumImage(rootFolder: string, relativePath: string, imageName: string) {
  if (!rootFolder) {
    throw new Error('尚未选择根目录。');
  }

  const safeImageName = path.basename(imageName);
  if (!safeImageName || !isImageFile(safeImageName)) {
    throw new Error('无效的图片名称。');
  }

  const albumDirectory = path.join(rootFolder, relativePath);
  const imagePath = path.join(albumDirectory, safeImageName);
  const meta = await readAlbumMeta(albumDirectory);
  if (!meta) {
    throw new Error('相册不存在。');
  }

  await fs.unlink(imagePath);

  const remainingImages = await listImageFiles(albumDirectory);
  if (meta.coverImageName === safeImageName) {
    meta.coverImageName = remainingImages[0] ? path.basename(remainingImages[0].path) : '';
  }
  meta.updatedAt = new Date().toISOString();
  await writeAlbumMeta(albumDirectory, meta);
  timelineIndexCache.delete(rootFolder);

  return {
    remainingCount: remainingImages.length,
  };
}

async function deleteAlbum(rootFolder: string, relativePath: string) {
  if (!rootFolder) {
    throw new Error('尚未选择根目录。');
  }

  const albumDirectory = path.join(rootFolder, relativePath);
  const meta = await readAlbumMeta(albumDirectory);
  if (!meta) {
    throw new Error('相册不存在。');
  }

  await fs.rm(albumDirectory, { recursive: true, force: false });
  timelineIndexCache.delete(rootFolder);
}

async function buildTimelineIndex(rootFolder: string): Promise<TimelineImageMetadata[]> {
  const albums = await scanAlbums(rootFolder);

  const batches = await Promise.all(
    albums.map(async (album) => {
      const images = await listImageFiles(path.join(rootFolder, album.relativePath));
      return images.map((image) => ({
        ...image,
        albumName: album.displayName,
        albumPath: album.relativePath,
      }));
    }),
  );

  return batches.flat().sort((left, right) => right.mtimeMs - left.mtimeMs);
}

async function getTimelinePage(
  rootFolder: string,
  offset: number,
  limit: number,
  refresh = false,
): Promise<TimelinePage> {
  if (!rootFolder) {
    return {
      items: [],
      hasMore: false,
      total: 0,
      nextOffset: 0,
    };
  }

  if (refresh || !timelineIndexCache.has(rootFolder)) {
    timelineIndexCache.set(rootFolder, await buildTimelineIndex(rootFolder));
  }

  const items = timelineIndexCache.get(rootFolder) ?? [];
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, limit);
  const pageItems = items.slice(safeOffset, safeOffset + safeLimit);
  const nextOffset = safeOffset + pageItems.length;

  return {
    items: pageItems,
    hasMore: nextOffset < items.length,
    total: items.length,
    nextOffset,
  };
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
  if (!AMAP_WEB_KEY) {
    return {
      lng: location.lng,
      lat: location.lat,
    };
  }

  const requestUrl = new URL('https://restapi.amap.com/v3/geocode/regeo');
  requestUrl.searchParams.set('key', AMAP_WEB_KEY);
  requestUrl.searchParams.set('location', `${location.lng},${location.lat}`);
  requestUrl.searchParams.set('extensions', 'base');
  requestUrl.searchParams.set('radius', '1000');

  try {
    const response = await requestJson<{
      status?: string;
      info?: string;
      regeocode?: {
        addressComponent?: {
          province?: string;
          city?: string | string[];
          district?: string;
          township?: string;
          streetNumber?: {
            street?: string;
          };
        };
      };
    }>(requestUrl.toString());

    if (response.status !== '1' || !response.regeocode?.addressComponent) {
      throw new Error(response.info || '高德逆地理编码失败。');
    }

    const address = response.regeocode.addressComponent;
    const province = address.province ?? '';
    const citySource = address.city;
    const city = Array.isArray(citySource) ? citySource[0] ?? '' : citySource ?? '';
    const township = address.township || address.streetNumber?.street || '';

    return {
      province,
      city: city || province,
      district: address.district ?? '',
      township,
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

async function getRootFolder() {
  try {
    const content = await fs.readFile(getConfigPath(), 'utf-8');
    const config = JSON.parse(content);
    const rootFolder = typeof config.rootFolder === 'string' ? config.rootFolder.trim() : '';
    if (!rootFolder) {
      return null;
    }

    if (!(await isExistingDirectory(rootFolder))) {
      return null;
    }

    return rootFolder;
  } catch {
    return null;
  }
}

async function setRootFolder(rootFolder: string | null) {
  try {
    const config = { rootFolder };
    await fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

function registerIpcHandlers() {
  ipcMain.handle('system:getRootFolder', async () => {
    return getRootFolder();
  });

  ipcMain.handle('system:setRootFolder', async (_event, rootFolder: string | null) => {
    return setRootFolder(rootFolder);
  });

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

  ipcMain.handle('timeline:page', async (_event, rootFolder: string, offset: number, limit: number, refresh?: boolean) => {
    return getTimelinePage(rootFolder, offset, limit, refresh);
  });

  ipcMain.handle('albums:save', async (_event, rootFolder: string, location: AlbumLocationInput, sourcePaths: string[]) => {
    return saveAlbum(rootFolder, location, sourcePaths);
  });

  ipcMain.handle('albums:setCover', async (_event, rootFolder: string, relativePath: string, imageName: string) => {
    return setAlbumCover(rootFolder, relativePath, imageName);
  });

  ipcMain.handle('albums:setNote', async (_event, rootFolder: string, relativePath: string, note: string) => {
    return setAlbumNote(rootFolder, relativePath, note);
  });

  ipcMain.handle('albums:deleteImage', async (_event, rootFolder: string, relativePath: string, imageName: string) => {
    return deleteAlbumImage(rootFolder, relativePath, imageName);
  });

  ipcMain.handle('albums:delete', async (_event, rootFolder: string, relativePath: string) => {
    return deleteAlbum(rootFolder, relativePath);
  });

  ipcMain.handle('location:reverseGeocode', async (_event, location: Pick<AlbumLocationInput, 'lng' | 'lat'>) => {
    return reverseGeocodeLocation(location);
  });

  ipcMain.handle('lanUpload:start', async () => {
    return getLanUploadService().start();
  });

  ipcMain.handle('lanUpload:stop', async () => {
    return getLanUploadService().stop();
  });

  ipcMain.handle('lanUpload:getState', async () => {
    return getLanUploadService().getState();
  });

  ipcMain.handle('lanUpload:consumeBatches', async () => {
    return getLanUploadService().consumePendingBatches();
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
  void getLanUploadService().stop();
});



