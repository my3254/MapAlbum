/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_WEB_KEY?: string;
  readonly VITE_AMAP_SECURITY_JS_CODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
