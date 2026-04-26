import type { AlbumLocationInput, LocationDraft } from './contracts';

const INVALID_SEGMENT_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const COORDINATE_PRECISION = 6;
export const LOCATION_DISPLAY_SEPARATOR = ' · ';

function buildCoordinateFallback(location: Pick<AlbumLocationInput, 'lng' | 'lat'>) {
  return `坐标_${location.lat.toFixed(COORDINATE_PRECISION)}_${location.lng.toFixed(COORDINATE_PRECISION)}`;
}

export function sanitizePathSegment(value?: string) {
  return (value ?? '')
    .replace(INVALID_SEGMENT_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildAlbumSegments(
  location: Pick<AlbumLocationInput, 'province' | 'city' | 'district' | 'township' | 'lng' | 'lat'>,
) {
  const segments = [location.province, location.city, location.district, location.township]
    .map(sanitizePathSegment)
    .filter(Boolean)
    .filter((segment, index, list) => segment !== list[index - 1]);

  if (segments.length > 0) {
    return segments;
  }

  return [buildCoordinateFallback(location)];
}

export function formatAlbumSegmentsForDisplay(segments: string[]) {
  return segments.filter(Boolean).join(LOCATION_DISPLAY_SEPARATOR);
}

export function formatAlbumRelativePathForDisplay(relativePath: string) {
  const segments = relativePath
    .split(/[\\/]+/)
    .map(sanitizePathSegment)
    .filter(Boolean);

  return formatAlbumSegmentsForDisplay(segments) || relativePath;
}

export function buildAlbumRelativePath(
  location: Pick<AlbumLocationInput, 'province' | 'city' | 'district' | 'township' | 'lng' | 'lat'>,
) {
  return buildAlbumSegments(location).join('\\');
}

export function formatAlbumDisplayName(
  location: Pick<AlbumLocationInput, 'province' | 'city' | 'district' | 'township' | 'lng' | 'lat'>,
) {
  const segments = buildAlbumSegments(location);
  return segments.length > 0
    ? formatAlbumSegmentsForDisplay(segments)
    : `坐标 ${location.lat.toFixed(COORDINATE_PRECISION)}, ${location.lng.toFixed(COORDINATE_PRECISION)}`;
}

export function createLocationDraft(location: AlbumLocationInput): LocationDraft {
  return {
    ...location,
    relativePath: buildAlbumRelativePath(location),
    displayName: formatAlbumDisplayName(location),
  };
}
