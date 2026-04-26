import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Grid3X3,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MoreHorizontal,
  Search,
  Share2,
  X,
} from 'lucide-react';
import type { AlbumSummary, ImageMetadata } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';
import {
  formatAlbumDisplayName,
  formatAlbumRelativePathForDisplay,
  formatAlbumSegmentsForDisplay,
} from '../shared/location';

interface TravelArchiveProps {
  albums: AlbumSummary[];
  isLoading: boolean;
  rootFolder: string | null;
  onChooseRootFolder: () => Promise<void>;
  onOpenImages: (images: ImageMetadata[], index: number) => void;
}

function formatArchiveMonth(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知'
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
      }).format(date).replace('/', '.');
}

function formatArchiveDay(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知日期'
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
}

function formatAlbumLocation(album: AlbumSummary) {
  const parts = [album.province, album.city, album.district, album.township].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? formatAlbumSegmentsForDisplay(parts) : formatAlbumDisplayName(album);
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

export function TravelArchive({
  albums,
  isLoading,
  rootFolder,
  onChooseRootFolder,
  onOpenImages,
}: TravelArchiveProps) {
  const [query, setQuery] = useState('');
  const [selectedAlbumPath, setSelectedAlbumPath] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<ImageMetadata[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [photoLayout, setPhotoLayout] = useState<'grid' | 'list'>('grid');
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredAlbums = useMemo(() => {
    if (!normalizedQuery) {
      return albums;
    }

    return albums.filter((album) => {
      const haystack = [
        formatAlbumDisplayName(album),
        formatAlbumRelativePathForDisplay(album.relativePath),
        album.province,
        album.city,
        album.district,
        album.township,
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [albums, normalizedQuery]);

  const selectedAlbum = useMemo(
    () => albums.find((album) => album.relativePath === selectedAlbumPath) ?? null,
    [albums, selectedAlbumPath],
  );

  const previewImages = useMemo<ImageMetadata[]>(() => {
    if (!selectedAlbum) {
      return [];
    }

    const paths = [selectedAlbum.coverPath, ...selectedAlbum.previewPaths].filter((path): path is string => Boolean(path));
    const fallbackTime = Date.parse(selectedAlbum.updatedAt) || 0;
    return Array.from(new Set(paths)).map((path) => ({ path, mtimeMs: fallbackTime }));
  }, [selectedAlbum]);

  const detailImages = selectedImages.length > 0 ? selectedImages : previewImages;
  const boundedHeroIndex = detailImages.length > 0 ? Math.min(heroIndex, detailImages.length - 1) : 0;
  const heroPath = detailImages[boundedHeroIndex]?.path ?? null;

  useEffect(() => {
    if (!rootFolder || !selectedAlbumPath) {
      return;
    }

    let cancelled = false;
    const currentRootFolder = rootFolder;
    const currentAlbumPath = selectedAlbumPath;

    async function loadSelectedAlbumImages() {
      setIsDetailLoading(true);
      setDetailError(null);
      setSelectedImages([]);

      try {
        const images = await window.api.getAlbumImages(currentRootFolder, currentAlbumPath);
        if (!cancelled) {
          setSelectedImages(images);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setSelectedImages([]);
          setDetailError('加载照片失败，请稍后重试。');
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    }

    void loadSelectedAlbumImages();

    return () => {
      cancelled = true;
    };
  }, [rootFolder, selectedAlbumPath]);

  function openAlbum(album: AlbumSummary) {
    setSelectedAlbumPath(album.relativePath);
    setSelectedImages([]);
    setDetailError(null);
    setIsDetailLoading(Boolean(rootFolder));
    setHeroIndex(0);
    setIsMoreOpen(false);
  }

  function closeDetail() {
    setSelectedAlbumPath(null);
    setSelectedImages([]);
    setDetailError(null);
    setIsDetailLoading(false);
    setHeroIndex(0);
    setIsMoreOpen(false);
  }

  function showPreviousHero() {
    if (detailImages.length < 2) {
      return;
    }
    setHeroIndex((current) => (current - 1 + detailImages.length) % detailImages.length);
  }

  function showNextHero() {
    if (detailImages.length < 2) {
      return;
    }
    setHeroIndex((current) => (current + 1) % detailImages.length);
  }

  async function shareAlbum() {
    if (!selectedAlbum) {
      return;
    }

    const text = `${formatAlbumDisplayName(selectedAlbum)}\n${formatAlbumLocation(selectedAlbum)}\n${formatAlbumRelativePathForDisplay(selectedAlbum.relativePath)}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: formatAlbumDisplayName(selectedAlbum), text });
        return;
      }
      await navigator.clipboard?.writeText(text);
    } catch (error) {
      console.error(error);
    }
  }

  function downloadHero() {
    if (!heroPath) {
      return;
    }

    const link = document.createElement('a');
    link.href = toLocalMediaUrl(heroPath);
    link.download = getFileName(heroPath);
    document.body.append(link);
    link.click();
    link.remove();
  }

  return (
    <section className="archive-page" aria-label="旅行档案">
      <div className={`archive-list-panel${selectedAlbum ? ' archive-list-panel--dimmed' : ''}`}>
        <header className="archive-page__header">
          <div>
            <h2>归档纪实</h2>
            <p>浏览您的全球足迹，高精地图像重现旅途瞬间，探索所有已记录的坐标与数字资产。</p>
          </div>

          <label className="archive-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索目的地、年份或标签..."
            />
          </label>
        </header>

        <div className="archive-list-toolbar">
          <button type="button">全部</button>
          <span>
            <Grid3X3 size={16} />
          </span>
        </div>

        <div className="archive-grid">
          {!rootFolder && (
            <div className="archive-empty">
              <Archive size={34} />
              <h3>还没有选择相册根目录</h3>
              <p>先选择一个本地目录，ChronosMap 会基于地点生成旅行档案。</p>
              <button className="button button--primary" onClick={() => void onChooseRootFolder()} type="button">
                选择根目录
              </button>
            </div>
          )}

          {rootFolder && isLoading && (
            <div className="archive-empty">
              <Loader2 className="spin-icon" size={34} />
              <h3>正在整理归档</h3>
              <p>照片坐标和封面正在加载。</p>
            </div>
          )}

          {rootFolder && !isLoading && filteredAlbums.length === 0 && (
            <div className="archive-empty">
              <Archive size={34} />
              <h3>没有匹配的旅行档案</h3>
              <p>换一个关键词，或回到地图探索页创建新的地点相册。</p>
            </div>
          )}

          {rootFolder && !isLoading && filteredAlbums.map((album) => {
            const coverPath = album.coverPath ?? album.previewPaths[0] ?? null;
            const isSelected = selectedAlbumPath === album.relativePath;

            return (
              <button
                className={`archive-card${isSelected ? ' archive-card--expanded' : ''}`}
                key={album.relativePath}
                onClick={() => openAlbum(album)}
                type="button"
                title={`${formatAlbumDisplayName(album)}\n${formatAlbumRelativePathForDisplay(album.relativePath)}`}
              >
                <div className="archive-card__media">
                  {coverPath ? (
                    <img src={toLocalMediaUrl(coverPath)} alt={album.displayName} loading="lazy" decoding="async" draggable={false} />
                  ) : (
                    <div className="archive-card__fallback">
                      <Archive size={30} />
                    </div>
                  )}
                </div>
                <div className="archive-card__shade" />
                <div className="archive-card__content">
                  <h3>{formatAlbumDisplayName(album)}</h3>
                  <div className="archive-card__meta">
                    <span>
                      <Archive size={13} />
                      {album.imageCount} 资产
                    </span>
                    <span>{formatArchiveMonth(album.updatedAt)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {rootFolder && !isLoading && filteredAlbums.length > 0 && (
          <p className="archive-list-panel__count">共 {filteredAlbums.length} 个地点</p>
        )}
      </div>

      <section
        className={`archive-detail-panel${selectedAlbum ? ' archive-detail-panel--active active' : ''}`}
        aria-hidden={!selectedAlbum}
        aria-label={selectedAlbum ? `${formatAlbumDisplayName(selectedAlbum)} 详情` : '旅行档案详情'}
      >
        {selectedAlbum && (
          <>
            <button className="archive-detail-close close-btn" onClick={closeDetail} type="button" title="关闭详情">
              <X size={22} />
            </button>

            <div className="archive-detail-actions">
              <button className="archive-action-btn" onClick={() => void shareAlbum()} type="button" title="分享归档">
                <Share2 size={16} />
                <span>分享</span>
              </button>
              <button className="archive-action-btn" disabled={!heroPath} onClick={downloadHero} type="button" title="下载当前大图">
                <Download size={16} />
                <span>下载</span>
              </button>
              <button
                className="archive-action-btn archive-action-btn--round"
                onClick={() => setIsMoreOpen((current) => !current)}
                type="button"
                title="更多信息"
              >
                <MoreHorizontal size={18} />
              </button>
              {isMoreOpen && (
                <div className="archive-detail-more" role="status">
                  <strong>归档路径</strong>
                  <span>{formatAlbumRelativePathForDisplay(selectedAlbum.relativePath)}</span>
                  <strong>创建时间</strong>
                  <span>{formatArchiveDay(selectedAlbum.createdAt)}</span>
                </div>
              )}
            </div>

            <div className="archive-detail-scroll">
              <div className="archive-detail-hero">
                {heroPath ? (
                  <button
                    className="archive-detail-hero__image"
                    onClick={() => onOpenImages(detailImages, boundedHeroIndex)}
                    type="button"
                    title="查看大图"
                  >
                    <img src={toLocalMediaUrl(heroPath)} alt={selectedAlbum.displayName} draggable={false} />
                  </button>
                ) : (
                  <div className="archive-detail-hero__fallback">
                    <ImageIcon size={42} />
                    <span>暂无封面图像</span>
                  </div>
                )}

                {detailImages.length > 1 && (
                  <>
                    <button className="archive-detail-hero__nav archive-detail-hero__nav--prev" onClick={showPreviousHero} type="button" title="上一张">
                      <ChevronLeft size={28} />
                    </button>
                    <button className="archive-detail-hero__nav archive-detail-hero__nav--next" onClick={showNextHero} type="button" title="下一张">
                      <ChevronRight size={28} />
                    </button>
                    <span className="archive-detail-hero__index">
                      {boundedHeroIndex + 1} / {detailImages.length}
                    </span>
                  </>
                )}
              </div>

              <article className="archive-detail-info">
                <div className="archive-detail-info__cover">
                  {heroPath ? (
                    <img src={toLocalMediaUrl(heroPath)} alt="" loading="lazy" decoding="async" draggable={false} />
                  ) : (
                    <ImageIcon size={28} />
                  )}
                </div>
                <div className="archive-detail-info__main">
                  <h3>{formatAlbumDisplayName(selectedAlbum)}</h3>
                  <p>{formatAlbumLocation(selectedAlbum)}</p>
                  <div className="archive-detail-info__meta">
                    <span>
                      <Calendar size={14} />
                      {formatArchiveDay(selectedAlbum.updatedAt)}
                    </span>
                    <span>
                      <MapPin size={14} />
                      中国 · {selectedAlbum.province || '未知位置'}
                    </span>
                  </div>
                  <p className="archive-detail-info__note">
                    {selectedAlbum.note?.trim() || '这里有历史的厚重，也有烟火的温度。'}
                  </p>
                </div>
                <strong className="archive-detail-info__badge">{selectedAlbum.imageCount} 资产</strong>
              </article>

              <section className="archive-detail-section" aria-label="全部照片">
                <div className="archive-detail-section__header">
                  <h3>全部照片 ({selectedImages.length || selectedAlbum.imageCount})</h3>
                  <div className="archive-view-toggle" aria-label="照片布局">
                    <button
                      className={photoLayout === 'grid' ? 'archive-view-toggle__button archive-view-toggle__button--active' : 'archive-view-toggle__button'}
                      onClick={() => setPhotoLayout('grid')}
                      type="button"
                      title="网格视图"
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      className={photoLayout === 'list' ? 'archive-view-toggle__button archive-view-toggle__button--active' : 'archive-view-toggle__button'}
                      onClick={() => setPhotoLayout('list')}
                      type="button"
                      title="列表视图"
                    >
                      <List size={16} />
                    </button>
                  </div>
                </div>

                {isDetailLoading && (
                  <div className="archive-album-panel__state">
                    <Loader2 className="spin-icon" size={18} />
                    <span>正在加载照片...</span>
                  </div>
                )}

                {!isDetailLoading && detailError && (
                  <div className="archive-album-panel__state">
                    <ImageIcon size={18} />
                    <span>{detailError}</span>
                  </div>
                )}

                {!isDetailLoading && !detailError && detailImages.length === 0 && (
                  <div className="archive-album-panel__state">
                    <ImageIcon size={18} />
                    <span>这个归档里还没有照片。</span>
                  </div>
                )}

                {!isDetailLoading && !detailError && detailImages.length > 0 && (
                  <div className={`archive-detail-photo-grid archive-detail-photo-grid--${photoLayout}`}>
                    {detailImages.map((image, index) => (
                      <button
                        className={index === boundedHeroIndex ? 'archive-detail-photo archive-detail-photo--active' : 'archive-detail-photo'}
                        key={image.path}
                        onClick={() => {
                          setHeroIndex(index);
                          onOpenImages(detailImages, index);
                        }}
                        type="button"
                        title={getFileName(image.path)}
                      >
                        <img src={toLocalMediaUrl(image.path)} alt={selectedAlbum.displayName} loading="lazy" decoding="async" draggable={false} />
                        {photoLayout === 'list' && (
                          <span>
                            <strong>{getFileName(image.path)}</strong>
                            <small>{formatArchiveDay(image.mtimeMs || selectedAlbum.updatedAt)}</small>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </section>

            </div>
          </>
        )}
      </section>
    </section>
  );
}
