import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Image as ImageIcon, MapPin, Trash2 } from 'lucide-react';
import type { TimelineImageMetadata } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

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

function formatMonthLabel(value: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { year: '未知', month: '', title: '未知时间' };
  }

  return {
    year: `${date.getFullYear()}年`,
    month: `${date.getMonth() + 1}月`,
    title: `${date.getFullYear()}年${date.getMonth() + 1}月`,
  };
}

function formatDate(value: number) {
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

export function TimelineGallery({
  deletingImagePath,
  images,
  hasMore,
  isLoading,
  total,
  onDeleteImage,
  onLoadMore,
  onViewImage,
}: TimelineGalleryProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [armedDeletePath, setArmedDeletePath] = useState<string | null>(null);

  const rows = useMemo(() => {
    const groups = new Map<string, TimelineImageMetadata[]>();

    images.forEach((img) => {
      const date = new Date(img.mtimeMs);
      const key = Number.isNaN(date.getTime()) ? 'unknown' : `${date.getFullYear()}-${date.getMonth() + 1}`;
      groups.set(key, [...(groups.get(key) ?? []), img]);
    });

    return Array.from(groups.values()).map((group) => {
      const first = group[0];
      const label = formatMonthLabel(first?.mtimeMs ?? Date.now());
      return {
        key: `${label.title}-${first?.path ?? group.length}`,
        label,
        images: group,
      };
    });
  }, [images]);

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
  }, [hasMore, images.length, onLoadMore]);

  useEffect(() => {
    if (!armedDeletePath) {
      return;
    }

    const timer = window.setTimeout(() => setArmedDeletePath(null), 2200);
    return () => window.clearTimeout(timer);
  }, [armedDeletePath]);

  return (
    <section className="board timeline-page">
      <header className="timeline-page__header">
        <div>
          <h1>时间线</h1>
          <p>按时间整理所有相册照片</p>
        </div>
        <span>{images.length} / {total || images.length} 张照片</span>
      </header>

      <div className="timeline-road">
        {rows.length === 0 && (
          <div className="empty-panel">
            <span><Calendar size={28} /></span>
            <strong>{isLoading ? '正在加载时间线...' : '暂无时间线照片'}</strong>
          </div>
        )}

        {rows.map((row) => {
          const primary = row.images[0];
          const preview = row.images.slice(0, 4);
          const last = row.images[row.images.length - 1] ?? primary;

          return (
            <article key={row.key} className="timeline-row">
              <div className="timeline-row__date">
                <strong>{row.label.year}</strong>
                <span>{row.label.month}</span>
              </div>
              <div className="timeline-row__dot" />
              <button type="button" className="timeline-row__cover" onClick={() => primary && onViewImage(primary.path)}>
                {primary ? (
                  <img src={toLocalMediaUrl(primary.path)} alt={primary.albumName} loading="lazy" decoding="async" draggable={false} />
                ) : (
                  <ImageIcon size={22} />
                )}
              </button>
              <div className="timeline-row__body">
                <strong>{primary?.albumName ?? '未命名相册'}</strong>
                <span>{formatDate(primary?.mtimeMs ?? Date.now())} - {formatDate(last?.mtimeMs ?? Date.now())}</span>
                <small>{row.images.length} 张照片</small>
              </div>
              <div className="timeline-row__thumbs">
                {preview.map((img) => (
                  <button key={img.path} type="button" onClick={() => onViewImage(img.path)}>
                    <img src={toLocalMediaUrl(img.path)} alt={img.albumName} loading="lazy" decoding="async" draggable={false} />
                  </button>
                ))}
              </div>
              <div className="timeline-row__map">
                <MapPin size={17} />
              </div>
              {primary && (
                <button
                  type="button"
                  className={`timeline-row__delete${armedDeletePath === primary.path ? ' is-armed' : ''}`}
                  title={armedDeletePath === primary.path ? '再次点击删除' : '删除照片'}
                  disabled={deletingImagePath === primary.path}
                  onClick={() => {
                    if (armedDeletePath === primary.path) {
                      setArmedDeletePath(null);
                      onDeleteImage(primary);
                      return;
                    }
                    setArmedDeletePath(primary.path);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </article>
          );
        })}

        {(isLoading || hasMore) && (
          <div ref={sentinelRef} className="timeline-loader">
            {isLoading ? '正在加载更多照片...' : '向下滚动继续加载'}
          </div>
        )}
      </div>
    </section>
  );
}
