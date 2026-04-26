# 旅行者相册

旅行者相册 is a desktop photo workspace built with Electron, React, and Vite. It organizes photos by geographic location, lets you pick places directly on a map, and stores albums in a nested local folder structure.

This project is designed for local-first photo management: the app works on your machine, the album root folder is user-selected, and photo files are copied into location-based directories together with metadata.

## Features

- Create albums by clicking a point on the map or searching for a place.
- Organize photos into nested folders such as province / city / district / street.
- Store album metadata in `_meta.json`.
- Browse albums on the map with aggregated markers at different zoom levels.
- View all photos in a timeline mode.
- Set album cover images and notes.
- Import photos from the local computer.
- Start a LAN upload page so photos can be sent from a phone on the same network.
- Auto-detect GPS information from uploaded photos and archive them by location when possible.

## Tech Stack

- Electron
- React
- Vite
- TypeScript
- AMap JavaScript API

## Folder Convention

旅行者相册 creates folders automatically based on resolved location data.

```text
your-root-folder/
  Province/
    City/
      District/
        Township/
          _meta.json
          1713680011223-ab12cd34.jpg
          1713680011555-ef34gh56.png
```

`_meta.json` stores album metadata such as:

- `lng`
- `lat`
- `displayName`
- `relativePath`
- `province`
- `city`
- `district`
- `township`
- `note`
- `createdAt`
- `updatedAt`

## Getting Started

### Requirements

- Node.js 20+
- npm

### Install

```bash
npm install
```

### Environment Variables

Create `.env.local` in the project root:

```bash
VITE_AMAP_WEB_KEY=your_amap_web_key
VITE_AMAP_SECURITY_JS_CODE=your_amap_security_js_code
```

### Run in Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Package for Windows

```bash
npm run dist:win
```

Build output:

- Renderer bundle: `dist/`
- Electron bundle: `dist-electron/`
- Installer output: `release/`

## Project Structure

- `electron/main.ts`: Electron main process, IPC handlers, filesystem access, reverse geocoding, and local protocol registration.
- `electron/preload.cjs`: Safe preload bridge exposed to the renderer.
- `electron/lan-upload.ts`: Temporary LAN upload server for phone-to-desktop imports.
- `src/components/Sidebar.tsx`: Album list, root folder state, and navigation.
- `src/components/MapCanvas.tsx`: Map rendering, search, marker aggregation, and location picking.
- `src/components/InspectorPanel.tsx`: Album detail panel, image import, and album editing.
- `src/shared/contracts.ts`: Shared types between Electron and the renderer.
- `src/shared/location.ts`: Location normalization and path generation rules.

## Notes for a Public GitHub Repository

- Do not commit real API keys, security codes, tokens, or personal local paths.
- Keep `.env.local` local only. It is already covered by `*.local` in `.gitignore`.
- Do not commit generated folders such as `node_modules/`, `dist/`, `dist-electron/`, or `release/`.
- Before pushing, review the source code for any hardcoded secrets or environment fallbacks.
- If you publish this project, use your own map service credentials and make sure usage complies with the provider's terms.

## Current Scope

旅行者相册 currently focuses on local desktop workflows:

- local root-folder based album storage
- map-based geographic album management
- timeline browsing
- LAN photo import from mobile devices on the same network

It is not a cloud sync product and does not include user accounts or remote storage by default.
