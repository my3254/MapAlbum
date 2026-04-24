import {
  Clock,
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
  onViewChange: (view: AppView) => void;
}

const navItems = [
  { view: 'workbench', label: '工作台', icon: <Home size={18} /> },
  { view: 'map', label: '地图', icon: <Map size={18} /> },
  { view: 'places', label: '地点', icon: <MapPin size={18} /> },
  { view: 'albums', label: '相册', icon: <ImageIcon size={18} /> },
  { view: 'timeline', label: '时间线', icon: <Clock size={18} /> },
  { view: 'upload', label: '局域网上传', icon: <UploadCloud size={18} /> },
  { view: 'recycle', label: '回收站', icon: <Trash2 size={18} /> },
] satisfies Array<{ view: AppView; label: string; icon: ReactElement }>;

export function AppNavigation({
  activeView,
  albumCount,
  isLanRunning,
  onViewChange,
}: AppNavigationProps) {
  return (
    <nav className="app-nav" aria-label="主导航">
      <div className="app-nav__brand">
        <div className="app-nav__logo" aria-hidden="true">
          <ImageIcon size={19} />
        </div>
        <div>
          <strong>地图相册</strong>
          <span>MAPALBUM</span>
        </div>
      </div>

      <div className="app-nav__items">
        {navItems.map((item) => {
          const isActive = activeView === item.view || (activeView === 'upload' && item.view === 'upload');
          return (
            <button
              key={item.view}
              type="button"
              className={`app-nav__item${isActive ? ' app-nav__item--active' : ''}`}
              onClick={() => onViewChange(item.view)}
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
    </nav>
  );
}
