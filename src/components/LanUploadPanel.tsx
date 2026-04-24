import { Copy, HelpCircle, QrCode, Smartphone, Wifi } from 'lucide-react';
import type { LanServerState } from '../shared/contracts';

interface LanUploadPanelProps {
  lanQrUrl: string | null;
  lanUploadState: LanServerState;
  onStartLanUpload: () => Promise<void>;
  onStopLanUpload: () => Promise<void>;
}

export function LanUploadPanel({
  lanQrUrl,
  lanUploadState,
  onStartLanUpload,
  onStopLanUpload,
}: LanUploadPanelProps) {
  const uploadUrl = lanUploadState.url;

  function copyUploadUrl() {
    if (!uploadUrl) {
      return;
    }

    void navigator.clipboard?.writeText(uploadUrl);
  }

  return (
    <section className="board upload-page">
      <header className="upload-page__header">
        <div>
          <h1>局域网上传</h1>
          <p>手机和电脑连接同一网络后，扫码上传照片到本地相册。</p>
        </div>
        <button type="button" className="ghost-link">
          <HelpCircle size={15} />
          <span>使用说明</span>
        </button>
      </header>

      <div className="upload-page__grid">
        <article className="upload-card upload-card--service">
          <div className="upload-card__title">
            <span>1</span>
            <h2>启动服务</h2>
          </div>
          <p>在手机浏览器中打开下方地址或扫描二维码上传照片。</p>

          <div className="lan-qr-frame">
            {lanUploadState.isRunning && lanQrUrl ? (
              <img src={lanQrUrl} alt="局域网上传二维码" />
            ) : (
              <div>
                <QrCode size={84} />
                <span>启动后显示二维码</span>
              </div>
            )}
          </div>

          <div className="upload-field">
            <span>访问地址</span>
            <div>
              <strong>{uploadUrl ?? 'http://192.168.1.100:8080'}</strong>
              <button type="button" className="icon-button" onClick={copyUploadUrl} disabled={!uploadUrl} title="复制地址">
                <Copy size={15} />
              </button>
            </div>
          </div>

          <div className="network-box">
            <Wifi size={17} />
            <span>
              <strong>{lanUploadState.host ? 'MapAlbum_SG' : '等待启动服务'}</strong>
              <small>IP: {lanUploadState.host ?? '192.168.1.100'}</small>
            </span>
          </div>

          {lanUploadState.isRunning ? (
            <button type="button" className="button button--primary button--full" onClick={onStopLanUpload}>
              停止服务
            </button>
          ) : (
            <button type="button" className="button button--primary button--full" onClick={onStartLanUpload}>
              启动服务
            </button>
          )}
        </article>

        <article className="upload-card upload-card--drop">
          <div className="upload-card__title">
            <span>2</span>
            <h2>上传照片</h2>
          </div>
          <div className="phone-stage">
            <Smartphone size={78} />
            <strong>等待手机连接...</strong>
            <p>连接后即可上传照片到本地</p>
          </div>
          <div className="upload-stats">
            <div>
              <span>已上传照片</span>
              <strong>0 张</strong>
            </div>
            <div>
              <span>上传大小</span>
              <strong>0 MB</strong>
            </div>
          </div>
          <footer>提示：请确保手机与电脑在同一局域网内</footer>
        </article>
      </div>
    </section>
  );
}
