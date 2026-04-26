import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Calendar, Trash2 } from 'lucide-react';
import type { TimelineImageMetadata } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

const TIMELINE_MIN_CARD_WIDTH = 220;
const TIMELINE_GRID_GAP = 12;
const TIMELINE_GROUP_HEADER_HEIGHT = 44;
const TIMELINE_GROUP_BOTTOM_GAP = 40;
const TIMELINE_LOADER_HEIGHT = 88;
const TIMELINE_OVERSCAN_PX = 900;

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

interface TimelineGroup {
  date: string;
  shortDate: string;
  timestamp: number;
  images: TimelineImageMetadata[];
}

interface TimelineLayoutMetrics {
  columnCount: number;
  cardHeight: number;
  viewportHeight: number;
}

type TimelineVirtualRow =
  | {
      type: 'header';
      key: string;
      top: number;
      height: number;
      date: string;
      count: number;
    }
  | {
      type: 'items';
      key: string;
      top: number;
      height: number;
      images: TimelineImageMetadata[];
    }
  | {
      type: 'loader';
      key: string;
      top: number;
      height: number;
    };

function getDateParts(ms: number) {
  const date = new Date(ms);
  return {
    dayStart: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
    label: `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
    shortLabel: `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`,
  };
}

function readTimelineMetrics(element: HTMLDivElement): TimelineLayoutMetrics {
  const style = window.getComputedStyle(element);
  const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const contentWidth = Math.max(1, element.clientWidth - horizontalPadding);
  const columnCount = Math.max(
    1,
    Math.floor((contentWidth + TIMELINE_GRID_GAP) / (TIMELINE_MIN_CARD_WIDTH + TIMELINE_GRID_GAP)),
  );
  const cardWidth = (contentWidth - TIMELINE_GRID_GAP * (columnCount - 1)) / columnCount;

  return {
    columnCount,
    cardHeight: Math.max(132, Math.round(cardWidth * 0.75)),
    viewportHeight: Math.max(1, element.clientHeight),
  };
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
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [armedDeletePath, setArmedDeletePath] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [metrics, setMetrics] = useState<TimelineLayoutMetrics>({
    columnCount: 1,
    cardHeight: 165,
    viewportHeight: 800,
  });

  const groupedImages = useMemo<TimelineGroup[]>(() => {
    const groups = new Map<string, TimelineGroup>();

    images.forEach((img) => {
      const date = getDateParts(img.mtimeMs);
      const group = groups.get(date.label) ?? {
        date: date.label,
        shortDate: date.shortLabel,
        timestamp: date.dayStart,
        images: [],
      };

      group.images.push(img);
      groups.set(date.label, group);
    });

    return Array.from(groups.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [images]);

  const virtualLayout = useMemo(() => {
    const rows: TimelineVirtualRow[] = [];
    const anchors = new Map<string, number>();
    let top = 0;

    groupedImages.forEach((group) => {
      anchors.set(group.date, top);
      rows.push({
        type: 'header',
        key: `header-${group.date}`,
        top,
        height: TIMELINE_GROUP_HEADER_HEIGHT,
        date: group.date,
        count: group.images.length,
      });
      top += TIMELINE_GROUP_HEADER_HEIGHT;

      for (let start = 0; start < group.images.length; start += metrics.columnCount) {
        const rowImages = group.images.slice(start, start + metrics.columnCount);
        rows.push({
          type: 'items',
          key: `items-${group.date}-${start}`,
          top,
          height: metrics.cardHeight,
          images: rowImages,
        });
        top += metrics.cardHeight + TIMELINE_GRID_GAP;
      }

      top += TIMELINE_GROUP_BOTTOM_GAP - TIMELINE_GRID_GAP;
    });

    if (isLoading || hasMore) {
      rows.push({
        type: 'loader',
        key: 'loader',
        top,
        height: TIMELINE_LOADER_HEIGHT,
      });
      top += TIMELINE_LOADER_HEIGHT;
    }

    return {
      anchors,
      rows,
      totalHeight: Math.max(top, metrics.viewportHeight),
    };
  }, [groupedImages, hasMore, isLoading, metrics.cardHeight, metrics.columnCount, metrics.viewportHeight]);

  const visibleRows = useMemo(() => {
    const start = Math.max(0, scrollTop - TIMELINE_OVERSCAN_PX);
    const end = scrollTop + metrics.viewportHeight + TIMELINE_OVERSCAN_PX;

    return virtualLayout.rows.filter((row) => row.top + row.height >= start && row.top <= end);
  }, [metrics.viewportHeight, scrollTop, virtualLayout.rows]);

  useEffect(() => {
    const element = scrollAreaRef.current;
    if (!element) {
      return;
    }

    function updateMetrics() {
      if (!scrollAreaRef.current) {
        return;
      }

      const nextMetrics = readTimelineMetrics(scrollAreaRef.current);
      setMetrics((current) => (
        current.columnCount === nextMetrics.columnCount
        && current.cardHeight === nextMetrics.cardHeight
        && current.viewportHeight === nextMetrics.viewportHeight
          ? current
          : nextMetrics
      ));
    }

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(element);
    window.addEventListener('resize', updateMetrics);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, []);

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
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!armedDeletePath) {
      return;
    }

    const timer = window.setTimeout(() => setArmedDeletePath(null), 2200);
    return () => window.clearTimeout(timer);
  }, [armedDeletePath]);

  useEffect(() => {
    const element = scrollAreaRef.current;
    if (!element || !hasMore || isLoading) {
      return;
    }

    const distanceToBottom = virtualLayout.totalHeight - (scrollTop + metrics.viewportHeight);
    if (distanceToBottom < 1200) {
      onLoadMore();
    }
  }, [hasMore, isLoading, metrics.viewportHeight, onLoadMore, scrollTop, virtualLayout.totalHeight]);

  function handleScroll() {
    const element = scrollAreaRef.current;
    if (!element || scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (scrollAreaRef.current) {
        setScrollTop(scrollAreaRef.current.scrollTop);
      }
    });
  }

  function scrollToGroup(date: string) {
    const element = scrollAreaRef.current;
    const anchorTop = virtualLayout.anchors.get(date);
    if (!element || anchorTop === undefined) {
      return;
    }

    element.scrollTo({
      top: Math.max(0, anchorTop - 12),
      behavior: 'smooth',
    });
  }

  function renderImageCard(img: TimelineImageMetadata) {
    const isDeleteArmed = armedDeletePath === img.path;

    return (
      <div
        key={img.path}
        className={`timeline-item${isDeleteArmed ? ' timeline-item--delete-armed' : ''}`}
        onClick={() => onViewImage(img.path)}
      >
        <img
          src={toLocalMediaUrl(img.path)}
          alt={img.albumName}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <button
          type="button"
          className={`timeline-item__delete${isDeleteArmed ? ' timeline-item__delete--armed' : ''}`}
          title={isDeleteArmed ? '再次点击删除' : '删除照片'}
          disabled={deletingImagePath === img.path}
          onClick={(event) => {
            event.stopPropagation();
            if (isDeleteArmed) {
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
        {isDeleteArmed && (
          <div className="timeline-item__delete-prompt">
            <Trash2 size={14} />
            <span>{deletingImagePath === img.path ? '删除中...' : '再次点击删除'}</span>
          </div>
        )}
      </div>
    );
  }

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
        <div ref={scrollAreaRef} className="timeline-gallery__scroll-area" onScroll={handleScroll}>
          <div className="timeline-gallery__virtual" style={{ height: virtualLayout.totalHeight }}>
            {visibleRows.map((row) => {
              const rowStyle = {
                height: row.height,
                transform: `translateY(${row.top}px)`,
              };

              if (row.type === 'header') {
                return (
                  <section
                    key={row.key}
                    className="timeline-virtual-row timeline-virtual-row--header"
                    style={rowStyle}
                  >
                    <header className="timeline-group__header">
                      <h3>{row.date}</h3>
                      <span className="timeline-group__count">{row.count} 张</span>
                    </header>
                  </section>
                );
              }

              if (row.type === 'loader') {
                return (
                  <div
                    key={row.key}
                    className="timeline-virtual-row timeline-virtual-row--loader timeline-gallery__loader"
                    style={rowStyle}
                  >
                    <span>{isLoading ? '正在加载更多照片...' : '向下滚动继续加载'}</span>
                  </div>
                );
              }

              return (
                <div
                  key={row.key}
                  className="timeline-virtual-row timeline-virtual-row--items"
                  style={rowStyle}
                >
                  <div
                    className="timeline-grid timeline-grid--virtual"
                    style={{
                      gap: TIMELINE_GRID_GAP,
                      gridTemplateColumns: `repeat(${metrics.columnCount}, minmax(0, 1fr))`,
                    }}
                  >
                    {row.images.map(renderImageCard)}
                  </div>
                </div>
              );
            })}

            {images.length === 0 && !isLoading && (
              <div className="timeline-gallery__empty">
                <Calendar size={22} />
                <span>还没有可展示的照片。</span>
              </div>
            )}
          </div>
        </div>

        <nav className="timeline-anchor-sidebar">
          {groupedImages.map((group) => (
            <button
              key={group.date}
              type="button"
              className="timeline-anchor-item"
              onClick={() => scrollToGroup(group.date)}
            >
              {group.shortDate}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
