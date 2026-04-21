import type {
  AlbumLocationInput,
  AlbumSummary,
  LanServerState,
  LanUploadBatch,
  SaveAlbumResult,
} from './shared/contracts';

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
    api: {
      chooseRootFolder: () => Promise<string | null>;
      chooseImages: () => Promise<string[] | null>;
      listAlbums: (rootFolder: string) => Promise<AlbumSummary[]>;
      getAlbumImages: (rootFolder: string, relativePath: string) => Promise<string[]>;
      saveAlbum: (
        rootFolder: string,
        location: AlbumLocationInput,
        sourcePaths: string[],
      ) => Promise<SaveAlbumResult>;
      setAlbumCover: (rootFolder: string, relativePath: string, imageName: string) => Promise<void>;
      reverseGeocodeLocation: (
        location: Pick<AlbumLocationInput, 'lng' | 'lat'>,
      ) => Promise<AlbumLocationInput>;
      startLanUpload: () => Promise<LanServerState>;
      stopLanUpload: () => Promise<LanServerState>;
      getLanUploadState: () => Promise<LanServerState>;
      consumeLanUploadBatches: () => Promise<LanUploadBatch[]>;
    };
  }
}

export {};
