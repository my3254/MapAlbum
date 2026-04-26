import { memo, useDeferredValue, useEffect, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import {
  Clock3,
  ChevronRight,
  CloudUpload,
  Compass,
  Image as ImageIcon,
  Images,
  Loader2,
  MapPin,
  Navigation,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AlbumSummary, LocationDraft } from '../shared/contracts';
import { AMAP_WEB_KEY, ensureAmapSecurityConfig } from '../shared/amap-config';
import {
  buildAlbumSegments,
  createLocationDraft,
  formatAlbumDisplayName,
  formatAlbumRelativePathForDisplay,
  formatAlbumSegmentsForDisplay,
} from '../shared/location';
import { toLocalMediaUrl } from '../shared/media';

const RECENT_MENU_PLACE_SEARCH_STORAGE_KEY = 'chronos-map.menu-recent-place-searches';
const RECENT_MENU_PLACE_SEARCH_LIMIT = 6;

interface PlaceSearchItem {
  id: string;
  title: string;
  address: string;
  province: string;
  city: string;
  district: string;
  township: string;
  lng: number;
  lat: number;
}

interface RecentPlaceSearchItem extends PlaceSearchItem {
  searchedAt: number;
}

interface SidebarProps {
  albums: AlbumSummary[];
  deletingAlbumPath: string | null;
  isLoading: boolean;
  rootFolder: string | null;
  selectedAlbumPath: string | null;
  isOpen: boolean;
  isLanUploadOpen: boolean;
  viewMode: 'map' | 'archive' | 'timeline';
  onChooseImages: () => Promise<void>;
  onDeleteAlbum: (relativePath: string) => Promise<void>;
  onPickSearchedLocation: (location: LocationDraft) => void;
  onOpenLanUpload: () => void;
  onRefresh: () => void;
  onSearchError: (message: string) => void;
  onSelectAlbum: (relativePath: string) => void;
  onShowArchive: () => void;
  onShowMap: () => void;
  onShowTimeline: () => void;
  onClose: () => void;
}

function readRecentPlaceSearches(): RecentPlaceSearchItem[] {
  try {
    const rawValue = localStorage.getItem(RECENT_MENU_PLACE_SEARCH_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter((item): item is RecentPlaceSearchItem => (
        typeof item?.id === 'string'
        && typeof item.title === 'string'
        && typeof item.address === 'string'
        && typeof item.province === 'string'
        && typeof item.city === 'string'
        && typeof item.district === 'string'
        && typeof item.township === 'string'
        && typeof item.lng === 'number'
        && typeof item.lat === 'number'
        && typeof item.searchedAt === 'number'
      ))
      .slice(0, RECENT_MENU_PLACE_SEARCH_LIMIT);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function persistRecentPlaceSearches(items: RecentPlaceSearchItem[]) {
  try {
    localStorage.setItem(RECENT_MENU_PLACE_SEARCH_STORAGE_KEY, JSON.stringify(items.slice(0, RECENT_MENU_PLACE_SEARCH_LIMIT)));
  } catch (error) {
    console.error(error);
  }
}

function getPoiText(value: unknown) {
  if (Array.isArray(value)) {
    return String(value[0] ?? '');
  }
  return typeof value === 'string' ? value : '';
}

function createLocationFromPlace(place: PlaceSearchItem) {
  return createLocationDraft({
    province: place.province,
    city: place.city || place.province,
    district: place.district,
    township: place.township || place.title,
    lng: place.lng,
    lat: place.lat,
  });
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '未知时间'
    : new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

function getArchiveRowText(album: AlbumSummary) {
  const segments = buildAlbumSegments(album);
  const displayName = formatAlbumDisplayName(album);
  const cityLine = formatAlbumSegmentsForDisplay(segments.slice(0, Math.min(2, segments.length))) || displayName;
  const placeLine = formatAlbumSegmentsForDisplay(segments.slice(2)) || segments.at(-1) || displayName;

  return { cityLine, placeLine };
}

function SidebarInner({
  albums,
  deletingAlbumPath,
  isLoading,
  rootFolder,
  selectedAlbumPath,
  isOpen,
  isLanUploadOpen,
  viewMode,
  onChooseImages,
  onDeleteAlbum,
  onPickSearchedLocation,
  onOpenLanUpload,
  onRefresh,
  onSearchError,
  onSelectAlbum,
  onShowArchive,
  onShowMap,
  onShowTimeline,
  onClose,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceSearchItem[]>([]);
  const [recentPlaceSearches, setRecentPlaceSearches] = useState<RecentPlaceSearchItem[]>(() => readRecentPlaceSearches());
  const [isPlaceSearchFocused, setIsPlaceSearchFocused] = useState(false);
  const [isPlaceSearching, setIsPlaceSearching] = useState(false);
  const [armedDeletePath, setArmedDeletePath] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const placeSearchRef = useRef<any>(null);
  const placeSearchTokenRef = useRef(0);

  useEffect(() => {
    if (!armedDeletePath) {
      return;
    }

    const timer = window.setTimeout(() => setArmedDeletePath(null), 2400);
    return () => window.clearTimeout(timer);
  }, [armedDeletePath]);

  useEffect(() => {
    let disposed = false;

    async function bootstrapPlaceSearch() {
      try {
        ensureAmapSecurityConfig();
        const AMap = await AMapLoader.load({
          key: AMAP_WEB_KEY,
          version: '2.0',
          plugins: ['AMap.Geocoder', 'AMap.PlaceSearch'],
        });

        if (disposed) {
          return;
        }

        placeSearchRef.current = new AMap.PlaceSearch({
          pageSize: 6,
          pageIndex: 1,
          extensions: 'base',
        });
      } catch (error) {
        console.error(error);
        if (!disposed) {
          onSearchError('地点搜索服务加载失败，请检查网络或高德 Key 配置。');
        }
      }
    }

    void bootstrapPlaceSearch();
    return () => {
      disposed = true;
      placeSearchRef.current = null;
    };
  }, [onSearchError]);

  const filteredAlbums = deferredQuery
    ? albums.filter((album) => formatAlbumDisplayName(album).toLowerCase().includes(deferredQuery))
    : albums;

  const shouldShowPlaceSearchBody = isPlaceSearchFocused || isPlaceSearching || placeResults.length > 0;
  const shouldShowRecentPlaceSearches = recentPlaceSearches.length > 0 && placeResults.length === 0;

  function pushRecentPlaceSearch(place: PlaceSearchItem) {
    setRecentPlaceSearches((current) => {
      const nextSearches = [
        { ...place, searchedAt: Date.now() },
        ...current.filter((item) => item.id !== place.id && !(item.title === place.title && item.address === place.address)),
      ].slice(0, RECENT_MENU_PLACE_SEARCH_LIMIT);

      persistRecentPlaceSearches(nextSearches);
      return nextSearches;
    });
  }

  function clearRecentPlaceSearches() {
    setRecentPlaceSearches([]);
    persistRecentPlaceSearches([]);
  }

  function pickPlaceSearchResult(place: PlaceSearchItem) {
    pushRecentPlaceSearch(place);
    setPlaceQuery(place.title);
    setPlaceResults([]);
    setIsPlaceSearchFocused(false);
    onPickSearchedLocation(createLocationFromPlace(place));
  }

  function runPlaceSearch() {
    const keyword = placeQuery.trim();
    if (!keyword) {
      setPlaceResults([]);
      return;
    }

    if (!placeSearchRef.current) {
      onSearchError('地点搜索服务尚未就绪，请稍后重试。');
      return;
    }

    setIsPlaceSearching(true);
    const token = placeSearchTokenRef.current + 1;
    placeSearchTokenRef.current = token;

    placeSearchRef.current.search(keyword, (status: string, result: any) => {
      if (placeSearchTokenRef.current !== token) {
        return;
      }

      setIsPlaceSearching(false);

      if (status !== 'complete') {
        const detail =
          typeof result === 'string'
            ? result
            : result?.info || result?.message || '未知错误';
        setPlaceResults([]);
        onSearchError(`地点搜索失败：${detail}`);
        return;
      }

      const pois = Array.isArray(result?.poiList?.pois) ? result.poiList.pois : [];
      const nextResults = pois
        .map((poi: any, index: number) => {
          const lng = typeof poi.location?.lng === 'number' ? poi.location.lng : null;
          const lat = typeof poi.location?.lat === 'number' ? poi.location.lat : null;
          if (lng === null || lat === null) {
            return null;
          }

          return {
            id: poi.id || `${poi.name || 'poi'}-${index}`,
            title: poi.name || '未命名地点',
            address: poi.address || poi.pname || poi.cityname || poi.adname || '无详细地址',
            province: getPoiText(poi.pname),
            city: getPoiText(poi.cityname),
            district: getPoiText(poi.adname),
            township: getPoiText(poi.address) || poi.name || '',
            lng,
            lat,
          } satisfies PlaceSearchItem;
        })
        .filter((item: PlaceSearchItem | null): item is PlaceSearchItem => Boolean(item))
        .slice(0, 6);

      setPlaceResults(nextResults);
      if (nextResults.length === 0) {
        onSearchError(`没有找到与“${keyword}”相关的地点。`);
      }
    });
  }

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__profile">
        <div className="sidebar__avatar">CM</div>
        <div>
          <h1>传奇旅行者</h1>
          <p>精英探索者</p>
        </div>
        <button className="icon-button sidebar__close" onClick={onClose} title="收起面板">
          <X size={18} />
        </button>
      </div>

      <nav className="sidebar-nav" aria-label="主导航">
        <button
          className={`sidebar-nav__item${viewMode === 'map' && !isLanUploadOpen ? ' sidebar-nav__item--active' : ''}`}
          onClick={onShowMap}
          type="button"
        >
          <Compass size={20} />
          <span>地图探索</span>
        </button>
        <button
          className={`sidebar-nav__item${viewMode === 'archive' ? ' sidebar-nav__item--active' : ''}`}
          onClick={onShowArchive}
          type="button"
        >
          <Images size={20} />
          <span>旅行档案</span>
        </button>
        <button
          className={`sidebar-nav__item${viewMode === 'timeline' ? ' sidebar-nav__item--active' : ''}`}
          onClick={onShowTimeline}
          type="button"
        >
          <Clock3 size={20} />
          <span>照片时间线</span>
        </button>
        <button
          className={`sidebar-nav__item${isLanUploadOpen ? ' sidebar-nav__item--active' : ''}`}
          onClick={onOpenLanUpload}
          type="button"
        >
          <CloudUpload size={20} />
          <span>云同步</span>
        </button>
      </nav>

      {viewMode === 'map' && (
        <>
          <section className={`sidebar-place-search${shouldShowPlaceSearchBody ? ' sidebar-place-search--open' : ''}`}>
            <div className="sidebar-place-search__header">
              <div>
                <span>地图探索</span>
                <strong>搜索新地点</strong>
              </div>
              <Sparkles size={18} />
            </div>

            <label className="sidebar-place-search__bar">
              <Search size={16} />
              <input
                value={placeQuery}
                placeholder="搜索景点、商圈或地址"
                onFocus={() => setIsPlaceSearchFocused(true)}
                onChange={(event) => {
                  setPlaceQuery(event.target.value);
                  if (placeResults.length > 0) {
                    setPlaceResults([]);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    runPlaceSearch();
                  }
                  if (event.key === 'Escape') {
                    setIsPlaceSearchFocused(false);
                    setPlaceResults([]);
                  }
                }}
              />
              {placeQuery && (
                <button
                  className="sidebar-place-search__clear"
                  type="button"
                  onClick={() => {
                    setPlaceQuery('');
                    setPlaceResults([]);
                  }}
                  title="清空搜索"
                >
                  <X size={14} />
                </button>
              )}
              <button className="sidebar-place-search__submit" type="button" onClick={runPlaceSearch}>
                {isPlaceSearching ? <Loader2 className="spin-icon" size={15} /> : <Navigation size={15} />}
              </button>
            </label>

            {shouldShowPlaceSearchBody && (
              <div className="sidebar-place-search__body">
                <div className="sidebar-place-search__meta">
                  <span>{placeResults.length > 0 ? '搜索结果' : '最近搜索'}</span>
                  {shouldShowRecentPlaceSearches && (
                    <button type="button" onClick={clearRecentPlaceSearches}>
                      清空
                    </button>
                  )}
                </div>

                {isPlaceSearching && (
                  <div className="sidebar-place-search__empty">
                    <Loader2 className="spin-icon" size={16} />
                    <span>正在搜索地点...</span>
                  </div>
                )}

                {!isPlaceSearching && placeResults.length > 0 && (
                  <div className="sidebar-place-search__list">
                    {placeResults.map((place) => (
                      <button
                        className="sidebar-place-result"
                        key={place.id}
                        type="button"
                        onClick={() => pickPlaceSearchResult(place)}
                      >
                        <span className="sidebar-place-result__icon">
                          <MapPin size={15} />
                        </span>
                        <span className="sidebar-place-result__content">
                          <strong>{place.title}</strong>
                          <small>{place.address}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!isPlaceSearching && placeResults.length === 0 && recentPlaceSearches.length > 0 && (
                  <div className="sidebar-place-search__list">
                    {recentPlaceSearches.map((place) => (
                      <button
                        className="sidebar-place-result sidebar-place-result--recent"
                        key={`${place.id}-${place.searchedAt}`}
                        type="button"
                        onClick={() => pickPlaceSearchResult(place)}
                      >
                        <span className="sidebar-place-result__icon">
                          <Clock3 size={15} />
                        </span>
                        <span className="sidebar-place-result__content">
                          <strong>{place.title}</strong>
                          <small>{place.address}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {!isPlaceSearching && placeResults.length === 0 && recentPlaceSearches.length === 0 && (
                  <div className="sidebar-place-search__empty">
                    <MapPin size={16} />
                    <span>输入地点后按 Enter，选择结果即可在地图上生成归档点。</span>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="sidebar__section sidebar__albums">
            <div className="sidebar__section-title">
              <div className="sidebar__section-heading">
                <h2>已归档地点</h2>
                <span className="sidebar__section-count">{filteredAlbums.length}</span>
              </div>
              <div className="sidebar__section-actions">
                <button className="icon-button icon-button--small" onClick={onRefresh} title="刷新相册">
                  <RefreshCcw size={14} />
                </button>
              </div>
            </div>

            <label className="search-input">
              <Search size={16} />
              <input
                placeholder="搜索地点、城市或照片"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="album-list">
              {!rootFolder && (
                <div className="placeholder-block">
                  <p>先选择本地根目录，再开始记录地图相册。</p>
                </div>
              )}

              {rootFolder && !isLoading && filteredAlbums.length === 0 && (
                <div className="placeholder-block">
                  <p>当前目录还没有地点相册。可以先在地图上选点，或者通过手机上传原图开始归档。</p>
                </div>
              )}

              {filteredAlbums.map((album) => {
                const isActive = selectedAlbumPath === album.relativePath;
                const isDeleteArmed = armedDeletePath === album.relativePath;
                const isDeleting = deletingAlbumPath === album.relativePath;
                const { cityLine, placeLine } = getArchiveRowText(album);
                const displayPath = formatAlbumRelativePathForDisplay(album.relativePath);

                return (
                  <div
                    key={album.relativePath}
                    className={`album-row-shell${isDeleteArmed ? ' album-row-shell--delete-armed' : ''}`}
                  >
                    <button
                      className={`album-row${isActive ? ' album-row--active' : ''}`}
                      onClick={() => onSelectAlbum(album.relativePath)}
                      title={`${formatAlbumDisplayName(album)}\n\n路径：${displayPath}\n照片数：${album.imageCount} 张\n最后更新：${formatUpdatedAt(album.updatedAt)}${album.note ? `\n\n留言：${album.note}` : ''}`}
                    >
                      <div className="album-row__cover">
                        {album.coverPath ? (
                          <img src={toLocalMediaUrl(album.coverPath)} alt={album.displayName} loading="lazy" decoding="async" draggable={false} />
                        ) : (
                          <div className="album-row__cover-fallback">
                            <ImageIcon size={16} />
                          </div>
                        )}
                      </div>
                      <div className="album-row__content">
                        <strong className="album-row__city">{cityLine}</strong>
                        <span className="album-row__place">{placeLine}</span>
                        <span className="album-row__details">
                          <ImageIcon size={12} />
                          {album.imageCount} 张照片
                          <i aria-hidden="true">·</i>
                          {formatUpdatedAt(album.updatedAt)}
                        </span>
                      </div>
                      <div className="album-row__meta" aria-label={`${album.imageCount} 张照片`}>
                        <strong>{album.imageCount}</strong>
                        <ChevronRight size={20} />
                      </div>
                    </button>
                    <button
                      className={`album-row__delete${isDeleteArmed ? ' album-row__delete--armed' : ''}`}
                      title={isDeleteArmed ? '再次点击删除地点' : '删除地点'}
                      disabled={isDeleting}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isDeleteArmed) {
                          setArmedDeletePath(null);
                          void onDeleteAlbum(album.relativePath);
                          return;
                        }
                        setArmedDeletePath(album.relativePath);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                    {isDeleteArmed && (
                      <div className="album-row__delete-tip">
                        {isDeleting ? '删除中...' : '再次点击删除地点'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <button className="sidebar__upload" onClick={() => void onChooseImages()} type="button">
        <Upload size={18} />
        <span>上传媒体</span>
      </button>
    </aside>
  );
}

export const Sidebar = memo(SidebarInner);
