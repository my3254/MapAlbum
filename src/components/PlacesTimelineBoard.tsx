import { useMemo, useState, type CSSProperties } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  ListFilter,
  ListTree,
  LocateFixed,
  MapPin,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import type { AlbumSummary, LocationDraft } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';
import { MapCanvas } from './MapCanvas';

interface PlacesTimelineBoardProps {
  albums: AlbumSummary[];
  draftLocation: LocationDraft | null;
  isLoading: boolean;
  rootFolder: string | null;
  selectedAlbumPath: string | null;
  onChooseRootFolder: () => Promise<void>;
  onLocationPicked: (location: LocationDraft) => void;
  onMapError: (message: string) => void;
  onOpenDetails: () => void;
  onSelectAlbum: (relativePath: string) => void;
}

interface TimelineItem {
  key: string;
  title: string;
  date: string;
  count: number;
  coverPath: string | null;
  relativePath: string | null;
}

const demoCovers = [
  'linear-gradient(135deg, #95c7e2 0%, #d7f1ff 45%, #1f6f58 46%, #092f28 100%)',
  'linear-gradient(135deg, #13243b 0%, #f0a94f 48%, #603415 49%, #0b1825 100%)',
  'linear-gradient(135deg, #86b7d3 0%, #e2eef4 42%, #31516d 43%, #0b1825 100%)',
  'linear-gradient(135deg, #1b3659 0%, #e8c48e 52%, #5d3b26 53%, #08151f 100%)',
];

function formatDate(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知日期';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replaceAll('/', '.');
}

function formatMonth(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '更早';
  }

  return `${date.getMonth() + 1}月`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function getCoverPath(album: AlbumSummary | null) {
  return album?.coverPath ?? album?.previewPaths[0] ?? null;
}

function getRangeText(album: AlbumSummary) {
  return `${formatDate(album.createdAt)} - ${formatDate(album.updatedAt)}`;
}

function AlbumThumb({
  album,
  index = 0,
  className = '',
}: {
  album: AlbumSummary | null;
  index?: number;
  className?: string;
}) {
  const coverPath = getCoverPath(album);

  if (coverPath) {
    return (
      <span className={`geo-thumb ${className}`}>
        <img src={toLocalMediaUrl(coverPath)} alt={album?.displayName ?? ''} loading="lazy" decoding="async" draggable={false} />
      </span>
    );
  }

  return <span className={`geo-thumb geo-thumb--placeholder ${className}`} style={{ '--thumb-bg': demoCovers[index % demoCovers.length] } as CSSProperties} />;
}

function buildTimelineItems(albums: AlbumSummary[]): TimelineItem[] {
  if (albums.length === 0) {
    return Array.from({ length: 7 }).map((_, index) => ({
      key: `empty-${index}`,
      title: ['九寨沟', '西安古城', '厦门鼓浪屿', '稻城亚丁', '上海外滩', '桂林阳朔', '云南大理'][index],
      date: ['04.18 - 04.22', '04.14 - 04.15', '03.08 - 03.10', '10.02 - 10.05', '09.21 - 09.22', '07.01 - 07.03', '05.01 - 05.04'][index],
      count: [126, 98, 86, 78, 65, 58, 64][index],
      coverPath: null,
      relativePath: null,
    }));
  }

  return albums.slice(0, 8).map((album) => ({
    key: album.relativePath,
    title: album.displayName,
    date: `${formatDate(album.createdAt).slice(5)} - ${formatDate(album.updatedAt).slice(5)}`,
    count: album.imageCount,
    coverPath: getCoverPath(album),
    relativePath: album.relativePath,
  }));
}

export function PlacesTimelineBoard({
  albums,
  draftLocation,
  isLoading,
  rootFolder,
  selectedAlbumPath,
  onChooseRootFolder,
  onLocationPicked,
  onMapError,
  onOpenDetails,
  onSelectAlbum,
}: PlacesTimelineBoardProps) {
  const [query, setQuery] = useState('');
  const filteredAlbums = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return albums;
    }
    return albums.filter((album) => `${album.displayName} ${album.relativePath}`.toLowerCase().includes(trimmed));
  }, [albums, query]);

  const totalImages = albums.reduce((count, album) => count + album.imageCount, 0);
  const timelineItems = useMemo(() => buildTimelineItems(albums), [albums]);
  const monthStats = useMemo(() => {
    const stats = new Map<string, number>();
    albums.forEach((album) => {
      const key = formatMonth(album.updatedAt);
      stats.set(key, (stats.get(key) ?? 0) + album.imageCount);
    });
    return Array.from(stats.entries()).slice(0, 5);
  }, [albums]);

  return (
    <section className="geo-workspace">
      <header className="geo-header">
        <div>
          <h1>地点 / 时间线</h1>
          <p>探索你去过的地方和时光足迹</p>
        </div>
        <label className="geo-search">
          <Search size={17} />
          <input placeholder="搜索地点、照片、相册..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="geo-view-tools">
          <button type="button" title="筛选"><ListFilter size={18} /></button>
          <button type="button" className="is-active" title="列表"><ListTree size={18} /></button>
          <button type="button" title="网格"><Grid2X2 size={18} /></button>
        </div>
      </header>

      <div className="geo-main-grid">
        <aside className="geo-panel geo-place-list">
          <div className="geo-tabs">
            <button type="button" className="is-active">地图视图</button>
            <button type="button">时间线视图</button>
          </div>
          <div className="geo-panel__title">
            <span>地点列表（{albums.length || 356}）</span>
            <div>
              <Search size={16} />
              <SlidersHorizontal size={15} />
            </div>
          </div>

          <div className="geo-list-scroll">
            {!rootFolder && albums.length === 0 && (
              <button type="button" className="geo-empty-prompt" onClick={() => void onChooseRootFolder()}>
                选择图库目录后显示地点
                <ChevronRight size={15} />
              </button>
            )}
            {rootFolder && isLoading && <p className="geo-muted">正在读取地点...</p>}
            {(filteredAlbums.length > 0 ? filteredAlbums : []).slice(0, 7).map((album, index) => (
              <button
                key={album.relativePath}
                type="button"
                className={`geo-place-row${selectedAlbumPath === album.relativePath ? ' is-active' : ''}`}
                onClick={() => onSelectAlbum(album.relativePath)}
              >
                <AlbumThumb album={album} index={index} />
                <span>
                  <strong>{album.displayName}</strong>
                  <small>{album.imageCount} 张照片</small>
                  <em>{getRangeText(album)}</em>
                </span>
                <b>{album.imageCount}</b>
                <MapPin size={14} />
              </button>
            ))}
            {filteredAlbums.length === 0 && albums.length === 0 && (
              Array.from({ length: 5 }).map((_, index) => (
                <button key={index} type="button" className="geo-place-row geo-place-row--sample">
                  <AlbumThumb album={null} index={index} />
                  <span>
                    <strong>{['九寨沟', '西安古城', '厦门鼓浪屿', '稻城亚丁', '上海外滩'][index]}</strong>
                    <small>{[126, 98, 86, 78, 65][index]} 张照片</small>
                    <em>{['2024.04.18 - 2024.04.22', '2024.04.14 - 2024.04.15', '2024.03.08 - 2024.03.10', '2023.10.02 - 2023.10.05', '2023.09.21 - 2023.09.22'][index]}</em>
                  </span>
                  <b>{[126, 98, 86, 78, 65][index]}</b>
                  <MapPin size={14} />
                </button>
              ))
            )}
          </div>

          <button type="button" className="geo-panel__footer">
            查看全部地点
            <ChevronRight size={15} />
          </button>
        </aside>

        <section className="geo-map-card">
          <MapCanvas
            albums={albums}
            draftLocation={draftLocation}
            selectedAlbumPath={selectedAlbumPath}
            variant="explorer"
            onLocationPicked={onLocationPicked}
            onMapError={onMapError}
            onSelectAlbum={onSelectAlbum}
          />
          <div className="geo-map-summary">
            <strong>中国</strong>
            <span>{albums.length || 356} 个地点</span>
            <em>{formatNumber(totalImages || 12869)} 张照片</em>
            <button type="button" onClick={onOpenDetails}>生成足迹视频</button>
          </div>
          {albums.length === 0 && (
            <div className="geo-demo-map-markers" aria-hidden="true">
              {[
                ['30%', '30%', 78, 0],
                ['43%', '48%', 36, 2],
                ['66%', '34%', 42, 0],
                ['58%', '56%', 65, 1],
                ['72%', '24%', 26, 1],
                ['46%', '70%', 126, 0],
                ['64%', '70%', 86, 3],
              ].map(([x, y, count, cover]) => (
                <span
                  key={`${x}-${y}`}
                  className="geo-demo-marker"
                  style={{ '--x': x, '--y': y, '--thumb-bg': demoCovers[Number(cover)] } as CSSProperties}
                >
                  <i />
                  <b>{count}</b>
                </span>
              ))}
            </div>
          )}
          <div className="geo-map-scale">
            <span>500 km</span>
            <i />
          </div>
        </section>
      </div>

      <section className="geo-timeline-panel">
        <header className="geo-timeline-head">
          <div>
            <h2>时间线视图</h2>
            <button type="button">全部时间 <ChevronDown size={14} /></button>
            <button type="button" title="日期"><CalendarDays size={15} /></button>
          </div>
          <span>按时间排序 <ChevronDown size={14} /></span>
          <div>
            <button type="button" className="is-active" title="列表"><ListTree size={17} /></button>
            <button type="button" title="网格"><Grid2X2 size={17} /></button>
          </div>
        </header>

        <div className="geo-timeline-layout">
          <aside className="geo-year-stats">
            <strong>2024年</strong>
            {(monthStats.length > 0 ? monthStats : [['4月', 428], ['3月', 312]]).map(([month, count]) => (
              <span key={String(month)}>
                <i />
                <b>{month}</b>
                <em>{Number(count)} 张照片</em>
              </span>
            ))}
            <strong>2023年</strong>
            <span><i /> <b>10月</b><em>280 张照片</em></span>
            <span><i /> <b>9月</b><em>156 张照片</em></span>
            <span><i /> <b>8月</b><em>196 张照片</em></span>
            <strong>更早</strong>
          </aside>

          <div className="geo-timeline-track">
            {timelineItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                className="geo-time-card"
                onClick={() => item.relativePath && onSelectAlbum(item.relativePath)}
              >
                {item.coverPath ? (
                  <span className="geo-time-thumb">
                    <img src={toLocalMediaUrl(item.coverPath)} alt={item.title} loading="lazy" decoding="async" draggable={false} />
                  </span>
                ) : (
                  <span className="geo-time-thumb geo-thumb--placeholder" style={{ '--thumb-bg': demoCovers[index % demoCovers.length] } as CSSProperties} />
                )}
                <span>
                  <em>{item.date}</em>
                  <strong>{item.title}</strong>
                  <small>{item.count} 张照片</small>
                </span>
              </button>
            ))}
            <button type="button" className="geo-time-card geo-time-card--more">
              <span className="geo-time-thumb geo-time-thumb--empty"><LocateFixed size={30} /></span>
              <span>
                <em>更多记录</em>
                <strong>更多记录</strong>
                <small>85 张照片</small>
              </span>
            </button>
          </div>

          <aside className="geo-year-rail">
            <button type="button" className="is-active">全部</button>
            <span>2024</span>
            <span>2023</span>
            <span>2022</span>
            <span>2021</span>
            <span>2020</span>
            <span>更早</span>
          </aside>
        </div>
      </section>
    </section>
  );
}
