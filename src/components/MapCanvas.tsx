import { memo, useEffect, useMemo, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { Clock3, Loader2, MapPin, Navigation, Search, Sparkles, X } from 'lucide-react';
import type { AlbumSummary, LocationDraft } from '../shared/contracts';
import { AMAP_WEB_KEY, ensureAmapSecurityConfig } from '../shared/amap-config';
import { toLocalMediaUrl } from '../shared/media';
import {
  buildAlbumSegments,
  createLocationDraft,
  formatAlbumDisplayName,
  formatAlbumSegmentsForDisplay,
} from '../shared/location';

const MARKER_PADDING = [120, 440, 120, 420] as const;
const RECENT_MAP_SEARCH_STORAGE_KEY = 'chronos-map.recent-map-searches';
const RECENT_MAP_SEARCH_LIMIT = 6;

type GeoLevel = 'province' | 'city' | 'district' | 'album';

interface AggregateNode {
  key: string;
  level: GeoLevel;
  title: string;
  subtitle: string;
  notePreview: string;
  lng: number;
  lat: number;
  imageCount: number;
  albumCount: number;
  coverPaths: string[];
  albums: AlbumSummary[];
}

interface MarkerEntry {
  marker: any;
  element: HTMLButtonElement;
  albumPath: string | null;
  isAggregate: boolean;
}

interface SearchResultItem {
  id: string;
  title: string;
  address: string;
  lng: number;
  lat: number;
}

interface RecentSearchItem extends SearchResultItem {
  searchedAt: number;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getVisibleLevel(zoom: number): GeoLevel {
  if (zoom <= 5.8) return 'province';
  if (zoom <= 8.6) return 'city';
  if (zoom <= 11.8) return 'district';
  return 'album';
}

function getNextLevel(level: GeoLevel): GeoLevel {
  if (level === 'province') return 'city';
  if (level === 'city') return 'district';
  return 'album';
}

function getTargetZoom(level: GeoLevel) {
  if (level === 'province') return 8.2;
  if (level === 'city') return 10.2;
  if (level === 'district') return 12.8;
  return 14.5;
}

function getCityText(city: string | string[] | undefined, province: string) {
  if (Array.isArray(city)) {
    return city[0] ?? province;
  }
  return city || province;
}

function createCoordinateDraft(lng: number, lat: number) {
  return createLocationDraft({
    province: '',
    city: '',
    district: '',
    township: '',
    lng,
    lat,
  });
}

function readRecentMapSearches(): RecentSearchItem[] {
  try {
    const rawValue = localStorage.getItem(RECENT_MAP_SEARCH_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .filter((item): item is RecentSearchItem => (
        typeof item?.id === 'string'
        && typeof item.title === 'string'
        && typeof item.address === 'string'
        && typeof item.lng === 'number'
        && typeof item.lat === 'number'
        && typeof item.searchedAt === 'number'
      ))
      .slice(0, RECENT_MAP_SEARCH_LIMIT);
  } catch (error) {
    console.error(error);
    return [];
  }
}

function persistRecentMapSearches(items: RecentSearchItem[]) {
  try {
    localStorage.setItem(RECENT_MAP_SEARCH_STORAGE_KEY, JSON.stringify(items.slice(0, RECENT_MAP_SEARCH_LIMIT)));
  } catch (error) {
    console.error(error);
  }
}

function getLevelSegments(album: AlbumSummary, level: GeoLevel) {
  const fullSegments = buildAlbumSegments(album);

  if (level === 'province') return fullSegments.slice(0, 1);
  if (level === 'city') return fullSegments.slice(0, Math.min(2, fullSegments.length));
  if (level === 'district') return fullSegments.slice(0, Math.min(3, fullSegments.length));
  return fullSegments;
}

function buildAggregateNodes(albums: AlbumSummary[], level: GeoLevel): AggregateNode[] {
  if (level === 'album') {
    return albums.map((album) => ({
      key: album.relativePath,
      level,
      title: formatAlbumDisplayName(album),
      subtitle: `${album.imageCount} 张照片`,
      notePreview: (album.note || '').trim(),
      lng: album.lng,
      lat: album.lat,
      imageCount: album.imageCount,
      albumCount: 1,
      coverPaths: album.coverPath ? [album.coverPath] : album.previewPaths.slice(0, 1),
      albums: [album],
    }));
  }

  const groups = new Map<string, AlbumSummary[]>();

  albums.forEach((album) => {
    const segments = getLevelSegments(album, level);
    const key = segments.join('||');
    const current = groups.get(key) ?? [];
    current.push(album);
    groups.set(key, current);
  });

  return Array.from(groups.entries()).map(([key, groupedAlbums]) => {
    const lng = groupedAlbums.reduce((sum, album) => sum + album.lng, 0) / groupedAlbums.length;
    const lat = groupedAlbums.reduce((sum, album) => sum + album.lat, 0) / groupedAlbums.length;
    const imageCount = groupedAlbums.reduce((sum, album) => sum + album.imageCount, 0);
    const segments = getLevelSegments(groupedAlbums[0], level);
    const title = segments.at(-1) ?? formatAlbumDisplayName(groupedAlbums[0]);
    const subtitle = `${groupedAlbums.length} 个地点 · ${imageCount} 张照片`;
    const notePreview = groupedAlbums.find((album) => album.note?.trim())?.note?.trim() ?? '';
    const coverPaths = groupedAlbums
      .flatMap((album) => (album.coverPath ? [album.coverPath] : album.previewPaths.slice(0, 1)))
      .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
      .slice(0, 1);

    return {
      key,
      level,
      title,
      subtitle,
      notePreview,
      lng,
      lat,
      imageCount,
      albumCount: groupedAlbums.length,
      coverPaths,
      albums: groupedAlbums,
    };
  });
}

function renderMarkerMedia(coverPaths: string[]) {
  if (coverPaths.length === 0) {
    return '<span class="map-marker__fallback">相册</span>';
  }

  return coverPaths
    .map((coverPath, index) => {
      const className = index === 0 ? '' : ` slide-img-${Math.min(index + 1, 4)}`;
      return `<img${className ? ` class="${className.trim()}"` : ''} src="${toLocalMediaUrl(coverPath)}" alt="" loading="lazy" decoding="async" draggable="false" />`;
    })
    .join('');
}

function getMarkerTitle(node: AggregateNode) {
  if (node.level !== 'album' || node.albums.length === 0) {
    return node.title;
  }

  const segments = buildAlbumSegments(node.albums[0]);
  return segments.at(-1) ?? node.title;
}

function getMarkerLocationLine(node: AggregateNode) {
  if (node.albums.length === 0) {
    return node.subtitle;
  }

  const segments = buildAlbumSegments(node.albums[0]);
  if (node.level === 'album') {
    return formatAlbumSegmentsForDisplay(segments.slice(0, -1)) || node.subtitle;
  }

  const visibleSegments = getLevelSegments(node.albums[0], node.level);
  return formatAlbumSegmentsForDisplay(visibleSegments) || node.subtitle;
}

function renderMarkerStatIcon(type: 'pin' | 'image') {
  if (type === 'pin') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 22s7-6.2 7-13A7 7 0 0 0 5 9c0 6.8 7 13 7 13Z" />
        <circle cx="12" cy="9" r="2.4" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.4" cy="9" r="1.7" />
      <path d="m5 18 5.5-6 4.1 4.3 2.3-2.7L20 18" />
    </svg>
  `;
}

function renderMarkerCaption(node: AggregateNode) {
  const title = escapeHtml(getMarkerTitle(node));
  const locationLine = escapeHtml(getMarkerLocationLine(node));
  const albumCount = node.albumCount;
  const imageCount = node.imageCount;
  const note = node.notePreview.trim();

  return `
    <div class="map-marker__caption">
      <div class="map-marker__caption-menu" aria-hidden="true"><span></span><span></span><span></span></div>
      <strong class="map-marker__title">${title}</strong>
      <span class="map-marker__location">${locationLine}</span>
      <div class="map-marker__divider"></div>
      <div class="map-marker__stats" aria-label="地点和照片数量">
        <span class="map-marker__stat">
          <span class="map-marker__stat-icon">${renderMarkerStatIcon('pin')}</span>
          <strong>${albumCount}</strong>
          <em>个地点</em>
        </span>
        <span class="map-marker__stats-divider"></span>
        <span class="map-marker__stat">
          <span class="map-marker__stat-icon">${renderMarkerStatIcon('image')}</span>
          <strong>${imageCount}</strong>
          <em>张照片</em>
        </span>
      </div>
      ${note ? `
        <div class="map-marker__divider"></div>
        <div class="map-marker__note">
          <span class="map-marker__note-label">留言</span>
          <p>${escapeHtml(note)}</p>
        </div>
      ` : ''}
    </div>
  `;
}

interface MapCanvasProps {
  albums: AlbumSummary[];
  draftLocation: LocationDraft | null;
  selectedAlbumPath: string | null;
  onLocationPicked: (location: LocationDraft) => void;
  onMapError: (message: string) => void;
  onSelectAlbum: (relativePath: string) => void;
}

function MapCanvasInner({
  albums,
  draftLocation,
  selectedAlbumPath,
  onLocationPicked,
  onMapError,
  onSelectAlbum,
}: MapCanvasProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const amapRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<MarkerEntry[]>([]);
  const draftMarkerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const searchTokenRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [visibleLevel, setVisibleLevel] = useState<GeoLevel>('province');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(() => readRecentMapSearches());

  const handlersRef = useRef({ onLocationPicked, onSelectAlbum, onMapError });
  useEffect(() => {
    handlersRef.current = { onLocationPicked, onSelectAlbum, onMapError };
  }, [onLocationPicked, onSelectAlbum, onMapError]);

  const nodes = useMemo(() => buildAggregateNodes(albums, visibleLevel), [albums, visibleLevel]);
  const shouldShowSearchBody = isSearchFocused || isSearching || searchResults.length > 0;
  const shouldShowRecentSearches = recentSearches.length > 0 && searchResults.length === 0;

  function pushRecentSearch(result: SearchResultItem) {
    setRecentSearches((current) => {
      const nextSearches = [
        { ...result, searchedAt: Date.now() },
        ...current.filter((item) => item.id !== result.id && !(item.title === result.title && item.address === result.address)),
      ].slice(0, RECENT_MAP_SEARCH_LIMIT);

      persistRecentMapSearches(nextSearches);
      return nextSearches;
    });
  }

  function clearRecentSearches() {
    setRecentSearches([]);
    persistRecentMapSearches([]);
  }

  function clearSearchKeyword() {
    setSearchKeyword('');
    setSearchResults([]);
  }

  async function resolveLocationDraft(lng: number, lat: number) {
    const geocoder = geocoderRef.current;
    if (!geocoder) {
      return createCoordinateDraft(lng, lat);
    }

    return new Promise<LocationDraft>((resolve) => {
      geocoder.getAddress([lng, lat], (status: string, result: any) => {
        if (status !== 'complete' || !result?.regeocode?.addressComponent) {
          resolve(createCoordinateDraft(lng, lat));
          return;
        }

        const address = result.regeocode.addressComponent;
        const province = address.province || '';

        resolve(
          createLocationDraft({
            province,
            city: getCityText(address.city, province),
            district: address.district || '',
            township: address.township || address.streetNumber?.street || '',
            lng,
            lat,
          }),
        );
      });
    });
  }

  async function handleSearch() {
    const keyword = searchKeyword.trim();
    if (!keyword) {
      setSearchResults([]);
      return;
    }

    if (!placeSearchRef.current) {
      handlersRef.current.onMapError('地点搜索服务尚未就绪，请稍后重试。');
      return;
    }

    setIsSearching(true);
    const token = searchTokenRef.current + 1;
    searchTokenRef.current = token;

    placeSearchRef.current.search(keyword, (status: string, result: any) => {
      if (searchTokenRef.current !== token) {
        return;
      }

      setIsSearching(false);

      if (status !== 'complete') {
        const detail =
          typeof result === 'string'
            ? result
            : result?.info || result?.message || '未知错误';
        setSearchResults([]);
        handlersRef.current.onMapError(`地点搜索失败：${detail}`);
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
            lng,
            lat,
          } satisfies SearchResultItem;
        })
        .filter((item: SearchResultItem | null): item is SearchResultItem => Boolean(item))
        .slice(0, 6);

      setSearchResults(nextResults);
      if (nextResults.length === 0) {
        handlersRef.current.onMapError(`没有找到与“${keyword}”相关的地点。`);
      }
    });
  }

  async function handlePickSearchResult(result: SearchResultItem) {
    pushRecentSearch(result);
    setSearchKeyword(result.title);
    setSearchResults([]);
    setIsSearchFocused(false);
    mapRef.current?.setZoomAndCenter(14.5, [result.lng, result.lat], true);
    handlersRef.current.onLocationPicked(await resolveLocationDraft(result.lng, result.lat));
  }

  useEffect(() => {
    let disposed = false;

    async function bootstrap() {
      try {
        ensureAmapSecurityConfig();

        const AMap = await AMapLoader.load({
          key: AMAP_WEB_KEY,
          version: '2.0',
          plugins: ['AMap.Geocoder', 'AMap.PlaceSearch'],
        });

        if (disposed || !mapElementRef.current) {
          return;
        }

        const map = new AMap.Map(mapElementRef.current, {
          zoom: 4.8,
          center: [104.195397, 35.86166],
          mapStyle: 'amap://styles/darkblue',
          viewMode: '2D',
        });
        setVisibleLevel(getVisibleLevel(map.getZoom()));

        const geocoder = new AMap.Geocoder({
          radius: 1000,
          extensions: 'all',
        });
        geocoderRef.current = geocoder;

        placeSearchRef.current = new AMap.PlaceSearch({
          pageSize: 6,
          pageIndex: 1,
          extensions: 'base',
        });

        map.on('click', (event: any) => {
          geocoder.getAddress(event.lnglat, (status: string, result: any) => {
            if (status !== 'complete' || !result?.regeocode) {
              const detail =
                typeof result === 'string'
                  ? result
                  : result?.info || result?.message || '未知错误';
              handlersRef.current.onMapError(`逆地理编码失败：${detail}`);
              return;
            }

            const address = result.regeocode.addressComponent;
            const province = address.province || '';

            handlersRef.current.onLocationPicked(
              createLocationDraft({
                province,
                city: getCityText(address.city, province),
                district: address.district || '',
                township: address.township || address.streetNumber?.street || '',
                lng: event.lnglat.lng,
                lat: event.lnglat.lat,
              }),
            );
          });
        });

        geocoder.on('error', (error: any) => {
          const detail = error?.info || error?.message || '未知错误';
          handlersRef.current.onMapError(`逆地理编码失败：${detail}`);
        });

        map.on('zoomend', () => {
          const nextLevel = getVisibleLevel(map.getZoom());
          setVisibleLevel((currentLevel) => (currentLevel === nextLevel ? currentLevel : nextLevel));
        });

        amapRef.current = AMap;
        mapRef.current = map;
        setIsReady(true);
      } catch (error) {
        console.error(error);
        handlersRef.current.onMapError('高德地图加载失败，请检查网络或 Key 配置。');
      }
    }

    void bootstrap();

    return () => {
      disposed = true;
      markersRef.current.forEach(({ marker }) => marker.setMap(null));
      markersRef.current = [];
      amapRef.current = null;
      geocoderRef.current = null;
      placeSearchRef.current = null;
      if (draftMarkerRef.current) {
        draftMarkerRef.current.setMap(null);
        draftMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady || !mapRef.current) {
      return;
    }

    markersRef.current.forEach(({ marker }) => marker.setMap(null));
    markersRef.current = [];

    nodes.forEach((node) => {
      const markerNode = document.createElement('button');
      const isAlbumNode = node.level === 'album' && node.albums.length === 1;
      markerNode.className = `map-marker${!isAlbumNode ? ' map-marker--aggregate' : ''}`;
      markerNode.type = 'button';
      markerNode.innerHTML = `
        <div class="map-marker__pin">
          <div class="map-marker__ring">
            ${renderMarkerMedia(node.coverPaths)}
          </div>
          <div class="map-marker__badge">${node.imageCount}</div>
          <div class="map-marker__tail"></div>
        </div>
        ${renderMarkerCaption(node)}
      `;

      const marker = new amapRef.current.Marker({
        position: [node.lng, node.lat],
        content: markerNode,
        offset: new amapRef.current.Pixel(-34, -92),
        title: node.title,
      });

      marker.on('click', () => {
        if (isAlbumNode) {
          handlersRef.current.onSelectAlbum(node.albums[0].relativePath);
          return;
        }

        const nextLevel = getNextLevel(node.level);
        mapRef.current.setZoomAndCenter(getTargetZoom(nextLevel), [node.lng, node.lat], true);
      });

      marker.setMap(mapRef.current);
      markersRef.current.push({
        marker,
        element: markerNode,
        albumPath: isAlbumNode ? node.albums[0].relativePath : null,
        isAggregate: !isAlbumNode,
      });
    });
  }, [isReady, nodes]);

  useEffect(() => {
    markersRef.current.forEach(({ albumPath, element, isAggregate }) => {
      const isActive = Boolean(albumPath) && albumPath === selectedAlbumPath;
      element.className = `map-marker${isActive ? ' map-marker--active' : ''}${isAggregate ? ' map-marker--aggregate' : ''}`;
    });
  }, [selectedAlbumPath]);

  useEffect(() => {
    if (!isReady || !mapRef.current || markersRef.current.length === 0) {
      return;
    }

    if (!selectedAlbumPath && !draftLocation) {
      mapRef.current.setFitView(markersRef.current.map(({ marker }) => marker), false, [...MARKER_PADDING]);
    }
  }, [albums, draftLocation, isReady, selectedAlbumPath]);

  useEffect(() => {
    if (!isReady || !mapRef.current) {
      return;
    }

    const selectedAlbum = albums.find((album) => album.relativePath === selectedAlbumPath);
    if (selectedAlbum) {
      mapRef.current.setCenter([selectedAlbum.lng, selectedAlbum.lat], true);
      mapRef.current.setZoom(12.6);
    }
  }, [albums, isReady, selectedAlbumPath]);

  useEffect(() => {
    if (!isReady || !mapRef.current) {
      return;
    }

    if (draftMarkerRef.current) {
      draftMarkerRef.current.setMap(null);
      draftMarkerRef.current = null;
    }

    if (!draftLocation) {
      return;
    }

    const draftNode = document.createElement('div');
    draftNode.className = 'draft-pin';

    draftMarkerRef.current = new amapRef.current.Marker({
      position: [draftLocation.lng, draftLocation.lat],
      content: draftNode,
      offset: new amapRef.current.Pixel(-18, -18),
    });

    draftMarkerRef.current.setMap(mapRef.current);
    mapRef.current.setCenter([draftLocation.lng, draftLocation.lat], true);
    mapRef.current.setZoom(12.5);
  }, [draftLocation, isReady]);

  return (
    <>
      <div className={`map-search-panel${shouldShowSearchBody ? ' map-search-panel--open' : ''}`}>
        <div className="map-search-bar">
          <Search className="map-search-bar__icon" size={17} />
          <input
            type="text"
            value={searchKeyword}
            placeholder="搜索地点、商圈、景点或地址"
            onFocus={() => setIsSearchFocused(true)}
            onChange={(event) => {
              setSearchKeyword(event.target.value);
              if (searchResults.length > 0) {
                setSearchResults([]);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearch();
              }
              if (event.key === 'Escape') {
                setIsSearchFocused(false);
                setSearchResults([]);
              }
            }}
          />
          {searchKeyword && (
            <button
              type="button"
              className="map-search-bar__clear"
              onClick={clearSearchKeyword}
              title="清空搜索"
            >
              <X size={15} />
            </button>
          )}
          <button type="button" className="map-search-bar__button" onClick={() => void handleSearch()}>
            {isSearching ? <Loader2 className="spin-icon" size={16} /> : <Navigation size={15} />}
            <span>{isSearching ? '搜索中' : '搜索'}</span>
          </button>
        </div>

        {shouldShowSearchBody && (
          <div className="map-search-drawer">
            <div className="map-search-drawer__header">
              <div>
                <span>{searchResults.length > 0 ? '搜索结果' : '地点探索'}</span>
                <strong>{searchResults.length > 0 ? `${searchResults.length} 个候选地点` : '输入地点后按 Enter 搜索'}</strong>
              </div>
              {shouldShowRecentSearches && (
                <button type="button" onClick={clearRecentSearches}>
                  清空记录
                </button>
              )}
            </div>

            {isSearching && (
              <div className="map-search-loading">
                <Loader2 className="spin-icon" size={18} />
                <span>正在搜索附近地点...</span>
              </div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <div className="map-search-results">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="map-search-result"
                    onClick={() => void handlePickSearchResult(result)}
                  >
                    <span className="map-search-result__icon">
                      <MapPin size={16} />
                    </span>
                    <span className="map-search-result__content">
                      <strong>{result.title}</strong>
                      <span>{result.address}</span>
                    </span>
                    <span className="map-search-result__action">定位</span>
                  </button>
                ))}
              </div>
            )}

            {!isSearching && searchResults.length === 0 && recentSearches.length > 0 && (
              <div className="map-search-recents">
                {recentSearches.map((item) => (
                  <button
                    key={`${item.id}-${item.searchedAt}`}
                    type="button"
                    className="map-search-recent"
                    onClick={() => void handlePickSearchResult(item)}
                  >
                    <Clock3 size={15} />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.address}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {!isSearching && searchResults.length === 0 && recentSearches.length === 0 && (
              <div className="map-search-empty">
                <Sparkles size={18} />
                <span>搜索景点、商圈、酒店或详细地址，选择结果后会在地图上生成一个可归档点。</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={mapElementRef} className="map-canvas" />
    </>
  );
}

export const MapCanvas = memo(MapCanvasInner);
