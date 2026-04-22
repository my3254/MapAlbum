export const AMAP_WEB_KEY = import.meta.env.VITE_AMAP_WEB_KEY?.trim() || '';
export const AMAP_SECURITY_JS_CODE = import.meta.env.VITE_AMAP_SECURITY_JS_CODE?.trim() || '';

export function ensureAmapSecurityConfig() {
  if (!AMAP_WEB_KEY) {
    throw new Error('未配置高德 Web Key，请在项目根目录的 .env.local 中设置 VITE_AMAP_WEB_KEY。');
  }

  if (!AMAP_SECURITY_JS_CODE) {
    throw new Error('未配置高德安全密钥，请在项目根目录的 .env.local 中设置 VITE_AMAP_SECURITY_JS_CODE。');
  }

  window._AMapSecurityConfig = {
    securityJsCode: AMAP_SECURITY_JS_CODE,
  };
}
