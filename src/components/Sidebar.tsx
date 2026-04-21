import { useDeferredValue, useState } from 'react';
import { Image as ImageIcon, QrCode, RefreshCcw, Search, Smartphone, X } from 'lucide-react';
import type { AlbumSummary, LanServerState } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

interface SidebarProps {
  albums: AlbumSummary[];
  isLoading: boolean;
  lanQrUrl: string | null;
  lanUploadState: LanServerState;
  rootFolder: string | null;
  selectedAlbumPath: string | null;
  isOpen: boolean;
  onStartLanUpload: () => Promise<void>;
  onStopLanUpload: () => Promise<void>;
  onRefresh: () => void;
  onSelectAlbum: (relativePath: string) => void;
  onClose: () => void;
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

export function Sidebar({
  albums,
  isLoading,
  lanQrUrl,
  lanUploadState,
  rootFolder,
  selectedAlbumPath,
  isOpen,
  onStartLanUpload,
  onStopLanUpload,
  onRefresh,
  onSelectAlbum,
  onClose,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filteredAlbums = deferredQuery
    ? albums.filter((album) => album.displayName.toLowerCase().includes(deferredQuery))
    : albums;

  const totalImages = albums.reduce((count, album) => count + album.imageCount, 0);

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar__brand">
        <div>
          <p className="sidebar__eyebrow">MapAlbum</p>
          <h1>地图相册工作台</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="icon-button" onClick={onRefresh} title="刷新相册">
            <RefreshCcw size={18} />
          </button>
          <button className="icon-button" onClick={onClose} title="收起面板">
            <X size={18} />
          </button>
        </div>
      </div>

      <section className="sidebar__section sidebar__phone-upload">
        <div className="sidebar__section-title">
          <h2>手机上传</h2>
          {lanUploadState.isRunning ? (
            <button className="button button--ghost" onClick={onStopLanUpload}>
              <span>停止</span>
            </button>
          ) : (
            <button className="button button--ghost" onClick={onStartLanUpload}>
              <QrCode size={16} />
              <span>启动</span>
            </button>
          )}
        </div>

        <div className="upload-link-card">
          <div className="upload-link-card__copy">
            <Smartphone size={18} />
            <div>
              <strong>局域网扫码上传</strong>
              <p>手机和电脑在同一网络下时，可以直接上传原图；如果照片自带 GPS，会自动定位到地图。</p>
            </div>
          </div>

          {lanUploadState.isRunning && lanUploadState.url ? (
            <>
              {lanQrUrl ? (
                <img className="upload-qr" src={lanQrUrl} alt="局域网上传二维码" />
              ) : (
                <div className="upload-qr upload-qr--placeholder">二维码</div>
              )}
              <a className="upload-link-card__url" href={lanUploadState.url} target="_blank" rel="noreferrer">
                {lanUploadState.url}
              </a>
            </>
          ) : (
            <p className="sidebar__hint">启动后会显示二维码和访问链接，这个入口始终独立于手动选点。</p>
          )}
        </div>
      </section>

      <section className="sidebar__stats">
        <div>
          <span>地点</span>
          <strong>{albums.length}</strong>
        </div>
        <div>
          <span>照片</span>
          <strong>{totalImages}</strong>
        </div>
      </section>

      <section className="sidebar__section sidebar__albums">
        <div className="sidebar__section-title">
          <h2>已归档地点</h2>
          <span>{filteredAlbums.length}</span>
        </div>

        <label className="search-input">
          <Search size={16} />
          <input
            placeholder="搜索地点"
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

            return (
              <button
                key={album.relativePath}
                className={`album-row${isActive ? ' album-row--active' : ''}`}
                onClick={() => onSelectAlbum(album.relativePath)}
              >
                <div className="album-row__cover">
                  {album.coverPath ? (
                    <img src={toLocalMediaUrl(album.coverPath)} alt={album.displayName} />
                  ) : (
                    <div className="album-row__cover-fallback">
                      <ImageIcon size={16} />
                    </div>
                  )}
                </div>
                <div className="album-row__content">
                  <strong>{album.displayName}</strong>
                  <span>{album.relativePath}</span>
                </div>
                <div className="album-row__meta">
                  <strong>{album.imageCount}</strong>
                  <span>{formatUpdatedAt(album.updatedAt)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
