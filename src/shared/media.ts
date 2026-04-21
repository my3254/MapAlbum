export function toLocalMediaUrl(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return `local-media:///${encodeURI(normalized)}`;
}
