import { memo, useMemo } from 'react';
import { CheckCircle2, Circle, LocateFixed, Upload, X } from 'lucide-react';
import type { StagedImageItem } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

interface StagedImportPanelProps {
  isBesideInspector: boolean;
  isSaving: boolean;
  selectedStagedImagePaths: string[];
  stagedImages: StagedImageItem[];
  onClearStagedImageSelection: () => void;
  onRemoveStagedImage: (imagePath: string) => void;
  onSaveStagedImages: () => Promise<void>;
  onSelectUnlocatedStagedImages: () => void;
  onToggleStagedImageSelection: (imagePath: string) => void;
}

function StagedImportPanelInner({
  isBesideInspector,
  isSaving,
  selectedStagedImagePaths,
  stagedImages,
  onClearStagedImageSelection,
  onRemoveStagedImage,
  onSaveStagedImages,
  onSelectUnlocatedStagedImages,
  onToggleStagedImageSelection,
}: StagedImportPanelProps) {
  const selectedStagedPathSet = useMemo(() => new Set(selectedStagedImagePaths), [selectedStagedImagePaths]);
  const locatedStagedCount = useMemo(
    () => stagedImages.filter((item) => Boolean(item.location)).length,
    [stagedImages],
  );
  const unlocatedStagedCount = stagedImages.length - locatedStagedCount;
  const canSaveStagedImages = stagedImages.length > 0 && unlocatedStagedCount === 0 && !isSaving;

  if (stagedImages.length === 0) {
    return null;
  }

  return (
    <aside className={`staged-panel${isBesideInspector ? ' staged-panel--beside-inspector' : ''}`}>
      <div className="staged-panel__header">
        <div>
          <p className="sidebar__eyebrow">待归档照片</p>
          <h2>定位与归档</h2>
        </div>
        <strong>{stagedImages.length}</strong>
      </div>

      <p className="staged-panel__hint">
        勾选一张或多张未定位图片，然后在地图上选点。全部图片都有定位后才能保存归档。
      </p>

      <div className="staged-summary">
        <div>
          <strong>{locatedStagedCount}</strong>
          <span>已定位</span>
        </div>
        <div>
          <strong>{unlocatedStagedCount}</strong>
          <span>未定位</span>
        </div>
        <div>
          <strong>{selectedStagedImagePaths.length}</strong>
          <span>已选择</span>
        </div>
      </div>

      <div className="staged-toolbar">
        <button className="button button--ghost" onClick={onSelectUnlocatedStagedImages} type="button">
          选择未定位
        </button>
        <button className="button button--ghost" onClick={onClearStagedImageSelection} type="button">
          清空选择
        </button>
      </div>

      <div className="staged-image-list">
        {stagedImages.map((item) => {
          const isSelected = selectedStagedPathSet.has(item.path);
          const isLocated = Boolean(item.location);
          const statusText = item.locationSource === 'gps'
            ? 'GPS定位'
            : item.locationSource === 'manual'
              ? '手动定位'
              : '未定位';

          return (
            <div
              key={item.path}
              className={`staged-image-row${isSelected ? ' staged-image-row--selected' : ''}${isLocated ? ' staged-image-row--located' : ''}`}
              onClick={() => onToggleStagedImageSelection(item.path)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onToggleStagedImageSelection(item.path);
                }
              }}
            >
              <span className="staged-image-row__check">
                {isSelected ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </span>
              <div className="staged-image-row__thumb">
                <img src={toLocalMediaUrl(item.path)} alt={item.name} loading="lazy" decoding="async" draggable={false} />
              </div>
              <div className="staged-image-row__content">
                <strong>{item.name}</strong>
                <span>{item.location?.displayName ?? '选择图片后在地图上点位'}</span>
              </div>
              <div className={`staged-image-row__status${isLocated ? ' staged-image-row__status--located' : ''}`}>
                <LocateFixed size={14} />
                <span>{statusText}</span>
              </div>
              <button
                className="icon-button icon-button--small staged-image-row__remove"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveStagedImage(item.path);
                }}
                title="移除"
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        className="button button--primary button--full"
        disabled={!canSaveStagedImages}
        onClick={() => void onSaveStagedImages()}
        type="button"
      >
        <Upload size={16} />
        <span>
          {isSaving
            ? '保存中...'
            : unlocatedStagedCount > 0
              ? `还差 ${unlocatedStagedCount} 张未定位`
              : `保存并归档 ${stagedImages.length} 张图片`}
        </span>
      </button>
    </aside>
  );
}

export const StagedImportPanel = memo(StagedImportPanelInner);
