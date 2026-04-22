import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimelineImageMetadata } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';
import { ArrowLeft, Calendar, Trash2 } from 'lucide-react';

interface TimelineGalleryProps {
  deletingImagePath: string | null;
  images: TimelineImageMetadata[];
  hasMore: boolean;
  isLoading: boolean;
  total: number;
  onDeleteImage: (image: TimelineImageMetadata) => void;
  onLoadMore: () => void;
  onViewImage: (path: string) => void;
  onClose: () => void;
}

export function TimelineGallery({
  deletingImagePath,
  images,
  hasMore,
  isLoading,
  total,
  onDeleteImage,
  onLoadMore,
  onViewImage,
  onClose,
}: TimelineGalleryProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [armedDeletePath, setArmedDeletePath] = useState<string | null>(null);

  const groupedImages = useMemo(() => {
    const groups: Record<string, typeof images> = {};
    
    images.forEach((img) => {
      const date = new Date(img.mtimeMs);
      const dateKey = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(img);
    });

    return Object.entries(groups).sort((a, b) => {
      const timeA = new Date(a[1][0].mtimeMs).getTime();
      const timeB = new Date(b[1][0].mtimeMs).getTime();
      return timeB - timeA;
    });
  }, [images]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { rootMargin: '320px 0px' },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, images.length]);

  useEffect(() => {
    if (!armedDeletePath) {
      return;
    }

    const timer = window.setTimeout(() => setArmedDeletePath(null), 2200);
    return () => window.clearTimeout(timer);
  }, [armedDeletePath]);

  return (
    <div className="timeline-gallery">
      <div className="timeline-gallery__header">
        <button type="button" className="timeline-gallery__back" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>返回地图</span>
        </button>
        <Calendar size={20} />
        <h2>全量照片时间线</h2>
        <span className="timeline-gallery__count">已加载 {images.length} / {total || images.length} 张照片</span>
      </div>

      <div className="timeline-gallery__main">
        <div className="timeline-gallery__scroll-area">
          {groupedImages.map(([date, group]) => (
            <section key={date} id={`anchor-${date}`} className="timeline-group">
              <header className="timeline-group__header">
              <h3>{date}</h3>
              <span className="timeline-group__count">{group.length} 张</span>
            </header>
            <div className="timeline-grid">
              {group.map((img) => (
                <div
                  key={img.path}
                  className={`timeline-item${armedDeletePath === img.path ? ' timeline-item--delete-armed' : ''}`}
                  onClick={() => onViewImage(img.path)}
                >
                  <img
                    src={toLocalMediaUrl(img.path)}
                    alt={img.albumName}
                    loading="lazy"
                  />
                  <button
                    type="button"
                    className={`timeline-item__delete${armedDeletePath === img.path ? ' timeline-item__delete--armed' : ''}`}
                    title={armedDeletePath === img.path ? '再次点击删除' : '删除照片'}
                    disabled={deletingImagePath === img.path}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (armedDeletePath === img.path) {
                        setArmedDeletePath(null);
                        onDeleteImage(img);
                        return;
                      }
                      setArmedDeletePath(img.path);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="timeline-item__overlay">
                    <span>{img.albumName}</span>
                  </div>
                  {armedDeletePath === img.path && (
                    <div className="timeline-item__delete-prompt">
                      <Trash2 size={14} />
                      <span>{deletingImagePath === img.path ? '删除中...' : '再次点击删除'}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

          {(isLoading || hasMore) && (
            <div ref={sentinelRef} className="timeline-gallery__loader">
              <span>{isLoading ? '正在加载更多照片...' : '向下滚动继续加载'}</span>
            </div>
          )}
        </div>

        <nav className="timeline-anchor-sidebar">
          {groupedImages.map(([date]) => {
            const shortDate = date.replace(/年|月/g, '.').replace(/日/, '');
            return (
              <button
                key={date}
                type="button"
                className="timeline-anchor-item"
                onClick={() => {
                  const el = document.getElementById(`anchor-${date}`);
                  const container = document.querySelector('.timeline-gallery__scroll-area');
                  if (el && container) {
                    const topOffset = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
                    container.scrollTo({
                      top: container.scrollTop + topOffset - 40,
                      behavior: 'smooth'
                    });
                  }
                }}
              >
                {shortDate}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
