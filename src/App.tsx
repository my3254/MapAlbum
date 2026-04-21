import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Settings, Smartphone } from 'lucide-react';
import './App.css';
import { InspectorPanel } from './components/InspectorPanel';
import { LanUploadPanel } from './components/LanUploadPanel';
import { MapCanvas } from './components/MapCanvas';
import { Sidebar } from './components/Sidebar';
import { reverseGeocodeFromPhotoGps, wgs84ToGcj02 } from './shared/amap';
import type { AlbumSummary, ImportedImageFile, LanServerState, LocationDraft } from './shared/contracts';
import { createLocationDraft } from './shared/location';

const ROOT_FOLDER_STORAGE_KEY = 'mapalbum.root-folder';
const EMPTY_LAN_STATE: LanServerState = {
  isRunning: false,
  url: null,
  host: null,
  port: null,
};

const GPS_GROUP_PRECISION = 6;

function mergeUniquePaths(current: string[], next: string[]) {
  return Array.from(new Set([...current, ...next]));
}

function summarizeImportedFiles(files: ImportedImageFile[]) {
  const gpsCount = files.filter((file) => file.gps).length;
  if (gpsCount > 0) {
    return `已接收 ${files.length} 张手机照片，其中 ${gpsCount} 张识别到 GPS 信息并已定位到地图。`;
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

export default function App() {
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumImages, setAlbumImages] = useState<string[]>([]);
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLanPanelOpen, setIsLanPanelOpen] = useState(false);
  const hasPromptedForRootFolderRef = useRef(false);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.relativePath === selectedAlbumPath) ?? null,
    [albums, selectedAlbumPath],
  );

  const lanQrUrl = useMemo(() => {
    if (!lanUploadState.url) {
      return null;
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(lanUploadState.url)}`;
  }, [lanUploadState.url]);

  useEffect(() => {
    const storedRootFolder = localStorage.getItem(ROOT_FOLDER_STORAGE_KEY);
    if (storedRootFolder) {
      setRootFolder(storedRootFolder);
    }
    setHasLoadedRootFolder(true);

    void window.api.getLanUploadState().then(setLanUploadState).catch((error) => {
      console.error(error);
    });
  }, []);

  useEffect(() => {
    if (!hasLoadedRootFolder || rootFolder || hasPromptedForRootFolderRef.current) {
      return;
    }

    hasPromptedForRootFolderRef.current = true;

    void (async () => {
      const folder = await window.api.chooseRootFolder();
      if (!folder) {
        setNotice('请先选择相册根目录。');
        return;
      }

      localStorage.setItem(ROOT_FOLDER_STORAGE_KEY, folder);
      setRootFolder(folder);
      setDraftLocation(null);
      setSelectedAlbumPath(null);
      setStagedImages([]);
      setReloadTick((value) => value + 1);
      setNotice('根目录已设置。');
    })();
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
    const folder = await window.api.chooseRootFolder();
    if (!folder) {
      return;
    }

    localStorage.setItem(ROOT_FOLDER_STORAGE_KEY, folder);
    setRootFolder(folder);
    setDraftLocation(null);
    setSelectedAlbumPath(null);
    setStagedImages([]);
    setReloadTick((value) => value + 1);
    setNotice('根目录已更新。');
  }

  async function chooseImages() {
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
      setNotice('请先选择根目录。');
      return;
    }

    setSelectedAlbumPath(null);
    setDraftLocation(location);
  }

  function handleSelectAlbum(relativePath: string) {
    setDraftLocation(null);
    setSelectedAlbumPath(relativePath);
  }

  function removeStagedImage(imagePath: string) {
    setStagedImages((current) => current.filter((item) => item !== imagePath));
  }

  return (
    <div className="app-shell">
      <div className="left-toolbar">
        <button className="toolbar-button" onClick={() => { setIsSidebarOpen((value) => !value); setIsLanPanelOpen(false); }} title="切换侧边栏">
          <Menu size={20} />
        </button>
        <button className="toolbar-button" onClick={() => { setIsLanPanelOpen((value) => !value); setIsSidebarOpen(false); }} title="手机上传">
          <Smartphone size={20} />
        </button>
        <button className="toolbar-button" onClick={chooseRootFolder} title="选择相册根目录">
          <Settings size={20} />
        </button>
      </div>

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        albums={albums}
        isLoading={isAlbumsLoading}
        rootFolder={rootFolder}
        selectedAlbumPath={selectedAlbumPath}
        onRefresh={() => {
          if (rootFolder) {
            setReloadTick((value) => value + 1);
          }
        }}
        onSelectAlbum={handleSelectAlbum}
      />

      <LanUploadPanel
        isOpen={isLanPanelOpen}
        lanQrUrl={lanQrUrl}
        lanUploadState={lanUploadState}
        onClose={() => setIsLanPanelOpen(false)}
        onStartLanUpload={startLanUpload}
        onStopLanUpload={stopLanUpload}
      />

      <main className="workspace">
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
      </main>

      <InspectorPanel
        albumImages={albumImages}
        draftLocation={draftLocation}
        isAlbumImagesLoading={isAlbumImagesLoading}
        isSaving={isSaving}
        selectedAlbum={selectedAlbum}
        stagedImages={stagedImages}
        onAddImagesToAlbum={addImagesToAlbum}
        onChooseImages={chooseImages}
        onCloseDraft={() => setDraftLocation(null)}
        onCloseSelectedAlbum={() => setSelectedAlbumPath(null)}
        onCreateAlbum={createAlbum}
        onRemoveStagedImage={removeStagedImage}
        onSetCover={setAlbumCover}
        onSetNote={setAlbumNote}
      />

      {notice && <div className="notice-bar">{notice}</div>}
    </div>
  );
}
