# MapAlbum

MapAlbum 是一个基于 Electron + React + Vite 的本地地图相册工作台。你在地图上点击任意地点后，可以把照片保存到本地根目录，并按地点自动生成嵌套文件夹。

## 重写后的结构

- `electron/main.ts`
  Electron 主进程。负责窗口启动、等待 Vite dev server、注册 `local-media://` 协议，以及文件系统相关 IPC。
- `electron/preload.cjs`
  CommonJS preload。只暴露精简后的桌面 API，不把 `ipcRenderer` 裸露给前端。
- `src/shared/contracts.ts`
  主进程与渲染层共享的数据结构。
- `src/shared/location.ts`
  地点路径与显示名称的统一规则。
- `src/components/Sidebar.tsx`
  左侧工作台：根目录、统计、相册列表、搜索。
- `src/components/MapCanvas.tsx`
  地图主画布：高德地图初始化、逆地理编码、气泡 marker、选中地点高亮。
- `src/components/InspectorPanel.tsx`
  右侧详情面板：新地点上传、已有相册预览、追加图片。

## 数据流

1. 用户在左侧选择本地根目录。
2. 前端通过 `window.api.listAlbums(rootFolder)` 扫描根目录下所有地点相册。
3. 主进程递归查找 `_meta.json`，并统计每个地点目录中的图片数量与封面图。
4. 点击地图后，前端调用高德逆地理编码，得到省 / 市 / 区 / 街道。
5. 点击上传后，主进程自动创建嵌套目录，复制图片，并更新 `_meta.json`。
6. 上传完成后，左侧列表、地图气泡、右侧详情同步刷新。

## 目录约定

MapAlbum 会按地点自动创建嵌套目录，例如：

```text
your-root-folder/
  浙江省/
    杭州市/
      西湖区/
        灵隐街道/
          _meta.json
          1713680011223-ab12cd34.jpg
          1713680011555-ef34gh56.png
```

`_meta.json` 中保存：

- 经度 `lng`
- 纬度 `lat`
- 显示名称 `displayName`
- 相对路径 `relativePath`
- `province`
- `city`
- `district`
- `township`
- `createdAt`
- `updatedAt`

## 开发

```bash
npm install
npm run dev
```

当前开发端口固定为 `http://127.0.0.1:5173`，便于 Electron 主进程等待 dev server 就绪。

## 构建

```bash
npm run build
```

构建后：

- 渲染进程产物在 `dist/`
- Electron 主进程产物在 `dist-electron/`
- `electron/preload.cjs` 会被复制到 `dist-electron/preload.cjs`

## 当前地图配置

- 地图服务：高德地图 JS API 2.0
- 当前本地开发已配置：
  `VITE_AMAP_WEB_KEY=3a1ae688ad052b3465d3d3bba2e84dd2`
  `VITE_AMAP_SECURITY_JS_CODE=6999bc6f1c90e488f335d94449f2718c`
- 如果你之后更换高德账号或密钥，逆地理编码等服务通常还需要同步更新安全密钥：
  在项目根目录创建 `.env.local`，加入
  `VITE_AMAP_WEB_KEY=你的 Web Key`
  `VITE_AMAP_SECURITY_JS_CODE=你的安全密钥`

## 已修正的问题

- preload 不再依赖不稳定的 ESM `.cjs` 产物
- 开发模式下 Electron 会等待 Vite dev server 就绪后再加载页面
- 文件系统逻辑统一收敛到主进程
- 路径生成逻辑集中管理，避免非法字符和重复层级
- UI 改成稳定的三栏工作台，而不是零散浮层和内联样式拼接
