import { memo, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Clock,
  FileText,
  Image as ImageIcon,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AlbumSummary, ImageMetadata, LocationDraft } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

interface InspectorPanelProps {
  albumImages: ImageMetadata[];
  deletingImagePath: string | null;
  draftLocation: LocationDraft | null;
  isAlbumImagesLoading: boolean;
  isSaving: boolean;
  selectedAlbum: AlbumSummary | null;
  stagedImages: string[];
  onAddImagesToAlbum: (album: AlbumSummary, sourcePaths: string[]) => Promise<void>;
  onChooseImages: () => Promise<void>;
  onCloseDraft: () => void;
  onCloseSelectedAlbum: () => void;
  onCreateAlbum: (location: LocationDraft, sourcePaths: string[]) => Promise<void>;
  onDeleteImage: (relativePath: string, imagePath: string) => Promise<void>;
  onRemoveStagedImage: (imagePath: string) => void;
  onSetCover: (album: AlbumSummary, imageName: string) => Promise<void>;
  onSetNote: (album: AlbumSummary, note: string) => Promise<void>;
  onViewImage: (imagePath: string) => void;
}

function formatCoordinates(lng: number, lat: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatDateTime(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function InspectorPanelInner({
  albumImages,
  deletingImagePath,
  draftLocation,
  isAlbumImagesLoading,
  isSaving,
  selectedAlbum,
  stagedImages,
  onAddImagesToAlbum,
  onChooseImages,
  onCloseDraft,
  onCloseSelectedAlbum,
  onCreateAlbum,
  onDeleteImage,
  onRemoveStagedImage,
  onSetCover,
  onSetNote,
  onViewImage,
}: InspectorPanelProps) {
  const [noteDraft, setNoteDraft] = useState('');
  const [noteIdentity, setNoteIdentity] = useState('');
  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [armedDeletePath, setArmedDeletePath] = useState<string | null>(null);

  const currentNoteIdentity = selectedAlbum ? `${selectedAlbum.relativePath}\n${selectedAlbum.note ?? ''}` : '';
  if (currentNoteIdentity !== noteIdentity) {
    setNoteIdentity(currentNoteIdentity);
    setNoteDraft(selectedAlbum?.note ?? '');
    setIsNoteEditing(false);
    setIsNoteSaving(false);
  }

  useEffect(() => {
    if (!armedDeletePath) {
      return;
    }

    const timer = window.setTimeout(() => setArmedDeletePath(null), 2200);
    return () => window.clearTimeout(timer);
  }, [armedDeletePath]);

  const orderedAlbumImages = selectedAlbum?.coverPath
    ? [...albumImages].sort((left, right) => {
        if (left.path === selectedAlbum.coverPath) {
          return -1;
        }
        if (right.path === selectedAlbum.coverPath) {
          return 1;
        }
        return 0;
      })
    : albumImages;

  const primaryImage = selectedAlbum?.coverPath ?? orderedAlbumImages[0]?.path ?? selectedAlbum?.previewPaths[0] ?? null;
  const isPanelOpen = Boolean(draftLocation || selectedAlbum || stagedImages.length > 0);

  async function handleSubmit() {
    if (stagedImages.length === 0 || isSaving) {
      return;
    }

    if (draftLocation) {
      await onCreateAlbum(draftLocation, stagedImages);
      return;
    }

    if (selectedAlbum) {
      await onAddImagesToAlbum(selectedAlbum, stagedImages);
    }
  }

  async function handleSaveNote() {
    if (!selectedAlbum || isNoteSaving) {
      return;
    }

    setIsNoteSaving(true);
    try {
      await onSetNote(selectedAlbum, noteDraft);
      setIsNoteEditing(false);
    } finally {
      setIsNoteSaving(false);
    }
  }

  if (!isPanelOpen) {
    return (
      <aside className="inspector inspector--idle">
        <div className="inspector-empty">
          <MapPin size={22} />
          <strong>选择地点</strong>
          <span>地图标记或相册卡片会在这里打开详情。</span>
        </div>
      </aside>
    );
  }

  if (selectedAlbum) {
    return (
      <aside className="inspector inspector--open">
        <header className="inspector-topbar">
          <button type="button" className="icon-button" onClick={onCloseSelectedAlbum} title="返回地图">
            <ArrowLeft size={18} />
          </button>
          <strong>{selectedAlbum.displayName}</strong>
          <button type="button" className="icon-button" onClick={() => void onChooseImages()} title="追加图片">
            <Plus size={18} />
          </button>
        </header>

        <div className="inspector-scroll">
          <button
            type="button"
            className="detail-hero"
            onClick={() => {
              if (primaryImage) {
                onViewImage(primaryImage);
              }
            }}
          >
            {primaryImage ? (
              <img src={toLocalMediaUrl(primaryImage)} alt={selectedAlbum.displayName} draggable={false} />
            ) : (
              <span>
                <ImageIcon size={28} />
              </span>
            )}
          </button>

          <div className="thumb-strip">
            {isAlbumImagesLoading && <span className="thumb-strip__loading">加载中...</span>}
            {!isAlbumImagesLoading && orderedAlbumImages.slice(0, 6).map((entry) => {
              const imageName = getFileName(entry.path);
              const isCover = selectedAlbum.coverPath === entry.path;
              const isDeleteArmed = armedDeletePath === entry.path;
              const isDeleting = deletingImagePath === entry.path;

              return (
                <figure key={entry.path} className={`detail-thumb${isCover ? ' detail-thumb--cover' : ''}`}>
                  <button type="button" onClick={() => onViewImage(entry.path)}>
                    <img src={toLocalMediaUrl(entry.path)} alt={imageName} loading="lazy" decoding="async" draggable={false} />
                  </button>
                  <div className="detail-thumb__actions">
                    {!isCover && (
                      <button type="button" title="设为封面" onClick={() => void onSetCover(selectedAlbum, imageName)}>
                        <Star size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      title={isDeleteArmed ? '再次点击删除' : '删除照片'}
                      disabled={isDeleting}
                      className={isDeleteArmed ? 'is-armed' : ''}
                      onClick={() => {
                        if (isDeleteArmed) {
                          setArmedDeletePath(null);
                          void onDeleteImage(selectedAlbum.relativePath, entry.path);
                          return;
                        }
                        setArmedDeletePath(entry.path);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </figure>
              );
            })}
            {orderedAlbumImages.length > 6 && <button type="button" className="thumb-more">+{orderedAlbumImages.length - 6}</button>}
          </div>

          <section className="detail-card">
            <h3>地点信息</h3>
            <dl className="detail-list">
              <div>
                <dt>
                  <MapPin size={15} />
                  坐标
                </dt>
                <dd>{formatCoordinates(selectedAlbum.lng, selectedAlbum.lat)}</dd>
              </div>
              <div>
                <dt>
                  <ImageIcon size={15} />
                  照片
                </dt>
                <dd>{selectedAlbum.imageCount} 张</dd>
              </div>
            </dl>
          </section>

          <section className="detail-card">
            <div className="detail-card__title">
              <h3>地点备注</h3>
              <button type="button" className="icon-button icon-button--small" onClick={() => setIsNoteEditing((value) => !value)}>
                <Pencil size={14} />
              </button>
            </div>
            {isNoteEditing ? (
              <div className="note-editor">
                <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={4} />
                <div>
                  <button type="button" className="button button--ghost" onClick={() => setIsNoteEditing(false)}>
                    取消
                  </button>
                  <button type="button" className="button button--primary" disabled={isNoteSaving} onClick={handleSaveNote}>
                    {isNoteSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            ) : (
              <p className={selectedAlbum.note ? 'note-text' : 'note-text note-text--empty'}>
                {selectedAlbum.note || '暂无备注'}
              </p>
            )}
          </section>

          <section className="detail-card detail-card--time">
            <h3>拍摄时间</h3>
            <div className="time-row">
              <Clock size={16} />
              <span>{formatDateTime(selectedAlbum.updatedAt)}</span>
            </div>
          </section>

          {stagedImages.length > 0 && (
            <section className="detail-card">
              <h3>待追加照片</h3>
              <ImportList stagedImages={stagedImages} onRemove={onRemoveStagedImage} />
              <button className="button button--primary button--full" disabled={isSaving} onClick={handleSubmit}>
                <Upload size={16} />
                <span>{isSaving ? '保存中...' : '追加到当前相册'}</span>
              </button>
            </section>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector inspector--open">
      <header className="inspector-topbar">
        <button type="button" className="icon-button" onClick={draftLocation ? onCloseDraft : () => undefined} title="关闭">
          <X size={18} />
        </button>
        <strong>{draftLocation ? '新建地点' : '导入照片'}</strong>
        <button type="button" className="icon-button" onClick={() => void onChooseImages()} title="选择图片">
          <Plus size={18} />
        </button>
      </header>

      <div className="inspector-scroll">
        {draftLocation && (
          <section className="detail-card detail-card--draft">
            <h3>{draftLocation.displayName}</h3>
            <dl className="detail-list">
              <div>
                <dt>
                  <MapPin size={15} />
                  坐标
                </dt>
                <dd>{formatCoordinates(draftLocation.lng, draftLocation.lat)}</dd>
              </div>
              <div>
                <dt>
                  <FileText size={15} />
                  目录
                </dt>
                <dd>{draftLocation.relativePath}</dd>
              </div>
            </dl>
          </section>
        )}

        <section className="detail-card">
          <h3>导入照片</h3>
          <ImportList stagedImages={stagedImages} onRemove={onRemoveStagedImage} />
          <div className="import-actions">
            <button type="button" className="button button--ghost" onClick={() => void onChooseImages()}>
              选择图片
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={isSaving || stagedImages.length === 0 || !draftLocation}
              onClick={handleSubmit}
            >
              {isSaving ? '保存中...' : '创建相册'}
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}

function ImportList({
  stagedImages,
  onRemove,
}: {
  stagedImages: string[];
  onRemove: (imagePath: string) => void;
}) {
  if (stagedImages.length === 0) {
    return <p className="empty-copy">暂无待导入照片</p>;
  }

  return (
    <div className="import-list">
      {stagedImages.map((imagePath) => (
        <div key={imagePath} className="import-row">
          <ImageIcon size={14} />
          <span>{getFileName(imagePath)}</span>
          <button type="button" className="icon-button icon-button--small" onClick={() => onRemove(imagePath)} title="移除">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export const InspectorPanel = memo(InspectorPanelInner);
