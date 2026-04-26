import { CheckCircle2, Image as ImageIcon, QrCode, Smartphone, X } from 'lucide-react';
import type { LanServerState, RecentLanUpload } from '../shared/contracts';
import { toLocalMediaUrl } from '../shared/media';

interface LanUploadPanelProps {
  isOpen: boolean;
  lanQrUrl: string | null;
  lanUploadState: LanServerState;
  recentUploads: RecentLanUpload[];
  onClose: () => void;
  onStartLanUpload: () => Promise<void>;
  onStopLanUpload: () => Promise<void>;
}

export function LanUploadPanel({
  isOpen,
  lanQrUrl,
  lanUploadState,
  recentUploads,
  onClose,
  onStartLanUpload,
  onStopLanUpload,
}: LanUploadPanelProps) {
  const latestUpload = recentUploads[0] ?? null;
  const progressPercent = latestUpload ? 100 : lanUploadState.isRunning ? 12 : 0;
  const progressLabel = latestUpload
    ? latestUpload.name
    : lanUploadState.isRunning
      ? '等待手机选择照片...'
      : '启动扫码服务后开始记录';

  return (
    <aside className={`lan-panel${isOpen ? ' lan-panel--open' : ''}`} aria-hidden={!isOpen}>
      <button className="lan-panel__backdrop" onClick={onClose} type="button" aria-label="关闭设备同步" />
      <div className="lan-panel__dialog">
        <div className="lan-panel__glow" />
        <section className="lan-panel__card" aria-label="设备同步">
          <button className="icon-button lan-panel__close" onClick={onClose} title="关闭">
            <X size={18} />
          </button>

          <div className="lan-panel__header">
            <div className="lan-panel__icon">
              <Smartphone size={30} />
            </div>
            <div>
              <p className="sidebar__eyebrow">设备同步</p>
              <h2>扫码同步与预览</h2>
              <p>使用手机扫码上传原图，桌面端会记录最近同步的图片。</p>
            </div>
          </div>

          <div className="upload-qr-frame">
            <span className="upload-qr-frame__corner upload-qr-frame__corner--tl" />
            <span className="upload-qr-frame__corner upload-qr-frame__corner--tr" />
            <span className="upload-qr-frame__corner upload-qr-frame__corner--bl" />
            <span className="upload-qr-frame__corner upload-qr-frame__corner--br" />
            <div className="upload-qr-frame__surface">
              {lanUploadState.isRunning && <span className="upload-qr-frame__scan" />}
              {lanUploadState.isRunning && lanQrUrl ? (
                <img className="upload-qr" src={lanQrUrl} alt="局域网上传二维码" />
              ) : (
                <div className="upload-qr upload-qr--placeholder">
                  <QrCode size={64} />
                  <span>等待启动</span>
                </div>
              )}
            </div>
          </div>

          <div className="lan-panel__progress">
            <div className="lan-panel__progress-row">
              <div>
                <h3>上传进度</h3>
                <span>{latestUpload ? `已接收：${progressLabel}` : progressLabel}</span>
              </div>
              <strong>{progressPercent}%</strong>
            </div>
            <div className="lan-panel__progress-track">
              <div
                className={`lan-panel__progress-fill${lanUploadState.isRunning ? ' lan-panel__progress-fill--active' : ''}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {lanUploadState.isRunning && lanUploadState.url && (
              <a className="upload-link-card__url" href={lanUploadState.url} target="_blank" rel="noreferrer">
                {lanUploadState.url}
              </a>
            )}
          </div>

          <div className="lan-panel__actions">
            {lanUploadState.isRunning ? (
              <button className="button button--ghost" onClick={onStopLanUpload}>
                停止上传
              </button>
            ) : (
              <button className="button button--primary" onClick={onStartLanUpload}>
                <QrCode size={16} />
                <span>启动上传</span>
              </button>
            )}
          </div>

          <div className="recent-uploads">
            <div className="recent-uploads__title">
              <span>近期上传</span>
              <strong>{recentUploads.length}</strong>
            </div>
            <div className="recent-uploads__grid">
              {recentUploads.length === 0 ? (
                <div className="recent-uploads__empty">
                  <ImageIcon size={22} />
                  <span>暂无上传记录</span>
                </div>
              ) : (
                recentUploads.slice(0, 8).map((upload) => (
                  <figure key={upload.id} className="recent-upload-card" title={upload.name}>
                    <img src={toLocalMediaUrl(upload.path)} alt={upload.name} loading="lazy" decoding="async" draggable={false} />
                    <span className="recent-upload-card__check">
                      <CheckCircle2 size={14} />
                    </span>
                    {upload.hasGps && <span className="recent-upload-card__gps">GPS</span>}
                  </figure>
                ))
              )}
            </div>
          </div>

          <p className="sidebar__hint">
            手机和电脑在同一网络下时，可以直接上传原图；如果照片带有 GPS，会自动尝试定位。
          </p>
        </section>
      </div>
    </aside>
  );
}
