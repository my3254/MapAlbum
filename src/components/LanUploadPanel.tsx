import { QrCode, Smartphone, X } from 'lucide-react';
import type { LanServerState } from '../shared/contracts';

interface LanUploadPanelProps {
  isOpen: boolean;
  lanQrUrl: string | null;
  lanUploadState: LanServerState;
  onClose: () => void;
  onStartLanUpload: () => Promise<void>;
  onStopLanUpload: () => Promise<void>;
}

export function LanUploadPanel({
  isOpen,
  lanQrUrl,
  lanUploadState,
  onClose,
  onStartLanUpload,
  onStopLanUpload,
}: LanUploadPanelProps) {
  return (
    <aside className={`lan-panel ${isOpen ? ' lan-panel--open' : ''}`}>
      <div className="lan-panel__header">
        <div>
          <p className="sidebar__eyebrow">手机上传</p>
          <h2>局域网扫码上传</h2>
        </div>
        <button className="icon-button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>

      <section className="lan-panel__section">
        <div className="upload-link-card">
          <div className="upload-link-card__copy">
            <Smartphone size={18} />
            <div>
              <strong>上传原图到地图相册</strong>
              <p>手机和电脑在同一网络下时，可以直接上传原图；如果照片带有 GPS，会自动尝试定位。</p>
            </div>
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
              <p className="sidebar__hint">手机浏览器打开后即可上传照片。没有 GPS 的照片会保留到待处理区，等待你手动选点。</p>
            </>
          ) : (
            <p className="sidebar__hint">点击“启动上传”后，这里会显示二维码和访问链接。</p>
          )}
        </div>
      </section>
    </aside>
  );
}
