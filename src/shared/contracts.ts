export interface AlbumLocationInput {
  province?: string;
  city?: string;
  district?: string;
  township?: string;
  lng: number;
  lat: number;
}

export interface ImageGpsCoordinate {
  lng: number;
  lat: number;
}

export interface ImportedImageFile {
  path: string;
  originalName: string;
  gps: ImageGpsCoordinate | null;
}

export interface LocationDraft extends AlbumLocationInput {
  relativePath: string;
  displayName: string;
}

export interface AlbumSummary extends LocationDraft {
  imageCount: number;
  note?: string;
  coverPath: string | null;
  previewPaths: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveAlbumResult {
  album: AlbumSummary;
  addedImages: string[];
}

export interface LanUploadBatch {
  id: string;
  receivedAt: string;
  files: ImportedImageFile[];
}

export interface LanServerState {
  isRunning: boolean;
  url: string | null;
  host: string | null;
  port: number | null;
}
