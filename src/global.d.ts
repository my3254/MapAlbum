import type {
  AlbumLocationInput,
  AlbumSummary,
  LanServerState,
  LanUploadBatch,
  SaveAlbumResult,
  ImageMetadata,
  TimelinePage,
} from './shared/contracts';

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
    api: {
      getRootFolder: () => Promise<string | null>;
      setRootFolder: (rootFolder: string | null) => Promise<void>;
      chooseRootFolder: () => Promise<string | null>;
      chooseImages: () => Promise<string[] | null>;
      listAlbums: (rootFolder: string) => Promise<AlbumSummary[]>;
      getAlbumImages: (rootFolder: string, relativePath: string) => Promise<ImageMetadata[]>;
      getTimelinePage: (
        rootFolder: string,
        offset: number,
        limit: number,
        refresh?: boolean,
      ) => Promise<TimelinePage>;
      saveAlbum: (
        rootFolder: string,
        location: AlbumLocationInput,
        sourcePaths: string[],
      ) => Promise<SaveAlbumResult>;
      setAlbumCover: (rootFolder: string, relativePath: string, imageName: string) => Promise<void>;
      setAlbumNote: (rootFolder: string, relativePath: string, note: string) => Promise<void>;
      deleteAlbumImage: (
        rootFolder: string,
        relativePath: string,
        imageName: string,
      ) => Promise<{ remainingCount: number }>;
      deleteAlbum: (rootFolder: string, relativePath: string) => Promise<void>;
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
