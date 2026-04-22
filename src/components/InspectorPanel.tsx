import { memo, useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, MapPin, Plus, Star, Trash2, Upload, X } from 'lucide-react';
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
  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [armedDeletePath, setArmedDeletePath] = useState<string | null>(null);

  const title = useMemo(() => {
    if (draftLocation) {
      return draftLocation.displayName;
    }

    if (selectedAlbum) {
      return selectedAlbum.displayName;
    }

    if (stagedImages.length > 0) {
      return '待处理照片';
    }

    return '等待操作';
  }, [draftLocation, selectedAlbum, stagedImages.length]);

  useEffect(() => {
    setNoteDraft(selectedAlbum?.note ?? '');
    setIsNoteEditing(false);
    setIsNoteSaving(false);
  }, [selectedAlbum?.relativePath, selectedAlbum?.note]);

  useEffect(() => {
    if (!armedDeletePath) {
      return;
    }

    const timer = window.setTimeout(() => setArmedDeletePath(null), 2200);
    return () => window.clearTimeout(timer);
  }, [armedDeletePath]);

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

  const isPanelOpen = Boolean(draftLocation || selectedAlbum || stagedImages.length > 0);
  const orderedAlbumImages = useMemo(() => {
    if (!selectedAlbum?.coverPath) {
      return albumImages;
    }

    return [...albumImages].sort((left, right) => {
      if (left.path === selectedAlbum.coverPath) {
        return -1;
      }
      if (right.path === selectedAlbum.coverPath) {
        return 1;
      }
      return 0;
    });
  }, [albumImages, selectedAlbum?.coverPath]);

  return (
    <aside className={`inspector${isPanelOpen ? ' inspector--open' : ''}`}>
      <div className="inspector__header">
        <div>
          <p className="sidebar__eyebrow">
            {draftLocation
              ? '新建地点'
              : selectedAlbum
                ? '相册详情'
                : stagedImages.length > 0
                  ? '待导入'
                  : '工作区'}
          </p>
          <h2>{title}</h2>
        </div>
        {(draftLocation || selectedAlbum) && (
          <button
            className="icon-button"
            onClick={draftLocation ? onCloseDraft : onCloseSelectedAlbum}
            title="关闭"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {!draftLocation && !selectedAlbum && stagedImages.length === 0 && (
        <div className="placeholder-block placeholder-block--large">
          <p>可以在地图上手动选点，也可以先用左侧的手机上传功能接收照片。</p>
          <p>如果上传的照片带有 EXIF GPS 信息，MapAlbum 会自动尝试定位。</p>
        </div>
      )}

      {(draftLocation || selectedAlbum || stagedImages.length > 0) && (
        <div className={`inspector__content${selectedAlbum ? ' inspector__content--album' : ''}`}>
          {(draftLocation || selectedAlbum) && (
            <section className="inspector__section">
              <div className="inspector__tag">
                <MapPin size={14} />
                <span>{formatCoordinates((draftLocation ?? selectedAlbum)!.lng, (draftLocation ?? selectedAlbum)!.lat)}</span>
              </div>
              <p className="inspector__path">{(draftLocation ?? selectedAlbum)!.relativePath}</p>
              <p className="inspector__hint">
                {draftLocation
                  ? '这个地点草稿来自地图选点或照片 GPS，已经可以直接创建新相册。'
                  : `当前相册共有 ${selectedAlbum?.imageCount ?? 0} 张照片，你可以继续从本地或手机追加图片。`}
              </p>
            </section>
          )}

          {selectedAlbum && (
            <section className="inspector__section">
              <div className="inspector__section-title">
                <h3>地点留言</h3>
                {!isNoteEditing ? (
                  <button className="button button--ghost" onClick={() => setIsNoteEditing(true)}>
                    <span>{selectedAlbum.note ? '修改留言' : '添加留言'}</span>
                  </button>
                ) : (
                  <div className="inspector__note-actions">
                    <button className="button button--ghost" onClick={() => { setNoteDraft(selectedAlbum.note ?? ''); setIsNoteEditing(false); }}>
                      <span>取消</span>
                    </button>
                    <button className="button button--primary" disabled={isNoteSaving} onClick={handleSaveNote}>
                      <span>{isNoteSaving ? '保存中...' : '保存留言'}</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="inspector__note-card">
                <div className="inspector__note-icon">
                  <FileText size={16} />
                </div>
                {isNoteEditing ? (
                  <textarea
                    className="inspector__note-input"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    placeholder="给这个地点写点备注、回忆或者提醒..."
                    rows={4}
                  />
                ) : (
                  <p className={`inspector__note-text${selectedAlbum.note ? '' : ' inspector__note-text--placeholder'}`}>
                    {selectedAlbum.note || '还没有留言，添加后会在地图气泡悬停时显示预览。'}
                  </p>
                )}
              </div>
            </section>
          )}

          {!draftLocation && !selectedAlbum && stagedImages.length > 0 && (
            <section className="inspector__section">
              <p className="inspector__hint">照片已经准备好，请先在地图上选一个地点，再保存到相册。</p>
            </section>
          )}

          <section className={`inspector__section${selectedAlbum ? ' inspector__section--photos' : ''}`}>
            <div className="inspector__section-title">
              <h3>{selectedAlbum ? '相册照片' : '待处理照片'}</h3>
              <button className="button button--ghost" onClick={onChooseImages}>
                <Plus size={16} />
                <span>选择图片</span>
              </button>
            </div>

            <div className={`chip-grid${selectedAlbum ? ' chip-grid--compact' : ''}`}>
              {stagedImages.length === 0 && !selectedAlbum && <p className="muted-line">暂时还没有选择图片。</p>}
              {stagedImages.map((imagePath) => (
                <div key={imagePath} className="file-chip">
                  <ImageIcon size={14} />
                  <span>{imagePath.split(/[\\/]/).pop()}</span>
                  <button
                    className="icon-button icon-button--small"
                    onClick={() => onRemoveStagedImage(imagePath)}
                    title="移除"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {stagedImages.length > 0 && (
              <button
                className="button button--primary button--full"
                disabled={isSaving || (!draftLocation && !selectedAlbum)}
                onClick={handleSubmit}
              >
                <Upload size={16} />
                <span>
                  {isSaving
                    ? '保存中...'
                    : draftLocation
                      ? '按当前地点创建相册'
                      : selectedAlbum
                        ? '追加到当前相册'
                        : '请先在地图上选点'}
                </span>
              </button>
            )}

            {selectedAlbum && (
              <div className="photo-grid">
                {isAlbumImagesLoading && <p className="muted-line">正在加载相册图片...</p>}
                {!isAlbumImagesLoading && orderedAlbumImages.length === 0 && <p className="muted-line">当前相册还没有照片。</p>}
                {orderedAlbumImages.map((entry) => {
                  const imagePath = entry.path;
                  const imageName = imagePath.split(/[\\/]/).pop() || '';
                  const isCover = selectedAlbum.coverPath === imagePath;
                  const isDeleteArmed = armedDeletePath === imagePath;
                  const isDeleting = deletingImagePath === imagePath;

                  return (
                    <figure
                      key={imagePath}
                      className={`photo-card${isDeleteArmed ? ' photo-card--delete-armed' : ''}`}
                      onClick={() => onViewImage(imagePath)}
                    >
                      <div className="photo-card__media">
                        <img src={toLocalMediaUrl(imagePath)} alt={selectedAlbum.displayName} loading="lazy" decoding="async" draggable={false} />
                        {isCover && !isDeleteArmed && (
                          <span className="photo-card__cover-badge">
                            封面
                          </span>
                        )}
                        <div className="photo-card__actions">
                          {!isCover && (
                            <button
                              className="photo-card__action"
                              title="设为封面"
                              onClick={(event) => {
                                event.stopPropagation();
                                void onSetCover(selectedAlbum, imageName);
                              }}
                            >
                              <Star size={16} />
                            </button>
                          )}
                          <button
                            className={`photo-card__action photo-card__action--danger${isDeleteArmed ? ' photo-card__action--danger-armed' : ''}`}
                            title={isDeleteArmed ? '再次点击删除' : '删除照片'}
                            disabled={isDeleting}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (isDeleteArmed) {
                                setArmedDeletePath(null);
                                void onDeleteImage(selectedAlbum.relativePath, imagePath);
                                return;
                              }
                              setArmedDeletePath(imagePath);
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </figure>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </aside>
  );
}

export const InspectorPanel = memo(InspectorPanelInner);
