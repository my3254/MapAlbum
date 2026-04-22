import AMapLoader from '@amap/amap-jsapi-loader';
import type { AlbumLocationInput } from './contracts';
import { AMAP_WEB_KEY, ensureAmapSecurityConfig } from './amap-config';

let geocoderPromise: Promise<any> | null = null;

const EARTH_RADIUS = 6378245.0;
const OFFSET = 0.00669342162296594323;

function outOfChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng: number, lat: number) {
  let result = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  result += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  result += (20.0 * Math.sin(lat * Math.PI) + 40.0 * Math.sin(lat / 3.0 * Math.PI)) * 2.0 / 3.0;
  result += (160.0 * Math.sin(lat / 12.0 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30.0)) * 2.0 / 3.0;
  return result;
}

function transformLng(lng: number, lat: number) {
  let result = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  result += (20.0 * Math.sin(6.0 * lng * Math.PI) + 20.0 * Math.sin(2.0 * lng * Math.PI)) * 2.0 / 3.0;
  result += (20.0 * Math.sin(lng * Math.PI) + 40.0 * Math.sin(lng / 3.0 * Math.PI)) * 2.0 / 3.0;
  result += (150.0 * Math.sin(lng / 12.0 * Math.PI) + 300.0 * Math.sin(lng / 30.0 * Math.PI)) * 2.0 / 3.0;
  return result;
}

export function wgs84ToGcj02(lng: number, lat: number) {
  if (outOfChina(lng, lat)) {
    return { lng, lat };
  }

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = lat / 180.0 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - OFFSET * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / ((EARTH_RADIUS * (1 - OFFSET)) / (magic * sqrtMagic) * Math.PI);
  dLng = (dLng * 180.0) / (EARTH_RADIUS / sqrtMagic * Math.cos(radLat) * Math.PI);

  return {
    lng: lng + dLng,
    lat: lat + dLat,
  };
}

async function getGeocoder() {
  if (!geocoderPromise) {
    geocoderPromise = (async () => {
      ensureAmapSecurityConfig();

      const AMap = await AMapLoader.load({
        key: AMAP_WEB_KEY,
        version: '2.0',
        plugins: ['AMap.Geocoder'],
      });

      return new AMap.Geocoder({
        radius: 1000,
        extensions: 'all',
      });
    })();
  }

  return geocoderPromise;
}

export async function reverseGeocodeFromPhotoGps(location: Pick<AlbumLocationInput, 'lng' | 'lat'>) {
  const normalized = wgs84ToGcj02(location.lng, location.lat);
  const geocoder = await getGeocoder();

  return new Promise<AlbumLocationInput>((resolve, reject) => {
    geocoder.getAddress([normalized.lng, normalized.lat], (status: string, result: any) => {
      if (status !== 'complete' || !result?.regeocode?.addressComponent) {
        reject(new Error(result?.info || result?.message || '逆地理编码失败'));
        return;
      }

      const address = result.regeocode.addressComponent;
      const citySource = address.city || '';
      const city = Array.isArray(citySource) ? citySource[0] ?? '' : citySource;

      resolve({
        province: address.province || '',
        city: city || address.province || '',
        district: address.district || '',
        township: address.township || address.streetNumber?.street || '',
        lng: normalized.lng,
        lat: normalized.lat,
      });
    });
  });
}
