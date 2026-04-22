import { memo, useEffect, useMemo, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import type { AlbumSummary, LocationDraft } from '../shared/contracts';
import { AMAP_WEB_KEY, ensureAmapSecurityConfig } from '../shared/amap-config';
import { toLocalMediaUrl } from '../shared/media';
import { buildAlbumSegments, createLocationDraft } from '../shared/location';

const MARKER_PADDING = [140, 160, 140, 160] as const;

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
      title: album.displayName,
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
    const title = segments.at(-1) ?? groupedAlbums[0].displayName;
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

  const handlersRef = useRef({ onLocationPicked, onSelectAlbum, onMapError });
  useEffect(() => {
    handlersRef.current = { onLocationPicked, onSelectAlbum, onMapError };
  }, [onLocationPicked, onSelectAlbum, onMapError]);

  const nodes = useMemo(() => buildAggregateNodes(albums, visibleLevel), [albums, visibleLevel]);

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
    setSearchKeyword(result.title);
    setSearchResults([]);
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
          mapStyle: 'amap://styles/grey',
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
        <div class="map-marker__media">
          ${renderMarkerMedia(node.coverPaths)}
        </div>
        <div class="map-marker__badge">${node.imageCount}</div>
        <div class="map-marker__caption">
          <strong>${escapeHtml(node.title)}</strong>
          <span>${escapeHtml(node.subtitle)}</span>
          ${node.notePreview ? `<p class="map-marker__note">${escapeHtml(node.notePreview)}</p>` : ''}
        </div>
      `;

      const marker = new amapRef.current.Marker({
        position: [node.lng, node.lat],
        content: markerNode,
        offset: new amapRef.current.Pixel(-32, -68),
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
      <div className="map-search-panel">
        <div className="map-search-bar">
          <input
            type="text"
            value={searchKeyword}
            placeholder="搜索地点、商圈、景点或地址"
            onChange={(event) => setSearchKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSearch();
              }
            }}
          />
          <button type="button" className="map-search-bar__button" onClick={() => void handleSearch()}>
            {isSearching ? '搜索中...' : '搜索'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="map-search-results">
            {searchResults.map((result) => (
              <button
                key={result.id}
                type="button"
                className="map-search-result"
                onClick={() => void handlePickSearchResult(result)}
              >
                <strong>{result.title}</strong>
                <span>{result.address}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={mapElementRef} className="map-canvas" />
    </>
  );
}

export const MapCanvas = memo(MapCanvasInner);
