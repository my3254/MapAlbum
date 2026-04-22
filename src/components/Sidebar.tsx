import { memo, useDeferredValue, useEffect, useState } from 'react';
import { Image as ImageIcon, RefreshCcw, Search, Trash2, X } from 'lucide-react';
import type { AlbumSummary } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

interface SidebarProps {
  albums: AlbumSummary[];
  deletingAlbumPath: string | null;
  isLoading: boolean;
  rootFolder: string | null;
  selectedAlbumPath: string | null;
  isOpen: boolean;
  onDeleteAlbum: (relativePath: string) => Promise<void>;
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

function SidebarInner({
  albums,
  deletingAlbumPath,
  isLoading,
  rootFolder,
  selectedAlbumPath,
  isOpen,
  onDeleteAlbum,
  onRefresh,
  onSelectAlbum,
  onClose,
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [armedDeletePath, setArmedDeletePath] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    if (!armedDeletePath) {
      return;
    }

    const timer = window.setTimeout(() => setArmedDeletePath(null), 2400);
    return () => window.clearTimeout(timer);
  }, [armedDeletePath]);

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
            const isDeleteArmed = armedDeletePath === album.relativePath;
            const isDeleting = deletingAlbumPath === album.relativePath;

            return (
              <div
                key={album.relativePath}
                className={`album-row-shell${isDeleteArmed ? ' album-row-shell--delete-armed' : ''}`}
              >
                <button
                  className={`album-row${isActive ? ' album-row--active' : ''}`}
                  onClick={() => onSelectAlbum(album.relativePath)}
                  title={`${album.displayName}\n\n路径：${album.relativePath}\n照片数：${album.imageCount} 张\n最后更新：${formatUpdatedAt(album.updatedAt)}${album.note ? `\n\n留言：${album.note}` : ''}`}
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
                    <strong>{album.displayName}</strong>
                    <span>{album.relativePath}</span>
                  </div>
                  <div className="album-row__meta">
                    <strong>{album.imageCount}</strong>
                    <span>{formatUpdatedAt(album.updatedAt)}</span>
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
    </aside>
  );
}

export const Sidebar = memo(SidebarInner);
