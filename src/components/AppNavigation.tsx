import {
  Home,
  Image as ImageIcon,
  Map,
  MapPin,
  Settings,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import type { ReactElement } from 'react';

export type AppView =
  | 'workbench'
  | 'map'
  | 'places'
  | 'albums'
  | 'timeline'
  | 'stats'
  | 'upload'
  | 'recycle'
  | 'settings';

interface AppNavigationProps {
  activeView: AppView;
  albumCount: number;
  isLanRunning: boolean;
  rootFolder: string | null;
  onViewChange: (view: AppView) => void;
}

const navItems = [
  { view: 'workbench', label: '工作台', icon: <Home size={18} /> },
  { view: 'map', label: '地图', icon: <Map size={18} /> },
  { view: 'places', label: '地点/时间线', icon: <MapPin size={18} /> },
  { view: 'albums', label: '相册', icon: <ImageIcon size={18} /> },
  { view: 'upload', label: '局域网上传', icon: <UploadCloud size={18} /> },
  { view: 'recycle', label: '回收站', icon: <Trash2 size={18} /> },
] satisfies Array<{ view: AppView; label: string; icon: ReactElement }>;

const viewNumber: Record<AppView, string> = {
  workbench: '01',
  map: '02',
  places: '03',
  albums: '04',
  timeline: '05',
  upload: '06',
  recycle: '07',
  settings: '11',
  stats: '10',
};

export function AppNavigation({
  activeView,
  albumCount,
  isLanRunning,
  rootFolder,
  onViewChange,
}: AppNavigationProps) {
  return (
    <nav className="app-nav" aria-label="主导航">
      <div className="app-nav__brand">
        <span className="app-nav__logo">
          <ImageIcon size={20} />
        </span>
        <div>
          <strong>地图相册</strong>
          <small>MAPALBUM</small>
        </div>
      </div>

      <div className="app-nav__items">
        {navItems.map((item) => {
          const isActive = activeView === item.view || (activeView === 'timeline' && item.view === 'places');
          return (
            <button
              key={item.view}
              type="button"
              className={`app-nav__item${isActive ? ' app-nav__item--active' : ''}`}
              onClick={() => onViewChange(item.view)}
              data-view-number={viewNumber[item.view]}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.view === 'albums' && albumCount > 0 && <em>{albumCount}</em>}
              {item.view === 'upload' && isLanRunning && <i aria-label="上传服务运行中" />}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`app-nav__item app-nav__item--settings${activeView === 'settings' ? ' app-nav__item--active' : ''}`}
        onClick={() => onViewChange('settings')}
      >
        <Settings size={18} />
        <span>设置</span>
      </button>

      <div className="app-nav__storage">
        <strong>本地存储</strong>
        <span>256 GB / 512 GB</span>
        <div className="storage-meter" aria-hidden="true">
          <b />
        </div>
        <small>50%</small>
        <button type="button" onClick={() => onViewChange('settings')}>
          <ImageIcon size={14} />
          <span>{rootFolder ? '打开图库目录' : '选择图库目录'}</span>
        </button>
      </div>
    </nav>
  );
}
