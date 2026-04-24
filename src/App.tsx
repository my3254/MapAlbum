import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Minus,
  Search,
  Settings2,
  Square,
  UserRound,
  X,
} from 'lucide-react';
import './App.css';
import { AppNavigation, type AppView } from './components/AppNavigation';
import { AlbumBoard, DashboardBoard, RecycleBoard, SettingsBoard, StatsBoard } from './components/BoardViews';
import { InspectorPanel } from './components/InspectorPanel';
import { LanUploadPanel } from './components/LanUploadPanel';
import { MapCanvas } from './components/MapCanvas';
import { PhotoViewer } from './components/PhotoViewer';
import { PlacesTimelineBoard } from './components/PlacesTimelineBoard';
import { TimelineGallery } from './components/TimelineGallery';
import { reverseGeocodeFromPhotoGps, wgs84ToGcj02 } from './shared/amap';
import type {
  AlbumSummary,
  ImageMetadata,
  ImportedImageFile,
  LanServerState,
  LocationDraft,
  TimelineImageMetadata,
} from './shared/contracts';
import { createLocationDraft } from './shared/location';
import { toLocalMediaUrl } from './shared/media';

const ROOT_FOLDER_STORAGE_KEY = 'mapalbum.root-folder';
const EMPTY_LAN_STATE: LanServerState = {
  isRunning: false,
  url: null,
  host: null,
  port: null,
};

const GPS_GROUP_PRECISION = 6;
const TIMELINE_PAGE_SIZE = 120;

const viewTitles: Record<AppView, string> = {
  workbench: '工作台',
  map: '地图',
  places: '地点',
  albums: '相册',
  timeline: '时间线',
  stats: '照片信息',
  upload: '局域网上传',
  recycle: '回收站',
  settings: '设置',
};

function mergeUniquePaths(current: string[], next: string[]) {
  return Array.from(new Set([...current, ...next]));
}

function summarizeImportedFiles(files: ImportedImageFile[]) {
  const gpsCount = files.filter((file) => file.gps).length;
  if (gpsCount > 0) {
    return `已接收 ${files.length} 张手机照片，其中 ${gpsCount} 张识别到 GPS 信息并已定位到地图上。`;
  }
  return `已接收 ${files.length} 张手机照片，但没有识别到 GPS 信息，请在地图上手动选点后再保存。`;
}

function roundCoordinate(value: number) {
  return Number(value.toFixed(GPS_GROUP_PRECISION));
}

function groupImportedFiles(files: ImportedImageFile[]) {
  const gpsGroups = new Map<string, ImportedImageFile[]>();
  const withoutGps: ImportedImageFile[] = [];

  files.forEach((file) => {
    if (!file.gps) {
      withoutGps.push(file);
      return;
    }

    const lat = roundCoordinate(file.gps.lat);
    const lng = roundCoordinate(file.gps.lng);
    const key = `${lat},${lng}`;
    const current = gpsGroups.get(key) ?? [];
    current.push({
      ...file,
      gps: { lat, lng },
    });
    gpsGroups.set(key, current);
  });

  return {
    gpsGroups: Array.from(gpsGroups.values()),
    withoutGps,
  };
}

function hasResolvedAddress(location: (LocationDraft | Pick<LocationDraft, 'province' | 'city' | 'district' | 'township'>) | null) {
  return Boolean(location?.province || location?.city || location?.district || location?.township);
}

function TopChrome({
  activeView,
  onSettings,
}: {
  activeView: AppView;
  onSettings: () => void;
}) {
  return (
    <header className="top-chrome">
      <label className="global-search">
        <Search size={15} />
        <input placeholder="搜索照片、地点、相册..." />
        <kbd>Ctrl + K</kbd>
      </label>
      <div className="top-chrome__spacer" />
      <button type="button" className="top-icon-button" title="通知">
        <Bell size={16} />
        <i />
      </button>
      <button type="button" className="avatar-button" title="账户">
        <UserRound size={16} />
      </button>
      <button type="button" className="top-icon-button" title="设置" onClick={onSettings}>
        <Settings2 size={16} />
      </button>
      <div className="window-controls" aria-hidden="true">
        <span><Minus size={13} /></span>
        <span><Square size={12} /></span>
        <span><X size={13} /></span>
      </div>
      <strong className="top-chrome__title">{viewTitles[activeView]}</strong>
    </header>
  );
}

function MapAlbumTray({
  albums,
  selectedAlbumPath,
  onOpenDetails,
  onSelectAlbum,
}: {
  albums: AlbumSummary[];
  selectedAlbumPath: string | null;
  onOpenDetails: () => void;
  onSelectAlbum: (relativePath: string) => void;
}) {
  const selectedAlbum = albums.find((album) => album.relativePath === selectedAlbumPath) ?? albums[0] ?? null;
  const previews = selectedAlbum ? (selectedAlbum.previewPaths.length ? selectedAlbum.previewPaths : selectedAlbum.coverPath ? [selectedAlbum.coverPath] : []) : [];

  return (
    <div className="map-album-tray">
      <div className="map-album-tray__head">
        <span>{selectedAlbum ? selectedAlbum.displayName : '暂无地点相册'}</span>
        <small>{selectedAlbum ? `${selectedAlbum.imageCount} 张照片` : '在地图上选点，或从本地导入照片'}</small>
        <button type="button" disabled={!selectedAlbum} onClick={onOpenDetails}>
          查看详情
        </button>
      </div>
      <div className="map-album-tray__photos">
        {previews.length > 0 ? (
          previews.slice(0, 6).map((path) => (
            <button key={path} type="button" onClick={() => selectedAlbum && onSelectAlbum(selectedAlbum.relativePath)}>
              <img src={toLocalMediaUrl(path)} alt="" loading="lazy" decoding="async" draggable={false} />
            </button>
          ))
        ) : (
          Array.from({ length: 6 }).map((_, index) => <span key={index} className="photo-placeholder" />)
        )}
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  album,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  album: AlbumSummary | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!album) {
    return null;
  }

  return (
    <div className="dialog-layer">
      <section className="dialog dialog--confirm">
        <button type="button" className="icon-button dialog__close" onClick={onCancel} title="关闭">
          <X size={16} />
        </button>
        <div className="warning-sign">!</div>
        <h2>确定要删除“{album.displayName}”相册吗？</h2>
        <p>该相册包含 {album.imageCount} 张照片，删除后将无法恢复。</p>
        <label className="check-row">
          <input type="checkbox" />
          <span>同时删除相册内的照片</span>
        </label>
        <footer className="dialog__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>取消</button>
          <button type="button" className="button button--danger" disabled={isDeleting} onClick={onConfirm}>
            {isDeleting ? '删除中...' : '删除'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default function App() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumImages, setAlbumImages] = useState<ImageMetadata[]>([]);
  const [draftLocation, setDraftLocation] = useState<LocationDraft | null>(null);
  const [isAlbumImagesLoading, setIsAlbumImagesLoading] = useState(false);
  const [isAlbumsLoading, setIsAlbumsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lanUploadState, setLanUploadState] = useState<LanServerState>(EMPTY_LAN_STATE);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [rootFolder, setRootFolder] = useState<string | null>(null);
  const [hasLoadedRootFolder, setHasLoadedRootFolder] = useState(false);
  const [selectedAlbumPath, setSelectedAlbumPath] = useState<string | null>(null);
  const [stagedImages, setStagedImages] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<AppView>('places');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerSource, setViewerSource] = useState<ImageMetadata[]>([]);
  const [allImages, setAllImages] = useState<TimelineImageMetadata[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineOffset, setTimelineOffset] = useState(0);
  const [deletingImagePath, setDeletingImagePath] = useState<string | null>(null);
  const [deletingAlbumPath, setDeletingAlbumPath] = useState<string | null>(null);
  const [pendingDeleteAlbumPath, setPendingDeleteAlbumPath] = useState<string | null>(null);
  const [isAlbumDetailOpen, setIsAlbumDetailOpen] = useState(false);
  const hasPromptedForRootFolderRef = useRef(false);
  const isTimelineRequestingRef = useRef(false);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.relativePath === selectedAlbumPath) ?? null,
    [albums, selectedAlbumPath],
  );

  const pendingDeleteAlbum = useMemo(
    () => albums.find((album) => album.relativePath === pendingDeleteAlbumPath) ?? null,
    [albums, pendingDeleteAlbumPath],
  );

  const inspectorSelectedAlbum = isAlbumDetailOpen || stagedImages.length > 0 ? selectedAlbum : null;

  const lanQrUrl = useMemo(() => {
    if (!lanUploadState.url) {
      return null;
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(lanUploadState.url)}`;
  }, [lanUploadState.url]);

  useEffect(() => {
    async function initialize() {
      if (!window.api) {
        setHasLoadedRootFolder(true);
        return;
      }

      try {
        let currentRoot = await window.api.getRootFolder();

        if (!currentRoot) {
          const legacyRoot = localStorage.getItem(ROOT_FOLDER_STORAGE_KEY);
          if (legacyRoot) {
            currentRoot = legacyRoot;
            await window.api.setRootFolder(currentRoot);
            localStorage.removeItem(ROOT_FOLDER_STORAGE_KEY);
          }
        }

        if (currentRoot) {
          setRootFolder(currentRoot);
        }
      } catch (error) {
        console.error('Initialization failed:', error);
      } finally {
        setHasLoadedRootFolder(true);
      }

      try {
        const state = await window.api.getLanUploadState();
        setLanUploadState(state);
      } catch (error) {
        console.error(error);
      }
    }

    void initialize();
  }, []);

  useEffect(() => {
    if (!hasLoadedRootFolder || rootFolder || hasPromptedForRootFolderRef.current) {
      return;
    }

    hasPromptedForRootFolderRef.current = true;
    setNotice('请先在设置中选择相册根目录。');
  }, [hasLoadedRootFolder, rootFolder]);

  useEffect(() => {
    if (!rootFolder) {
      setAlbums([]);
      setAlbumImages([]);
      setSelectedAlbumPath(null);
      return;
    }

    const rootFolderPath = rootFolder;
    let cancelled = false;

    async function loadAlbums() {
      setIsAlbumsLoading(true);
      try {
        const nextAlbums = await window.api.listAlbums(rootFolderPath);
        if (cancelled) {
          return;
        }

        setAlbums(nextAlbums);

        if (selectedAlbumPath && !nextAlbums.some((album) => album.relativePath === selectedAlbumPath)) {
          setSelectedAlbumPath(null);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setNotice('刷新相册失败，请检查根目录权限。');
        }
      } finally {
        if (!cancelled) {
          setIsAlbumsLoading(false);
        }
      }
    }

    void loadAlbums();

    return () => {
      cancelled = true;
    };
  }, [reloadTick, rootFolder, selectedAlbumPath]);

  useEffect(() => {
    if (!rootFolder || !selectedAlbumPath) {
      setAlbumImages([]);
      return;
    }

    const rootFolderPath = rootFolder;
    const albumPath = selectedAlbumPath;
    let cancelled = false;

    async function loadAlbumImages() {
      setIsAlbumImagesLoading(true);
      try {
        const images = await window.api.getAlbumImages(rootFolderPath, albumPath);
        if (!cancelled) {
          setAlbumImages(images);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAlbumImages([]);
          setNotice('加载相册图片失败。');
        }
      } finally {
        if (!cancelled) {
          setIsAlbumImagesLoading(false);
        }
      }
    }

    void loadAlbumImages();

    return () => {
      cancelled = true;
    };
  }, [rootFolder, selectedAlbumPath]);

  useEffect(() => {
    if (!rootFolder || activeView !== 'timeline') {
      return;
    }

    const timelineRootFolder = rootFolder;
    let cancelled = false;
    async function loadFirstTimelinePage() {
      isTimelineRequestingRef.current = true;
      setIsTimelineLoading(true);
      try {
        const page = await window.api.getTimelinePage(timelineRootFolder, 0, TIMELINE_PAGE_SIZE, true);
        if (cancelled) {
          return;
        }

        setAllImages(page.items);
        setTimelineHasMore(page.hasMore);
        setTimelineTotal(page.total);
        setTimelineOffset(page.nextOffset);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setNotice('加载全局时间线图片失败。');
        }
      } finally {
        isTimelineRequestingRef.current = false;
        if (!cancelled) {
          setIsTimelineLoading(false);
        }
      }
    }

    setAllImages([]);
    setTimelineHasMore(false);
    setTimelineTotal(0);
    setTimelineOffset(0);
    void loadFirstTimelinePage();
    return () => {
      cancelled = true;
      isTimelineRequestingRef.current = false;
    };
  }, [rootFolder, activeView, reloadTick, albums.length]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!lanUploadState.isRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      void window.api.consumeLanUploadBatches().then(async (batches) => {
        if (batches.length === 0) {
          return;
        }

        for (const batch of batches) {
          const { gpsGroups, withoutGps } = groupImportedFiles(batch.files);
          const autoSavedAlbums: AlbumSummary[] = [];
          let manualSelectionCount = withoutGps.length;

          if (rootFolder && gpsGroups.length > 0) {
            for (const group of gpsGroups) {
              const gps = group[0].gps;
              if (!gps) {
                continue;
              }

              const normalizedGps = wgs84ToGcj02(gps.lng, gps.lat);
              let resolvedLocation = null;
              try {
                resolvedLocation = await reverseGeocodeFromPhotoGps(gps);
              } catch (error) {
                console.error(error);
              }

              if (!resolvedLocation || !hasResolvedAddress(resolvedLocation)) {
                manualSelectionCount += group.length;
                setStagedImages((current) => mergeUniquePaths(current, group.map((file) => file.path)));
                if (!draftLocation) {
                  setSelectedAlbumPath(null);
                  setDraftLocation(createLocationDraft(normalizedGps));
                }
                continue;
              }

              const result = await window.api.saveAlbum(
                rootFolder,
                createLocationDraft(resolvedLocation),
                group.map((file) => file.path),
              );
              autoSavedAlbums.push(result.album);
            }

            if (autoSavedAlbums.length > 0) {
              setReloadTick((value) => value + 1);
              setSelectedAlbumPath(autoSavedAlbums[0].relativePath);
              setDraftLocation(null);
            }
          } else if (gpsGroups.length > 0) {
            const fallbackPaths = gpsGroups.flatMap((group) => group.map((file) => file.path));
            setStagedImages((current) => mergeUniquePaths(current, fallbackPaths));

            const firstGps = gpsGroups[0][0]?.gps;
            if (firstGps) {
              const normalizedGps = wgs84ToGcj02(firstGps.lng, firstGps.lat);
              setSelectedAlbumPath(null);
              setDraftLocation(createLocationDraft(normalizedGps));
            }
          }

          if (withoutGps.length > 0) {
            setStagedImages((current) => mergeUniquePaths(current, withoutGps.map((file) => file.path)));
          }

          if (rootFolder && autoSavedAlbums.length > 0) {
            const gpsImageCount = gpsGroups.reduce((count, group) => count + group.length, 0);
            if (manualSelectionCount > 0) {
              setNotice(`已按地理位置自动归档 ${gpsImageCount} 张照片，共生成 ${autoSavedAlbums.length} 个地点相册；另有部分照片缺少可用地理位置，需要手动选点。`);
            } else {
              setNotice(`已按地理位置自动归档 ${gpsImageCount} 张照片，共生成 ${autoSavedAlbums.length} 个地点相册。`);
            }
          } else {
            setNotice(summarizeImportedFiles(batch.files));
          }
        }
      }).catch((error) => {
        console.error(error);
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [lanUploadState.isRunning, rootFolder, draftLocation]);

  async function chooseRootFolder() {
    if (!window.api) {
      setNotice('请在桌面客户端中选择本地目录。');
      return;
    }

    const folder = await window.api.chooseRootFolder();
    if (!folder) {
      return;
    }

    await window.api.setRootFolder(folder);
    setRootFolder(folder);
    setDraftLocation(null);
    setSelectedAlbumPath(null);
    setStagedImages([]);
    setReloadTick((value) => value + 1);
    setNotice('根目录已更新。');
  }

  async function chooseImages() {
    if (!window.api) {
      setNotice('请在桌面客户端中导入本地照片。');
      return;
    }

    const paths = await window.api.chooseImages();
    if (!paths?.length) {
      return;
    }

    setStagedImages((current) => mergeUniquePaths(current, paths));
  }

  async function createAlbum(location: LocationDraft, sourcePaths: string[]) {
    if (!rootFolder) {
      setNotice('请先选择根目录。');
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.api.saveAlbum(rootFolder, location, sourcePaths);
      setDraftLocation(null);
      setSelectedAlbumPath(result.album.relativePath);
      setStagedImages([]);
      setReloadTick((value) => value + 1);
      setNotice(`已保存 ${result.addedImages.length} 张照片到 ${result.album.displayName}。`);
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '保存相册失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function addImagesToAlbum(album: AlbumSummary, sourcePaths: string[]) {
    if (!rootFolder) {
      setNotice('请先选择根目录。');
      return;
    }

    setIsSaving(true);
    try {
      const result = await window.api.saveAlbum(rootFolder, album, sourcePaths);
      setSelectedAlbumPath(result.album.relativePath);
      setStagedImages([]);
      setReloadTick((value) => value + 1);
      setAlbumImages(await window.api.getAlbumImages(rootFolder, result.album.relativePath));
      setNotice(`已向 ${result.album.displayName} 追加 ${result.addedImages.length} 张照片。`);
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '追加图片失败。');
    } finally {
      setIsSaving(false);
    }
  }

  async function setAlbumCover(album: AlbumSummary, imageName: string) {
    if (!rootFolder) {
      return;
    }

    try {
      await window.api.setAlbumCover(rootFolder, album.relativePath, imageName);
      setReloadTick((value) => value + 1);
      setNotice('相册封面已更新。');
    } catch (error) {
      console.error(error);
      setNotice('更新相册封面失败。');
    }
  }

  async function setAlbumNote(album: AlbumSummary, note: string) {
    if (!rootFolder) {
      return;
    }

    try {
      await window.api.setAlbumNote(rootFolder, album.relativePath, note);
      setReloadTick((value) => value + 1);
      setNotice('留言已保存。');
    } catch (error) {
      console.error(error);
      setNotice('保存留言失败。');
    }
  }

  async function deleteAlbumImage(relativePath: string, imagePath: string) {
    if (!rootFolder) {
      return;
    }

    const imageName = imagePath.split(/[\\/]/).pop();
    if (!imageName) {
      return;
    }

    setDeletingImagePath(imagePath);
    try {
      await window.api.deleteAlbumImage(rootFolder, relativePath, imageName);
      setViewerIndex(null);
      setAlbumImages((current) => current.filter((entry) => entry.path !== imagePath));
      setAllImages((current) => current.filter((entry) => entry.path !== imagePath));
      setTimelineTotal((current) => Math.max(0, current - 1));
      setReloadTick((value) => value + 1);
      setNotice(`已删除照片 ${imageName}。`);
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '删除照片失败。');
    } finally {
      setDeletingImagePath(null);
    }
  }

  async function performDeleteAlbum(relativePath: string) {
    if (!rootFolder) {
      return;
    }

    const targetAlbum = albums.find((album) => album.relativePath === relativePath);
    setDeletingAlbumPath(relativePath);
    try {
      await window.api.deleteAlbum(rootFolder, relativePath);
      setViewerIndex(null);
      setAlbumImages([]);
      setAllImages((current) => current.filter((entry) => entry.albumPath !== relativePath));
      if (selectedAlbumPath === relativePath) {
        setSelectedAlbumPath(null);
      }
      setPendingDeleteAlbumPath(null);
      setIsAlbumDetailOpen(false);
      setReloadTick((value) => value + 1);
      setNotice(`已删除地点 ${targetAlbum?.displayName ?? relativePath}。`);
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '删除地点失败。');
    } finally {
      setDeletingAlbumPath(null);
    }
  }

  async function startLanUpload() {
    if (!window.api) {
      setNotice('请在桌面客户端中启动局域网上传。');
      return;
    }

    try {
      const nextState = await window.api.startLanUpload();
      setLanUploadState(nextState);
      setNotice(nextState.url ? `手机上传已启动：${nextState.url}` : '手机上传已启动。');
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '启动手机上传失败。');
    }
  }

  async function stopLanUpload() {
    if (!window.api) {
      setNotice('请在桌面客户端中停止局域网上传。');
      return;
    }

    try {
      const nextState = await window.api.stopLanUpload();
      setLanUploadState(nextState);
      setNotice('手机上传已停止。');
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '停止手机上传失败。');
    }
  }

  function handleLocationPicked(location: LocationDraft) {
    if (!rootFolder) {
      void chooseRootFolder();
      return;
    }

    setSelectedAlbumPath(null);
    setDraftLocation(location);
    setIsAlbumDetailOpen(false);
  }

  function handleSelectAlbum(relativePath: string) {
    setDraftLocation(null);
    setSelectedAlbumPath(relativePath);
    setActiveView('map');
  }

  function handleSelectAlbumInPlaces(relativePath: string) {
    setDraftLocation(null);
    setSelectedAlbumPath(relativePath);
  }

  function handleViewAlbumImage(imagePath: string) {
    const index = albumImages.findIndex((entry) => entry.path === imagePath);
    if (index !== -1) {
      setViewerSource(albumImages);
      setViewerIndex(index);
    }
  }

  function handleViewTimelineImage(path: string) {
    const index = allImages.findIndex((img) => img.path === path);
    if (index !== -1) {
      setViewerSource(allImages);
      setViewerIndex(index);
    }
  }

  async function handleLoadMoreTimelineImages() {
    if (!rootFolder || activeView !== 'timeline' || !timelineHasMore || isTimelineRequestingRef.current) {
      return;
    }

    const timelineRootFolder = rootFolder;
    isTimelineRequestingRef.current = true;
    setIsTimelineLoading(true);

    try {
      const page = await window.api.getTimelinePage(timelineRootFolder, timelineOffset, TIMELINE_PAGE_SIZE, false);
      setAllImages((current) => [...current, ...page.items]);
      setTimelineHasMore(page.hasMore);
      setTimelineTotal(page.total);
      setTimelineOffset(page.nextOffset);
    } catch (error) {
      console.error(error);
      setNotice('加载更多时间线图片失败。');
    } finally {
      isTimelineRequestingRef.current = false;
      setIsTimelineLoading(false);
    }
  }

  function removeStagedImage(imagePath: string) {
    setStagedImages((current) => current.filter((item) => item !== imagePath));
  }

  function refreshAlbums() {
    if (rootFolder) {
      setReloadTick((value) => value + 1);
    }
  }

  function handleViewChange(view: AppView) {
    setActiveView(view);
    setIsAlbumDetailOpen(false);
  }

  function openMapView() {
    setActiveView('map');
  }

  function openUploadPanel() {
    setActiveView('upload');
  }

  function openCreateAlbumDialog() {
    setActiveView('map');
    setSelectedAlbumPath(null);
    setIsAlbumDetailOpen(false);
    void chooseImages();
    setNotice('请选择照片后，在地图上点击地点创建相册。');
  }

  function requestDeleteAlbum(relativePath: string) {
    setPendingDeleteAlbumPath(relativePath);
    return Promise.resolve();
  }

  const boardProps = {
    albums,
    deletingAlbumPath,
    isLoading: isAlbumsLoading,
    rootFolder,
    selectedAlbumPath,
    onChooseImages: chooseImages,
    onChooseRootFolder: chooseRootFolder,
    onDeleteAlbum: requestDeleteAlbum,
    onOpenCreateAlbum: openCreateAlbumDialog,
    onOpenMap: openMapView,
    onOpenUpload: openUploadPanel,
    onRefresh: refreshAlbums,
    onSelectAlbum: handleSelectAlbum,
  };

  return (
    <div className="app-shell">
      <div className="titlebar-drag-region" />

      <AppNavigation
        activeView={activeView}
        albumCount={albums.length}
        isLanRunning={lanUploadState.isRunning}
        rootFolder={rootFolder}
        onViewChange={handleViewChange}
      />

      <main className={`workspace workspace--${activeView}`}>
        {activeView !== 'places' && <TopChrome activeView={activeView} onSettings={() => setActiveView('settings')} />}

        {activeView === 'workbench' && <DashboardBoard {...boardProps} />}
        {activeView === 'places' && (
          <PlacesTimelineBoard
            albums={albums}
            draftLocation={draftLocation}
            isLoading={isAlbumsLoading}
            rootFolder={rootFolder}
            selectedAlbumPath={selectedAlbumPath}
            onChooseRootFolder={chooseRootFolder}
            onLocationPicked={handleLocationPicked}
            onMapError={setNotice}
            onOpenDetails={() => setIsAlbumDetailOpen(true)}
            onSelectAlbum={handleSelectAlbumInPlaces}
          />
        )}
        {activeView === 'albums' && <AlbumBoard {...boardProps} mode="albums" />}
        {activeView === 'stats' && <StatsBoard albums={albums} isLoading={isAlbumsLoading} />}
        {activeView === 'recycle' && <RecycleBoard rootFolder={rootFolder} />}
        {activeView === 'settings' && <SettingsBoard rootFolder={rootFolder} onChooseRootFolder={chooseRootFolder} />}
        {activeView === 'upload' && (
          <LanUploadPanel
            lanQrUrl={lanQrUrl}
            lanUploadState={lanUploadState}
            onStartLanUpload={startLanUpload}
            onStopLanUpload={stopLanUpload}
          />
        )}
        {activeView === 'timeline' && (
          <TimelineGallery
            deletingImagePath={deletingImagePath}
            images={allImages}
            hasMore={timelineHasMore}
            isLoading={isTimelineLoading}
            total={timelineTotal}
            onLoadMore={() => {
              void handleLoadMoreTimelineImages();
            }}
            onDeleteImage={(image) => {
              void deleteAlbumImage(image.albumPath, image.path);
            }}
            onViewImage={handleViewTimelineImage}
            onClose={openMapView}
          />
        )}
        {activeView === 'map' && (
          <section className="map-page">
            <MapCanvas
              albums={albums}
              draftLocation={draftLocation}
              selectedAlbumPath={selectedAlbumPath}
              onLocationPicked={handleLocationPicked}
              onMapError={setNotice}
              onSelectAlbum={handleSelectAlbum}
            />
            <MapAlbumTray
              albums={albums}
              selectedAlbumPath={selectedAlbumPath}
              onOpenDetails={() => setIsAlbumDetailOpen(true)}
              onSelectAlbum={handleSelectAlbum}
            />
          </section>
        )}
      </main>

      <InspectorPanel
        albumImages={albumImages}
        deletingImagePath={deletingImagePath}
        draftLocation={draftLocation}
        isAlbumImagesLoading={isAlbumImagesLoading}
        isSaving={isSaving}
        selectedAlbum={inspectorSelectedAlbum}
        stagedImages={stagedImages}
        onAddImagesToAlbum={addImagesToAlbum}
        onChooseImages={chooseImages}
        onCloseDraft={() => {
          setDraftLocation(null);
          setStagedImages([]);
        }}
        onCloseSelectedAlbum={() => {
          setIsAlbumDetailOpen(false);
          if (stagedImages.length > 0) {
            setStagedImages([]);
          }
        }}
        onCreateAlbum={createAlbum}
        onDeleteImage={deleteAlbumImage}
        onRemoveStagedImage={removeStagedImage}
        onSetCover={setAlbumCover}
        onSetNote={setAlbumNote}
        onViewImage={handleViewAlbumImage}
      />

      <DeleteConfirmDialog
        album={pendingDeleteAlbum}
        isDeleting={Boolean(deletingAlbumPath)}
        onCancel={() => setPendingDeleteAlbumPath(null)}
        onConfirm={() => {
          if (pendingDeleteAlbumPath) {
            void performDeleteAlbum(pendingDeleteAlbumPath);
          }
        }}
      />

      {viewerIndex !== null && (
        <PhotoViewer
          images={viewerSource}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      )}

      {notice && <div className="notice-bar">{notice}</div>}

      {!rootFolder && hasLoadedRootFolder && (
        <button type="button" className="root-folder-chip" onClick={chooseRootFolder}>
          选择相册根目录
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
