import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Calendar, Compass, Menu, Settings, Smartphone, UploadCloud } from 'lucide-react';
import './App.css';
import { InspectorPanel } from './components/InspectorPanel';
import { LanUploadPanel } from './components/LanUploadPanel';
import { MapCanvas } from './components/MapCanvas';
import { Sidebar } from './components/Sidebar';
import { PhotoViewer } from './components/PhotoViewer';
import { TimelineGallery } from './components/TimelineGallery';
import { TravelArchive } from './components/TravelArchive';
import { StagedImportPanel } from './components/StagedImportPanel';
import { reverseGeocodeFromPhotoGps, wgs84ToGcj02 } from './shared/amap';
import type { AlbumSummary, ImageMetadata, ImportedImageFile, LanServerState, LocationDraft, RecentLanUpload, StagedImageItem, TimelineImageMetadata } from './shared/contracts';
import { createLocationDraft, formatAlbumDisplayName, formatAlbumRelativePathForDisplay } from './shared/location';

const ROOT_FOLDER_STORAGE_KEY = 'mapalbum.root-folder';
const EMPTY_LAN_STATE: LanServerState = {
  isRunning: false,
  url: null,
  host: null,
  port: null,
};

const TIMELINE_PAGE_SIZE = 120;
const RECENT_LAN_UPLOAD_LIMIT = 12;

function getFileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || '未命名图片';
}

function createCoordinateLocation(lng: number, lat: number) {
  return createLocationDraft({
    province: '',
    city: '',
    district: '',
    township: '',
    lng,
    lat,
  });
}

function mergeStagedImages(current: StagedImageItem[], next: StagedImageItem[]) {
  const merged = new Map(current.map((item) => [item.path, item]));

  next.forEach((item) => {
    const existing = merged.get(item.path);
    if (!existing) {
      merged.set(item.path, item);
      return;
    }

    merged.set(item.path, {
      ...existing,
      name: existing.name || item.name,
      location: existing.location ?? item.location,
      locationSource: existing.locationSource ?? item.locationSource,
    });
  });

  return Array.from(merged.values());
}

function hasResolvedAddress(location: (LocationDraft | Pick<LocationDraft, 'province' | 'city' | 'district' | 'township'>) | null) {
  return Boolean(location?.province || location?.city || location?.district || location?.township);
}

function getLocationGroupKey(location: LocationDraft) {
  return `${location.relativePath}|${location.lng.toFixed(6)}|${location.lat.toFixed(6)}`;
}

async function createStagedImageFromImportedFile(file: ImportedImageFile): Promise<StagedImageItem> {
  if (!file.gps) {
    return {
      path: file.path,
      name: file.originalName || getFileName(file.path),
      location: null,
      locationSource: null,
    };
  }

  const normalizedGps = wgs84ToGcj02(file.gps.lng, file.gps.lat);
  let location = createCoordinateLocation(normalizedGps.lng, normalizedGps.lat);

  try {
    const resolvedLocation = await reverseGeocodeFromPhotoGps(file.gps);
    if (hasResolvedAddress(resolvedLocation)) {
      location = createLocationDraft(resolvedLocation);
    }
  } catch (error) {
    console.error(error);
  }

  return {
    path: file.path,
    name: file.originalName || getFileName(file.path),
    location,
    locationSource: 'gps',
  };
}

export default function App() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumImages, setAlbumImages] = useState<ImageMetadata[]>([]);
  const [draftLocation, setDraftLocation] = useState<LocationDraft | null>(null);
  const [isAlbumImagesLoading, setIsAlbumImagesLoading] = useState(false);
  const [isAlbumsLoading, setIsAlbumsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lanUploadState, setLanUploadState] = useState<LanServerState>(EMPTY_LAN_STATE);
  const [recentLanUploads, setRecentLanUploads] = useState<RecentLanUpload[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [rootFolder, setRootFolder] = useState<string | null>(null);
  const [hasLoadedRootFolder, setHasLoadedRootFolder] = useState(false);
  const [selectedAlbumPath, setSelectedAlbumPath] = useState<string | null>(null);
  const [stagedImages, setStagedImages] = useState<StagedImageItem[]>([]);
  const [selectedStagedImagePaths, setSelectedStagedImagePaths] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLanPanelOpen, setIsLanPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'archive' | 'timeline'>('map');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerSource, setViewerSource] = useState<ImageMetadata[]>([]);
  const [allImages, setAllImages] = useState<TimelineImageMetadata[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineOffset, setTimelineOffset] = useState(0);
  const [deletingImagePath, setDeletingImagePath] = useState<string | null>(null);
  const [deletingAlbumPath, setDeletingAlbumPath] = useState<string | null>(null);
  const hasPromptedForRootFolderRef = useRef(false);
  const isTimelineRequestingRef = useRef(false);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.relativePath === selectedAlbumPath) ?? null,
    [albums, selectedAlbumPath],
  );

  const totalImages = useMemo(
    () => albums.reduce((count, album) => count + album.imageCount, 0),
    [albums],
  );

  const lanQrUrl = useMemo(() => {
    if (!lanUploadState.url) {
      return null;
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(lanUploadState.url)}`;
  }, [lanUploadState.url]);

  useEffect(() => {
    async function initialize() {
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

    async function ensureRootFolder() {
      let folderInProgress = null;
      while (!folderInProgress) {
        folderInProgress = await window.api.chooseRootFolder();
        if (!folderInProgress) {
          setNotice('MapAlbum 需要先选择一个根目录才能运行，请选择用于存放相册的文件夹。');
        }
      }

      await window.api.setRootFolder(folderInProgress);
      setRootFolder(folderInProgress);
      setDraftLocation(null);
      setSelectedAlbumPath(null);
      setStagedImages([]);
      setSelectedStagedImagePaths([]);
      setReloadTick((value) => value + 1);
      setNotice('根目录设置成功。');
    }

    void ensureRootFolder();
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
    if (!rootFolder || viewMode !== 'timeline') {
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
  }, [rootFolder, viewMode, reloadTick, albums.length]);

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
          setRecentLanUploads((current) => {
            const nextUploads = batch.files.map((file, index) => ({
              id: `${batch.id}-${index}-${file.path}`,
              path: file.path,
              name: file.originalName || file.path.split(/[\\/]/).pop() || '未命名图片',
              receivedAt: batch.receivedAt,
              hasGps: Boolean(file.gps),
            }));

            return [...nextUploads, ...current].slice(0, RECENT_LAN_UPLOAD_LIMIT);
          });

          const stagedBatchItems = await Promise.all(batch.files.map(createStagedImageFromImportedFile));
          const missingLocationPaths = stagedBatchItems
            .filter((item) => !item.location)
            .map((item) => item.path);
          const gpsLocatedCount = stagedBatchItems.length - missingLocationPaths.length;

          setStagedImages((current) => mergeStagedImages(current, stagedBatchItems));
          setSelectedStagedImagePaths(missingLocationPaths);
          setSelectedAlbumPath(null);
          setDraftLocation(null);
          setViewMode('map');

          if (missingLocationPaths.length > 0) {
            setNotice(`已接收 ${stagedBatchItems.length} 张照片，其中 ${gpsLocatedCount} 张已自动定位；请为剩余 ${missingLocationPaths.length} 张选择图片并在地图上点位。`);
          } else {
            setNotice(`已接收 ${stagedBatchItems.length} 张照片，全部已自动定位。确认后即可保存归档。`);
          }
        }
      }).catch((error) => {
        console.error(error);
      });
    }, 1200);

    return () => window.clearInterval(timer);
  }, [lanUploadState.isRunning]);

  async function chooseRootFolder() {
    const folder = await window.api.chooseRootFolder();
    if (!folder) {
      return;
    }

    await window.api.setRootFolder(folder);
    setRootFolder(folder);
    setDraftLocation(null);
    setSelectedAlbumPath(null);
    setStagedImages([]);
    setSelectedStagedImagePaths([]);
    setReloadTick((value) => value + 1);
    setNotice('根目录已更新。');
  }

  async function chooseImages() {
    const paths = await window.api.chooseImages();
    if (!paths?.length) {
      return;
    }

    const defaultLocation = selectedAlbum ?? draftLocation;
    const nextItems: StagedImageItem[] = paths.map((imagePath) => ({
      path: imagePath,
      name: getFileName(imagePath),
      location: defaultLocation,
      locationSource: defaultLocation ? 'manual' : null,
    }));

    setStagedImages((current) => mergeStagedImages(current, nextItems));
    setSelectedStagedImagePaths(defaultLocation ? [] : paths);
    if (!defaultLocation) {
      setSelectedAlbumPath(null);
      setNotice(`已选择 ${paths.length} 张图片，请在列表勾选图片后到地图上选点。`);
    }
  }

  async function saveStagedImages() {
    if (!rootFolder) {
      setNotice('请先选择根目录。');
      return;
    }

    if (stagedImages.length === 0) {
      return;
    }

    const unlocatedCount = stagedImages.filter((item) => !item.location).length;
    if (unlocatedCount > 0) {
      setNotice(`还有 ${unlocatedCount} 张图片没有定位，请先批量选择图片并在地图上点位。`);
      return;
    }

    setIsSaving(true);
    try {
      const groups = new Map<string, { location: LocationDraft; paths: string[] }>();

      stagedImages.forEach((item) => {
        if (!item.location) {
          return;
        }

        const key = getLocationGroupKey(item.location);
        const current = groups.get(key) ?? { location: item.location, paths: [] };
        current.paths.push(item.path);
        groups.set(key, current);
      });

      const results: AlbumSummary[] = [];
      for (const group of groups.values()) {
        const result = await window.api.saveAlbum(rootFolder, group.location, group.paths);
        results.push(result.album);
      }

      setSelectedAlbumPath(results[0]?.relativePath ?? null);
      setStagedImages([]);
      setSelectedStagedImagePaths([]);
      setDraftLocation(null);
      setReloadTick((value) => value + 1);
      setNotice(`已按 ${groups.size} 个定位点归档 ${stagedImages.length} 张照片。`);
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '保存相册失败。');
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

  async function deleteAlbum(relativePath: string) {
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
      setReloadTick((value) => value + 1);
      setNotice(`已删除地点 ${targetAlbum ? formatAlbumDisplayName(targetAlbum) : formatAlbumRelativePathForDisplay(relativePath)}。`);
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? error.message : '删除地点失败。');
    } finally {
      setDeletingAlbumPath(null);
    }
  }

  async function startLanUpload() {
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

    if (stagedImages.length > 0) {
      if (selectedStagedImagePaths.length === 0) {
        setNotice('请先在待归档面板中勾选要定位的图片，再在地图上选点。');
        return;
      }

      const selectedPaths = new Set(selectedStagedImagePaths);
      const assignedCount = stagedImages.filter((item) => selectedPaths.has(item.path)).length;
      setStagedImages((current) => current.map((item) => (
        selectedPaths.has(item.path)
          ? { ...item, location, locationSource: 'manual' }
          : item
      )));
      setSelectedStagedImagePaths([]);
      setSelectedAlbumPath(null);
      setDraftLocation(location);
      setNotice(`已为 ${assignedCount} 张图片设置定位：${location.displayName}。`);
      return;
    }

    setSelectedAlbumPath(null);
    setDraftLocation(location);
  }

  function handleSelectAlbum(relativePath: string) {
    setDraftLocation(null);
    setSelectedAlbumPath(relativePath);
    setViewMode('map');
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
    if (!rootFolder || viewMode !== 'timeline' || !timelineHasMore || isTimelineRequestingRef.current) {
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
    setStagedImages((current) => current.filter((item) => item.path !== imagePath));
    setSelectedStagedImagePaths((current) => current.filter((item) => item !== imagePath));
  }

  function toggleStagedImageSelection(imagePath: string) {
    setSelectedStagedImagePaths((current) => (
      current.includes(imagePath)
        ? current.filter((item) => item !== imagePath)
        : [...current, imagePath]
    ));
  }

  function selectUnlocatedStagedImages() {
    const unlocatedPaths = stagedImages.filter((item) => !item.location).map((item) => item.path);
    setSelectedStagedImagePaths(unlocatedPaths);
    if (unlocatedPaths.length > 0) {
      setNotice(`已选中 ${unlocatedPaths.length} 张未定位图片，请在地图上选点。`);
    }
  }

  function clearStagedImageSelection() {
    setSelectedStagedImagePaths([]);
  }

  return (
    <div className={`app-shell${isSidebarOpen ? '' : ' app-shell--sidebar-collapsed'}`}>
      <div className="titlebar-drag-region" />

      <header className="top-nav">
        <div className="top-nav__left">
          <button className="top-nav__menu" onClick={() => setIsSidebarOpen((value) => !value)} title="切换侧边栏">
            <Menu size={20} />
          </button>
          <div className="top-nav__brand">
            <Compass size={28} />
            <span>ChronosMap</span>
          </div>
        </div>

        <div className="top-nav__summary" aria-label="相册统计">
          <span>{albums.length} 个地点</span>
          <strong>{totalImages} 张照片</strong>
        </div>

        <div className="top-nav__actions">
          <button
            className={`top-nav__icon${lanUploadState.isRunning ? ' top-nav__icon--active' : ''}`}
            onClick={() => setIsLanPanelOpen((value) => !value)}
            title="设备同步"
          >
            <UploadCloud size={20} />
          </button>
          <button className="top-nav__icon" title="通知">
            <Bell size={20} />
          </button>
          <button className="top-nav__icon" onClick={chooseRootFolder} title="选择相册根目录">
            <Settings size={20} />
          </button>
          <div className="top-nav__avatar" title="MapAlbum">
            CM
          </div>
        </div>
      </header>

      <div className="mobile-dock">
        <button className="toolbar-button" onClick={() => { setIsSidebarOpen((value) => !value); setIsLanPanelOpen(false); }} title="切换侧边栏">
          <Menu size={20} />
        </button>
        <button className="toolbar-button" onClick={() => { setIsLanPanelOpen((value) => !value); setIsSidebarOpen(false); }} title="手机上传">
          <Smartphone size={20} />
        </button>
        <button
          className={`toolbar-button${viewMode === 'timeline' ? ' toolbar-button--active' : ''}`}
          onClick={() => setViewMode((curr) => (curr === 'timeline' ? 'map' : 'timeline'))}
          title="时间线视图"
        >
          <Calendar size={20} />
        </button>
        <button className="toolbar-button" onClick={chooseRootFolder} title="选择相册根目录">
          <Settings size={20} />
        </button>
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        isLanUploadOpen={isLanPanelOpen}
        onClose={() => setIsSidebarOpen(false)}
        albums={albums}
        deletingAlbumPath={deletingAlbumPath}
        isLoading={isAlbumsLoading}
        rootFolder={rootFolder}
        selectedAlbumPath={selectedAlbumPath}
        viewMode={viewMode}
        onChooseImages={chooseImages}
        onOpenLanUpload={() => {
          setIsLanPanelOpen(true);
          setViewMode('map');
        }}
        onPickSearchedLocation={(location) => {
          setSelectedAlbumPath(null);
          setDraftLocation(location);
          setViewMode('map');
          setIsLanPanelOpen(false);
        }}
        onRefresh={() => {
          if (rootFolder) {
            setReloadTick((value) => value + 1);
          }
        }}
        onDeleteAlbum={deleteAlbum}
        onSearchError={setNotice}
        onSelectAlbum={handleSelectAlbum}
        onShowArchive={() => {
          setViewMode('archive');
          setSelectedAlbumPath(null);
          setDraftLocation(null);
          setIsLanPanelOpen(false);
        }}
        onShowMap={() => {
          setViewMode('map');
          setIsLanPanelOpen(false);
        }}
        onShowTimeline={() => {
          setViewMode('timeline');
          setIsLanPanelOpen(false);
        }}
      />

      <LanUploadPanel
        isOpen={isLanPanelOpen}
        lanQrUrl={lanQrUrl}
        lanUploadState={lanUploadState}
        recentUploads={recentLanUploads}
        onClose={() => setIsLanPanelOpen(false)}
        onStartLanUpload={startLanUpload}
        onStopLanUpload={stopLanUpload}
      />

      <main className={`workspace${viewMode === 'archive' ? ' workspace--archive' : ''}`}>
        {viewMode === 'archive' ? (
          <TravelArchive
            albums={albums}
            isLoading={isAlbumsLoading}
            rootFolder={rootFolder}
            onChooseRootFolder={chooseRootFolder}
            onOpenImages={(images, index) => {
              setViewerSource(images);
              setViewerIndex(index);
            }}
          />
        ) : (
          <div className="workspace__map">
            <MapCanvas
              albums={albums}
              draftLocation={draftLocation}
              selectedAlbumPath={selectedAlbumPath}
              onLocationPicked={handleLocationPicked}
              onMapError={setNotice}
              onSelectAlbum={handleSelectAlbum}
            />
          </div>
        )}
      </main>

      {viewMode === 'map' && (
        <InspectorPanel
          albumImages={albumImages}
          deletingImagePath={deletingImagePath}
          draftLocation={draftLocation}
          isAlbumImagesLoading={isAlbumImagesLoading}
          selectedAlbum={selectedAlbum}
          onChooseImages={chooseImages}
          onCloseDraft={() => setDraftLocation(null)}
          onCloseSelectedAlbum={() => setSelectedAlbumPath(null)}
          onDeleteImage={deleteAlbumImage}
          onSetCover={setAlbumCover}
          onSetNote={setAlbumNote}
          onViewImage={handleViewAlbumImage}
        />
      )}

      {viewMode === 'map' && (
        <StagedImportPanel
          isBesideInspector={Boolean(draftLocation || selectedAlbum)}
          isSaving={isSaving}
          selectedStagedImagePaths={selectedStagedImagePaths}
          stagedImages={stagedImages}
          onClearStagedImageSelection={clearStagedImageSelection}
          onRemoveStagedImage={removeStagedImage}
          onSaveStagedImages={saveStagedImages}
          onSelectUnlocatedStagedImages={selectUnlocatedStagedImages}
          onToggleStagedImageSelection={toggleStagedImageSelection}
        />
      )}

      {viewMode === 'timeline' && (
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
          onClose={() => setViewMode('map')}
        />
      )}

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
        <div className="setup-overlay">
          <div className="setup-card">
            <div className="setup-card__brand">
              <div className="setup-card__eyebrow">Welcome To</div>
              <h1>MapAlbum</h1>
            </div>
            <p>
              请先选择一个根目录来存放和管理您的照片相册。<br />
              MapAlbum 将基于此目录生成地理位置归档。
            </p>
            <button className="button button--primary" onClick={chooseRootFolder}>
              立即选择根目录
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

