import { memo, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
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
  }).format(date).replaceAll('/', '.');
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function getAlbumAddress(album: AlbumSummary | LocationDraft) {
  return [album.province, album.city, album.district, album.township].filter(Boolean).join(' / ') || '未知地址';
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

  const orderedAlbumImages = useMemo(() => {
    if (!selectedAlbum?.coverPath) {
      return albumImages;
    }

    return [...albumImages].sort((left, right) => {
      if (left.path === selectedAlbum.coverPath) return -1;
      if (right.path === selectedAlbum.coverPath) return 1;
      return 0;
    });
  }, [albumImages, selectedAlbum?.coverPath]);

  const photoPaths = selectedAlbum
    ? (orderedAlbumImages.length > 0 ? orderedAlbumImages.map((entry) => entry.path) : selectedAlbum.previewPaths)
    : [];

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

  function closePanel() {
    if (selectedAlbum) {
      onCloseSelectedAlbum();
    }
    if (draftLocation) {
      onCloseDraft();
    }
    if (!selectedAlbum && !draftLocation) {
      stagedImages.forEach(onRemoveStagedImage);
    }
  }

  if (!isPanelOpen) {
    return null;
  }

  if (selectedAlbum) {
    const coverPath = selectedAlbum.coverPath ?? photoPaths[0] ?? null;

    return (
      <div className="dialog-layer">
        <section className="dialog dialog--photo-info">
          <header className="dialog__header">
            <h2>照片信息</h2>
            <button type="button" className="icon-button" onClick={onCloseSelectedAlbum} title="关闭">
              <X size={17} />
            </button>
          </header>

          <div className="photo-info-grid">
            <div>
              <div className="photo-info-preview">
                {coverPath ? (
                  <img src={toLocalMediaUrl(coverPath)} alt={selectedAlbum.displayName} loading="lazy" decoding="async" draggable={false} />
                ) : (
                  <ImageIcon size={42} />
                )}
              </div>
              <div className="photo-info-actions">
                <button type="button" className="icon-button" title="查看封面" onClick={() => coverPath && onViewImage(coverPath)}>
                  <ImageIcon size={15} />
                </button>
                <button type="button" className="icon-button" title="选择图片" onClick={() => void onChooseImages()}>
                  <Plus size={15} />
                </button>
                <button type="button" className="icon-button" title="编辑留言" onClick={() => setIsNoteEditing(true)}>
                  <Pencil size={15} />
                </button>
              </div>
            </div>

            <div className="photo-info-meta">
              <dl>
                <div><dt>文件名</dt><dd>{getFileName(coverPath ?? selectedAlbum.relativePath)}</dd></div>
                <div><dt>拍摄时间</dt><dd>{formatDateTime(selectedAlbum.updatedAt)}</dd></div>
                <div><dt>拍摄地点</dt><dd>{getAlbumAddress(selectedAlbum)}</dd></div>
                <div><dt>坐标</dt><dd>{formatCoordinates(selectedAlbum.lng, selectedAlbum.lat)}</dd></div>
                <div><dt>大小</dt><dd>{selectedAlbum.imageCount} 张照片</dd></div>
                <div><dt>设备</dt><dd>本地相册</dd></div>
                <div><dt>路径</dt><dd>{selectedAlbum.relativePath}</dd></div>
              </dl>
            </div>
          </div>

          <section className="dialog-section">
            <div className="dialog-section__head">
              <h3>相册照片</h3>
              <button type="button" className="button button--ghost button--compact" onClick={() => void onChooseImages()}>
                <Plus size={13} />
                <span>添加照片</span>
              </button>
            </div>
            {isAlbumImagesLoading ? (
              <p className="empty-copy">正在加载照片...</p>
            ) : photoPaths.length > 0 ? (
              <div className="dialog-photo-grid">
                {photoPaths.slice(0, 8).map((imagePath) => {
                  const imageName = getFileName(imagePath);
                  const isCover = selectedAlbum.coverPath === imagePath;
                  const isDeleteArmed = armedDeletePath === imagePath;
                  const isDeleting = deletingImagePath === imagePath;

                  return (
                    <figure key={imagePath} className={isCover ? 'is-cover' : ''}>
                      <button type="button" onClick={() => onViewImage(imagePath)}>
                        <img src={toLocalMediaUrl(imagePath)} alt={imageName} loading="lazy" decoding="async" draggable={false} />
                      </button>
                      <figcaption>{isCover ? '封面' : imageName}</figcaption>
                      <div>
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
                              void onDeleteImage(selectedAlbum.relativePath, imagePath);
                              return;
                            }
                            setArmedDeletePath(imagePath);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </figure>
                  );
                })}
              </div>
            ) : (
              <p className="empty-copy">这个地点还没有照片。</p>
            )}
          </section>

          <section className="dialog-section">
            <div className="dialog-section__head">
              <h3>地点留言</h3>
              <button type="button" className="button button--ghost button--compact" onClick={() => setIsNoteEditing((value) => !value)}>
                <FileText size={13} />
                <span>{isNoteEditing ? '收起' : '编辑'}</span>
              </button>
            </div>
            {isNoteEditing ? (
              <div className="note-editor">
                <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={3} />
                <div>
                  <button type="button" className="button button--ghost" onClick={() => setIsNoteEditing(false)}>取消</button>
                  <button type="button" className="button button--primary" disabled={isNoteSaving} onClick={handleSaveNote}>
                    {isNoteSaving ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="note-text">{selectedAlbum.note || '还没有留言，添加后会在相册详情中显示。'}</p>
            )}
          </section>

          {stagedImages.length > 0 && (
            <section className="dialog-section">
              <h3>待追加照片</h3>
              <ImportList stagedImages={stagedImages} onRemove={onRemoveStagedImage} />
              <button type="button" className="button button--primary button--full" disabled={isSaving} onClick={handleSubmit}>
                <Upload size={15} />
                <span>{isSaving ? '保存中...' : '追加到当前相册'}</span>
              </button>
            </section>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="dialog-layer">
      <section className="dialog dialog--import">
        <header className="dialog__header">
          <h2>{draftLocation ? '新建相册' : '导入本地文件夹'}</h2>
          <button type="button" className="icon-button" onClick={closePanel} title="关闭">
            <X size={17} />
          </button>
        </header>

        {draftLocation ? (
          <div className="draft-summary">
            <MapPin size={19} />
            <span>
              <strong>{draftLocation.displayName}</strong>
              <small>{getAlbumAddress(draftLocation)} · {formatCoordinates(draftLocation.lng, draftLocation.lat)}</small>
            </span>
          </div>
        ) : (
          <div className="draft-summary draft-summary--warning">
            <AlertTriangle size={19} />
            <span>
              <strong>请先在地图上选择地点</strong>
              <small>选择地点后，可以把待导入照片保存为新的地点相册。</small>
            </span>
          </div>
        )}

        <label className="form-row">
          <span>选择要导入的照片</span>
          <div>
            <strong>{stagedImages.length > 0 ? `${stagedImages.length} 张照片已选择` : '尚未选择照片'}</strong>
            <button type="button" className="button button--ghost" onClick={() => void onChooseImages()}>
              浏览
            </button>
          </div>
        </label>

        <label className="check-row">
          <input type="checkbox" defaultChecked />
          <span>包含子文件夹</span>
        </label>
        <label className="check-row">
          <input type="checkbox" defaultChecked />
          <span>导入后自动定位相册（GPS）</span>
        </label>

        <ImportList stagedImages={stagedImages} onRemove={onRemoveStagedImage} />

        <footer className="dialog__actions">
          <button type="button" className="button button--ghost" onClick={closePanel}>取消</button>
          <button
            type="button"
            className="button button--primary"
            disabled={isSaving || stagedImages.length === 0 || !draftLocation}
            onClick={handleSubmit}
          >
            {isSaving ? '保存中...' : '开始导入'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ImportList({
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
      {stagedImages.slice(0, 5).map((imagePath) => (
        <div key={imagePath} className="import-row">
          <ImageIcon size={14} />
          <span>{getFileName(imagePath)}</span>
          <button type="button" className="icon-button icon-button--small" onClick={() => onRemove(imagePath)} title="移除">
            <X size={13} />
          </button>
        </div>
      ))}
      {stagedImages.length > 5 && <small>还有 {stagedImages.length - 5} 张照片</small>}
    </div>
  );
}

export const InspectorPanel = memo(InspectorPanelInner);
