import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ChevronRight,
  FileImage,
  Folder,
  FolderOpen,
  Grid,
  HardDrive,
  Image as ImageIcon,
  List,
  MapPin,
  MoreVertical,
  Navigation,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  Trash2,
  UploadCloud,
  Wifi,
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
  onOpenCreateAlbum: () => void;
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
    return '未知日期';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replaceAll('/', '.');
}

function formatMonthDay(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(date).replaceAll('/', '.');
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function getTotalImages(albums: AlbumSummary[]) {
  return albums.reduce((count, album) => count + album.imageCount, 0);
}

function getRegionCount(albums: AlbumSummary[], key: 'province' | 'city') {
  return new Set(albums.map((album) => album[key]).filter(Boolean)).size;
}

function getCoverPath(album: AlbumSummary) {
  return album.coverPath ?? album.previewPaths[0] ?? null;
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
    '--dot-size': `${Math.min(18, Math.max(7, album.imageCount / 7 + 7))}px`,
  } as CSSProperties;
}

function albumRegion(album: AlbumSummary) {
  return [album.province, album.city, album.district].filter(Boolean).join(' / ') || '未命名地点';
}

function AlbumCover({ album, className = '' }: { album: AlbumSummary; className?: string }) {
  const source = getCoverPath(album);

  if (!source) {
    return (
      <div className={`album-cover album-cover--empty ${className}`}>
        <ImageIcon size={22} />
      </div>
    );
  }

  return (
    <div className={`album-cover ${className}`}>
      <img src={toLocalMediaUrl(source)} alt={album.displayName} loading="lazy" decoding="async" draggable={false} />
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-panel">
      <span>{icon}</span>
      <strong>{title}</strong>
      {actionLabel && onAction && (
        <button type="button" className="button button--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
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
  onOpenCreateAlbum,
  onOpenMap,
  onOpenUpload,
  onRefresh,
  onSelectAlbum,
}: BoardBaseProps) {
  const totalImages = getTotalImages(albums);
  const recentAlbums = albums.slice(0, 4);
  const previewPaths = albums.flatMap((album) => album.previewPaths.length ? album.previewPaths : album.coverPath ? [album.coverPath] : []).slice(0, 6);

  return (
    <section className="board board--dashboard">
      <header className="board__title">
        <div>
          <h1>工作台</h1>
          <p>本地照片，一图一世界</p>
        </div>
        <button type="button" className="icon-button" title="刷新" onClick={onRefresh}>
          <RefreshCcw size={16} />
        </button>
      </header>

      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-card__icon metric-card__icon--green"><ImageIcon size={24} /></span>
          <small>照片数量</small>
          <strong>{formatNumber(totalImages)}</strong>
          <em>张照片</em>
        </article>
        <article className="metric-card">
          <span className="metric-card__icon metric-card__icon--violet"><Folder size={24} /></span>
          <small>相册数量</small>
          <strong>{formatNumber(albums.length)}</strong>
          <em>个相册</em>
        </article>
        <article className="metric-card">
          <span className="metric-card__icon metric-card__icon--blue"><MapPin size={24} /></span>
          <small>地点数量</small>
          <strong>{formatNumber(albums.length)}</strong>
          <em>个地点</em>
        </article>
        <article className="metric-card metric-card--storage">
          <span className="metric-card__icon metric-card__icon--green"><HardDrive size={24} /></span>
          <small>本地占用空间</small>
          <strong>256 GB</strong>
          <em>512 GB 可用</em>
          <div className="metric-progress"><b /></div>
        </article>
      </div>

      <div className="dashboard-layout">
        <section className="panel-block panel-block--wide">
          <div className="panel-block__head">
            <h2>最近导入</h2>
            <button type="button" onClick={onRefresh}>查看全部</button>
          </div>
          <p className="panel-kicker">最近照片</p>
          <div className="photo-strip photo-strip--large">
            {previewPaths.length > 0 ? (
              previewPaths.map((path) => (
                <img key={path} src={toLocalMediaUrl(path)} alt="" loading="lazy" decoding="async" draggable={false} />
              ))
            ) : (
              Array.from({ length: 6 }).map((_, index) => <span key={index} className="photo-placeholder" />)
            )}
          </div>

          <div className="folder-row">
            {recentAlbums.slice(0, 3).map((album) => (
              <button key={album.relativePath} type="button" onClick={() => onSelectAlbum(album.relativePath)}>
                <Folder size={19} />
                <span>
                  <strong>{album.displayName}</strong>
                  <small>{formatDate(album.updatedAt)} · {album.imageCount} 张</small>
                </span>
              </button>
            ))}
            {recentAlbums.length === 0 && (
              <button type="button" onClick={() => void onChooseImages()}>
                <Folder size={19} />
                <span>
                  <strong>导入照片</strong>
                  <small>{rootFolder ? '从本地选择图片' : '先选择照片目录'}</small>
                </span>
              </button>
            )}
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-block__head">
            <h2>待整理</h2>
          </div>
          {[
            ['无 GPS 照片', 328, <Navigation size={20} />],
            ['未归档照片', 546, <Folder size={20} />],
            ['重复照片', 236, <FileImage size={20} />],
          ].map(([label, value, icon]) => (
            <button key={String(label)} type="button" className="todo-row" onClick={() => void onChooseImages()}>
              <span>{icon}</span>
              <strong>{label}</strong>
              <em>{value} 张</em>
              <ChevronRight size={15} />
            </button>
          ))}
        </section>

        <section className="panel-block panel-block--wide">
          <div className="panel-block__head">
            <h2>最近访问</h2>
            <button type="button" onClick={onOpenMap}>查看全部</button>
          </div>
          <div className="recent-card-grid">
            {recentAlbums.length > 0 ? recentAlbums.map((album) => (
              <button
                key={album.relativePath}
                type="button"
                className={`recent-card${selectedAlbumPath === album.relativePath ? ' is-selected' : ''}`}
                onClick={() => onSelectAlbum(album.relativePath)}
              >
                <AlbumCover album={album} />
                <strong>{album.displayName}</strong>
                <small>{album.imageCount} 张照片</small>
              </button>
            )) : (
              <EmptyPanel
                icon={<ImageIcon size={24} />}
                title={isLoading ? '正在读取相册...' : '还没有地点相册'}
                actionLabel={rootFolder ? '导入照片' : '选择目录'}
                onAction={rootFolder ? () => void onChooseImages() : () => void onChooseRootFolder()}
              />
            )}
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-block__head">
            <h2>快速操作</h2>
          </div>
          <div className="quick-action-grid">
            <button type="button" onClick={() => void onChooseImages()}>
              <FolderOpen size={25} />
              <strong>导入本地文件夹</strong>
              <small>从电脑导入照片</small>
            </button>
            <button type="button" onClick={onOpenUpload}>
              <Wifi size={25} />
              <strong>局域网手机上传</strong>
              <small>手机照片快速导入</small>
            </button>
            <button type="button" onClick={onOpenCreateAlbum}>
              <Plus size={25} />
              <strong>新建相册</strong>
              <small>创建一个新位置</small>
            </button>
            <button type="button" onClick={onOpenMap}>
              <Folder size={25} />
              <strong>打开照片目录</strong>
              <small>浏览本地相册</small>
            </button>
          </div>
        </section>
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
  onOpenCreateAlbum,
  onRefresh,
  onSelectAlbum,
}: AlbumBoardProps) {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const trimmedQuery = query.trim().toLowerCase();
  const filteredAlbums = useMemo(
    () =>
      trimmedQuery
        ? albums.filter((album) => `${album.displayName} ${album.relativePath}`.toLowerCase().includes(trimmedQuery))
        : albums,
    [albums, trimmedQuery],
  );

  const isPlaces = mode === 'places';

  return (
    <section className={`board board--catalog board--${mode}`}>
      <header className="catalog-toolbar">
        <label className="search-pill">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isPlaces ? '搜索地点...' : '搜索相册...'}
          />
        </label>
        <button type="button" className="button button--primary" onClick={isPlaces ? onOpenCreateAlbum : () => void onChooseImages()}>
          <Plus size={16} />
          <span>{isPlaces ? '新增地点' : '新增相册'}</span>
        </button>
      </header>

      <div className="catalog-tabs">
        <button type="button" className="is-active">全部{isPlaces ? '地点' : '相册'} <b>{filteredAlbums.length}</b></button>
        <button type="button">国内 <b>{getRegionCount(albums, 'province')}</b></button>
        <button type="button">国外 <b>0</b></button>
        <span />
        <button type="button" className={viewMode === 'grid' ? 'is-active-icon' : ''} onClick={() => setViewMode('grid')} title="网格">
          <Grid size={16} />
        </button>
        <button type="button" className={viewMode === 'list' ? 'is-active-icon' : ''} onClick={() => setViewMode('list')} title="列表">
          <List size={16} />
        </button>
        <button type="button" onClick={onRefresh} title="刷新">
          <RefreshCcw size={16} />
        </button>
      </div>

      {!rootFolder && (
        <EmptyPanel
          icon={<FolderOpen size={28} />}
          title="尚未选择照片目录"
          actionLabel="选择目录"
          onAction={() => void onChooseRootFolder()}
        />
      )}

      {rootFolder && isLoading && <EmptyPanel icon={<ImageIcon size={28} />} title="正在读取相册..." />}

      {rootFolder && !isLoading && filteredAlbums.length === 0 && (
        <EmptyPanel
          icon={<ImageIcon size={28} />}
          title={albums.length === 0 ? '暂无相册' : '没有匹配结果'}
          actionLabel="导入照片"
          onAction={() => void onChooseImages()}
        />
      )}

      {rootFolder && filteredAlbums.length > 0 && (
        <div className={`${isPlaces ? 'place-card-grid' : 'album-card-grid'} ${viewMode === 'list' ? 'is-list' : ''}`}>
          {filteredAlbums.map((album) => (
            <article
              key={album.relativePath}
              className={`album-card${selectedAlbumPath === album.relativePath ? ' is-selected' : ''}`}
            >
              <button type="button" className="album-card__main" onClick={() => onSelectAlbum(album.relativePath)}>
                <AlbumCover album={album} />
                <span className="album-card__body">
                  <strong>{album.displayName}</strong>
                  <em>{albumRegion(album)}</em>
                  <small>{album.imageCount} 张照片 · {formatDate(album.updatedAt)}</small>
                </span>
              </button>
              <button type="button" className="album-card__menu" title="更多">
                <MoreVertical size={16} />
              </button>
              <button
                type="button"
                className="album-card__delete"
                disabled={deletingAlbumPath === album.relativePath}
                title="删除"
                onClick={() => void onDeleteAlbum(album.relativePath)}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
          {!isPlaces && (
            <button type="button" className="new-album-card" onClick={onOpenCreateAlbum}>
              <Plus size={34} />
              <span>新建相册</span>
            </button>
          )}
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
      <header className="board__title">
        <div>
          <h1>照片信息</h1>
          <p>照片、地点与相册的整体统计</p>
        </div>
      </header>

      <div className="metric-grid metric-grid--stats">
        <article className="metric-card"><small>记录地点</small><strong>{albums.length}</strong><em>个地点</em></article>
        <article className="metric-card"><small>照片总数</small><strong>{totalImages}</strong><em>张照片</em></article>
        <article className="metric-card"><small>省份/地区</small><strong>{getRegionCount(albums, 'province')}</strong><em>个区域</em></article>
        <article className="metric-card"><small>城市</small><strong>{getRegionCount(albums, 'city')}</strong><em>座城市</em></article>
      </div>

      <div className="stats-layout">
        <section className="stats-map-card">
          <h2>足迹分布</h2>
          <div className="mini-china-map mini-china-map--large" aria-hidden="true">
            {albums.map((album) => (
              <span key={album.relativePath} className="mini-map-dot" style={getMapDotStyle(album)} />
            ))}
          </div>
          {isLoading && <p className="empty-copy">正在读取数据...</p>}
        </section>
        <section className="top-list-card">
          <h2>照片最多地点 TOP5</h2>
          {topAlbums.length === 0 && <p className="empty-copy">暂无统计数据</p>}
          {topAlbums.map((album, index) => (
            <div key={album.relativePath} className="top-list-row">
              <AlbumCover album={album} />
              <span>
                <strong>{album.displayName}</strong>
                <em>{albumRegion(album)}</em>
              </span>
              <b>{index + 1}</b>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}

export function RecycleBoard({ rootFolder }: RecycleBoardProps) {
  return (
    <section className="board board--recycle">
      <header className="board__title">
        <div>
          <h1>回收站</h1>
          <p>已删除的相册和照片会在这里集中处理</p>
        </div>
      </header>
      <EmptyPanel
        icon={<Trash2 size={30} />}
        title={rootFolder ? '当前没有回收站项目' : '尚未选择照片目录'}
      />
    </section>
  );
}

export function SettingsBoard({ rootFolder, onChooseRootFolder }: SettingsBoardProps) {
  return (
    <section className="board board--settings">
      <div className="settings-shell">
        <aside className="settings-tabs">
          {[
            ['常规', <Settings size={15} />],
            ['文件管理', <FolderOpen size={15} />],
            ['地图设置', <MapPin size={15} />],
            ['导入设置', <UploadCloud size={15} />],
            ['关于', <ImageIcon size={15} />],
          ].map(([label, icon], index) => (
            <button key={String(label)} type="button" className={index === 0 ? 'is-active' : ''}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </aside>

        <section className="settings-main">
          <header>
            <h1>常规</h1>
          </header>
          <div className="settings-form">
            <label>
              <span>语言</span>
              <select defaultValue="zh-CN">
                <option value="zh-CN">简体中文</option>
              </select>
            </label>
            <label>
              <span>主题</span>
              <select defaultValue="dark">
                <option value="dark">深色</option>
              </select>
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>开机自动启动</span>
            </label>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>启动时加载上次位置</span>
            </label>
            <label>
              <span>照片缓存大小</span>
              <select defaultValue="1">
                <option value="1">1 GB</option>
                <option value="2">2 GB</option>
                <option value="4">4 GB</option>
              </select>
            </label>
            <label className="settings-path">
              <span>相册根目录</span>
              <strong>{rootFolder ?? '尚未选择'}</strong>
              <button type="button" className="button button--ghost" onClick={() => void onChooseRootFolder()}>
                选择目录
              </button>
            </label>
          </div>
          <footer className="settings-actions">
            <button type="button" className="button button--ghost">取消</button>
            <button type="button" className="button button--primary">保存</button>
          </footer>
        </section>
      </div>
    </section>
  );
}

export { AlbumCover, formatDate, formatMonthDay, getMapDotStyle, getTotalImages };
