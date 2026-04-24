import type { CSSProperties } from 'react';
import {
  Calendar,
  ChevronRight,
  FolderOpen,
  Image as ImageIcon,
  MapPin,
  Plus,
  RefreshCcw,
  Settings,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import type { AlbumSummary } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

interface BoardBaseProps {
  albums: AlbumSummary[];
  deletingAlbumPath: string | null;
  isLoading: boolean;
  rootFolder: string | null;
  selectedAlbumPath: string | null;
  onChooseImages: () => Promise<void>;
  onChooseRootFolder: () => Promise<void>;
  onOpenMap: () => void;
  onOpenUpload: () => void;
  onRefresh: () => void;
  onDeleteAlbum: (relativePath: string) => Promise<void>;
  onSelectAlbum: (relativePath: string) => void;
}

interface AlbumBoardProps extends BoardBaseProps {
  mode: 'albums' | 'places';
}

interface RecycleBoardProps {
  rootFolder: string | null;
}

interface SettingsBoardProps {
  rootFolder: string | null;
  onChooseRootFolder: () => Promise<void>;
}

function formatDate(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getTotalImages(albums: AlbumSummary[]) {
  return albums.reduce((count, album) => count + album.imageCount, 0);
}

function getRegionCount(albums: AlbumSummary[], key: 'province' | 'city') {
  return new Set(albums.map((album) => album[key]).filter(Boolean)).size;
}

function getMapDotStyle(album: AlbumSummary): CSSProperties {
  const lngMin = 73;
  const lngMax = 135;
  const latMin = 18;
  const latMax = 54;
  const x = Math.min(94, Math.max(6, ((album.lng - lngMin) / (lngMax - lngMin)) * 100));
  const y = Math.min(90, Math.max(10, (1 - (album.lat - latMin) / (latMax - latMin)) * 100));

  return {
    '--dot-x': `${x}%`,
    '--dot-y': `${y}%`,
    '--dot-size': `${Math.min(18, Math.max(7, album.imageCount / 8 + 7))}px`,
  } as CSSProperties;
}

function AlbumCover({ album }: { album: AlbumSummary }) {
  const source = album.coverPath ?? album.previewPaths[0];

  if (!source) {
    return (
      <div className="album-cover album-cover--empty">
        <ImageIcon size={22} />
      </div>
    );
  }

  return (
    <div className="album-cover">
      <img src={toLocalMediaUrl(source)} alt={album.displayName} loading="lazy" decoding="async" draggable={false} />
    </div>
  );
}

export function DashboardBoard({
  albums,
  isLoading,
  rootFolder,
  selectedAlbumPath,
  onChooseImages,
  onChooseRootFolder,
  onOpenMap,
  onOpenUpload,
  onRefresh,
  onSelectAlbum,
}: BoardBaseProps) {
  const totalImages = getTotalImages(albums);
  const recentAlbums = albums.slice(0, 5);

  return (
    <section className="board board--dashboard">
      <header className="board__header">
        <div>
          <span className="board__eyebrow">工作台</span>
          <h1>地图相册</h1>
        </div>
        <div className="board__actions">
          <button type="button" className="button button--ghost" onClick={onRefresh}>
            <RefreshCcw size={16} />
            <span>刷新</span>
          </button>
          <button type="button" className="button button--primary" onClick={onOpenUpload}>
            <UploadCloud size={16} />
            <span>局域网上传</span>
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="metric-strip">
          <article>
            <span>地点相册</span>
            <strong>{albums.length}</strong>
          </article>
          <article>
            <span>照片总数</span>
            <strong>{totalImages}</strong>
          </article>
          <article>
            <span>省份/地区</span>
            <strong>{getRegionCount(albums, 'province')}</strong>
          </article>
          <article>
            <span>城市</span>
            <strong>{getRegionCount(albums, 'city')}</strong>
          </article>
        </div>

        <div className="map-stat-panel">
          <div className="map-stat-panel__map">
            <div className="mini-china-map" aria-hidden="true">
              {albums.map((album) => (
                <span
                  key={album.relativePath}
                  className="mini-map-dot"
                  style={getMapDotStyle(album)}
                  title={album.displayName}
                />
              ))}
            </div>
          </div>
          <div className="map-stat-panel__side">
            <h2>最近地点</h2>
            {recentAlbums.length === 0 && (
              <p className="empty-copy">{isLoading ? '正在读取相册...' : '暂无地点相册'}</p>
            )}
            {recentAlbums.map((album) => (
              <button
                key={album.relativePath}
                type="button"
                className={`recent-row${selectedAlbumPath === album.relativePath ? ' recent-row--active' : ''}`}
                onClick={() => onSelectAlbum(album.relativePath)}
              >
                <AlbumCover album={album} />
                <span>
                  <strong>{album.displayName}</strong>
                  <em>{album.imageCount} 张照片</em>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="quick-actions">
          <button type="button" onClick={() => void onChooseImages()}>
            <Plus size={20} />
            <span>导入照片</span>
          </button>
          <button type="button" onClick={onOpenMap}>
            <MapPin size={20} />
            <span>地图选点</span>
          </button>
          <button type="button" onClick={() => void onChooseRootFolder()}>
            <FolderOpen size={20} />
            <span>{rootFolder ? '更换目录' : '选择目录'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function AlbumBoard({
  albums,
  deletingAlbumPath,
  isLoading,
  mode,
  rootFolder,
  selectedAlbumPath,
  onChooseImages,
  onChooseRootFolder,
  onDeleteAlbum,
  onRefresh,
  onSelectAlbum,
}: AlbumBoardProps) {
  const title = mode === 'albums' ? '全部相册' : '地点';

  return (
    <section className="board">
      <header className="board__header">
        <div>
          <span className="board__eyebrow">{mode === 'albums' ? '相册' : '地点'}</span>
          <h1>
            {title} <small>({albums.length})</small>
          </h1>
        </div>
        <div className="board__actions">
          <button type="button" className="icon-button" onClick={onRefresh} title="刷新">
            <RefreshCcw size={17} />
          </button>
          <button type="button" className="button button--primary" onClick={() => void onChooseImages()}>
            <Plus size={16} />
            <span>新增相册</span>
          </button>
        </div>
      </header>

      {!rootFolder && (
        <div className="empty-panel">
          <FolderOpen size={26} />
          <strong>未选择相册目录</strong>
          <button type="button" className="button button--primary" onClick={() => void onChooseRootFolder()}>
            选择目录
          </button>
        </div>
      )}

      {rootFolder && isLoading && <div className="empty-panel">正在读取相册...</div>}

      {rootFolder && !isLoading && albums.length === 0 && (
        <div className="empty-panel">
          <ImageIcon size={26} />
          <strong>暂无相册</strong>
          <button type="button" className="button button--primary" onClick={() => void onChooseImages()}>
            导入照片
          </button>
        </div>
      )}

      {rootFolder && albums.length > 0 && (
        <div className={mode === 'albums' ? 'album-grid' : 'place-list'}>
          {albums.map((album) => (
            <article
              key={album.relativePath}
              className={`${mode === 'albums' ? 'album-tile' : 'place-row'}${
                selectedAlbumPath === album.relativePath ? ' is-selected' : ''
              }`}
            >
              <button type="button" className="album-tile__main" onClick={() => onSelectAlbum(album.relativePath)}>
                <AlbumCover album={album} />
                <span className="album-tile__body">
                  <strong>{album.displayName}</strong>
                  <em>{album.imageCount} 张照片</em>
                  <small>{formatDate(album.updatedAt)}</small>
                </span>
              </button>
              <button
                type="button"
                className="album-tile__delete"
                disabled={deletingAlbumPath === album.relativePath}
                title="删除地点"
                onClick={() => void onDeleteAlbum(album.relativePath)}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function StatsBoard({ albums, isLoading }: Pick<BoardBaseProps, 'albums' | 'isLoading'>) {
  const totalImages = getTotalImages(albums);
  const topAlbums = [...albums].sort((left, right) => right.imageCount - left.imageCount).slice(0, 5);

  return (
    <section className="board board--stats">
      <header className="board__header">
        <div>
          <span className="board__eyebrow">数据统计</span>
          <h1>照片分布</h1>
        </div>
      </header>

      <div className="metric-strip">
        <article>
          <span>记录地点</span>
          <strong>{albums.length}</strong>
        </article>
        <article>
          <span>照片总数</span>
          <strong>{totalImages}</strong>
        </article>
        <article>
          <span>国家/地区</span>
          <strong>{getRegionCount(albums, 'province')}</strong>
        </article>
        <article>
          <span>相册数量</span>
          <strong>{albums.length}</strong>
        </article>
      </div>

      <div className="stats-layout">
        <div className="stats-map-card">
          <h2>足迹分布</h2>
          <div className="mini-china-map mini-china-map--large" aria-hidden="true">
            {albums.map((album) => (
              <span key={album.relativePath} className="mini-map-dot" style={getMapDotStyle(album)} />
            ))}
          </div>
          {isLoading && <p className="empty-copy">正在读取数据...</p>}
        </div>
        <div className="top-list-card">
          <h2>最多照片地点 TOP5</h2>
          {topAlbums.length === 0 && <p className="empty-copy">暂无统计数据</p>}
          {topAlbums.map((album) => (
            <div key={album.relativePath} className="top-list-row">
              <AlbumCover album={album} />
              <span>
                <strong>{album.displayName}</strong>
                <em>{album.province || album.city || '未命名区域'}</em>
              </span>
              <b>{album.imageCount}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RecycleBoard({ rootFolder }: RecycleBoardProps) {
  return (
    <section className="board board--recycle">
      <header className="board__header">
        <div>
          <span className="board__eyebrow">回收站</span>
          <h1>已删除项目</h1>
        </div>
      </header>
      <div className="empty-panel empty-panel--wide">
        <Trash2 size={28} />
        <strong>{rootFolder ? '当前没有回收站项目' : '未选择相册目录'}</strong>
        <p>现有本地删除接口不会保留回收站副本，因此这里不展示虚构记录。</p>
      </div>
    </section>
  );
}

export function SettingsBoard({ rootFolder, onChooseRootFolder }: SettingsBoardProps) {
  return (
    <section className="board board--settings">
      <header className="board__header">
        <div>
          <span className="board__eyebrow">设置</span>
          <h1>偏好设置</h1>
        </div>
      </header>

      <div className="settings-grid">
        <section className="settings-panel">
          <h2>
            <Settings size={17} />
            通用
          </h2>
          <div className="settings-row">
            <span>相册根目录</span>
            <strong>{rootFolder ?? '未选择'}</strong>
            <button type="button" className="button button--primary" onClick={() => void onChooseRootFolder()}>
              选择目录
            </button>
          </div>
        </section>

        <section className="settings-panel">
          <h2>
            <MapPin size={17} />
            地图样式
          </h2>
          <div className="theme-swatches">
            <button type="button" className="theme-swatch theme-swatch--active">
              <span className="theme-swatch__preview theme-swatch__preview--deep" />
              深色星点
            </button>
            <button type="button" className="theme-swatch">
              <span className="theme-swatch__preview theme-swatch__preview--line" />
              黑金线网
            </button>
            <button type="button" className="theme-swatch">
              <span className="theme-swatch__preview theme-swatch__preview--photo" />
              浅色
            </button>
          </div>
        </section>

        <section className="settings-panel">
          <h2>
            <Calendar size={17} />
            数据范围
          </h2>
          <div className="settings-row settings-row--compact">
            <span>当前相册</span>
            <strong>{albumsSummaryText(rootFolder)}</strong>
          </div>
        </section>
      </div>
    </section>
  );
}

function albumsSummaryText(rootFolder: string | null) {
  return rootFolder ? `目录：${rootFolder}` : '未选择目录';
}
