import { promises as fs } from 'fs';
import path from 'path';
import type { ImageGpsCoordinate } from '../src/shared/contracts';

const JPEG_SOI = 0xffd8;
const EXIF_MARKER = 0xffe1;
const EXIF_HEADER = Buffer.from('Exif\0\0', 'ascii');
const GPS_IFD_TAG = 0x8825;
const GPS_LATITUDE_REF_TAG = 0x0001;
const GPS_LATITUDE_TAG = 0x0002;
const GPS_LONGITUDE_REF_TAG = 0x0003;
const GPS_LONGITUDE_TAG = 0x0004;
const TYPE_ASCII = 2;
const TYPE_RATIONAL = 5;

interface IfdEntry {
  type: number;
  count: number;
  valueOffset: number;
  valueFieldOffset: number;
}

function readUInt16(buffer: Buffer, offset: number, littleEndian: boolean) {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readUInt32(buffer: Buffer, offset: number, littleEndian: boolean) {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function parseIfd(buffer: Buffer, tiffStart: number, ifdOffset: number, littleEndian: boolean) {
  const entries = new Map<number, IfdEntry>();
  const directoryOffset = tiffStart + ifdOffset;

  if (directoryOffset + 2 > buffer.length) {
    return entries;
  }

  const entryCount = readUInt16(buffer, directoryOffset, littleEndian);

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = directoryOffset + 2 + index * 12;
    if (entryOffset + 12 > buffer.length) {
      break;
    }

    const tag = readUInt16(buffer, entryOffset, littleEndian);
    const type = readUInt16(buffer, entryOffset + 2, littleEndian);
    const count = readUInt32(buffer, entryOffset + 4, littleEndian);
    const valueOffset = readUInt32(buffer, entryOffset + 8, littleEndian);
    entries.set(tag, {
      type,
      count,
      valueOffset,
      valueFieldOffset: entryOffset + 8,
    });
  }

  return entries;
}

function readAsciiValue(buffer: Buffer, tiffStart: number, entry: IfdEntry) {
  const start = entry.count <= 4 ? entry.valueFieldOffset : tiffStart + entry.valueOffset;
  return buffer.slice(start, start + entry.count).toString('ascii').replace(/\0+$/g, '').trim();
}

function readRationalArray(buffer: Buffer, tiffStart: number, entry: IfdEntry, littleEndian: boolean) {
  const values: number[] = [];
  const start = tiffStart + entry.valueOffset;

  for (let index = 0; index < entry.count; index += 1) {
    const itemOffset = start + index * 8;
    if (itemOffset + 8 > buffer.length) {
      break;
    }

    const numerator = readUInt32(buffer, itemOffset, littleEndian);
    const denominator = readUInt32(buffer, itemOffset + 4, littleEndian);
    values.push(denominator === 0 ? Number.NaN : numerator / denominator);
  }

  return values;
}

function dmsToDecimal(values: number[], ref: string) {
  const [degrees = 0, minutes = 0, seconds = 0] = values;
  const sign = ref === 'S' || ref === 'W' ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function extractExifSegment(buffer: Buffer) {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== JPEG_SOI) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      break;
    }

    const marker = buffer.readUInt16BE(offset);
    const length = buffer.readUInt16BE(offset + 2);

    if (marker === EXIF_MARKER && offset + 10 <= buffer.length && buffer.subarray(offset + 4, offset + 10).equals(EXIF_HEADER)) {
      return offset + 10;
    }

    if (length < 2) {
      break;
    }

    offset += 2 + length;
  }

  return null;
}

export async function extractImageGps(filePath: string): Promise<ImageGpsCoordinate | null> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== '.jpg' && extension !== '.jpeg') {
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return null;
  }

  const tiffStart = extractExifSegment(buffer);
  if (tiffStart == null || tiffStart + 8 >= buffer.length) {
    return null;
  }

  const byteOrder = buffer.subarray(tiffStart, tiffStart + 2).toString('ascii');
  const littleEndian = byteOrder === 'II';
  if (!littleEndian && byteOrder !== 'MM') {
    return null;
  }

  const ifd0Offset = readUInt32(buffer, tiffStart + 4, littleEndian);
  const ifd0 = parseIfd(buffer, tiffStart, ifd0Offset, littleEndian);
  const gpsInfo = ifd0.get(GPS_IFD_TAG);
  if (!gpsInfo) {
    return null;
  }

  const gpsIfd = parseIfd(buffer, tiffStart, gpsInfo.valueOffset, littleEndian);
  const latRef = gpsIfd.get(GPS_LATITUDE_REF_TAG);
  const lat = gpsIfd.get(GPS_LATITUDE_TAG);
  const lngRef = gpsIfd.get(GPS_LONGITUDE_REF_TAG);
  const lng = gpsIfd.get(GPS_LONGITUDE_TAG);

  if (!latRef || !lat || !lngRef || !lng) {
    return null;
  }

  if (latRef.type !== TYPE_ASCII || lngRef.type !== TYPE_ASCII || lat.type !== TYPE_RATIONAL || lng.type !== TYPE_RATIONAL) {
    return null;
  }

  const latitudeRef = readAsciiValue(buffer, tiffStart, latRef);
  const longitudeRef = readAsciiValue(buffer, tiffStart, lngRef);
  const latitude = dmsToDecimal(readRationalArray(buffer, tiffStart, lat, littleEndian), latitudeRef);
  const longitude = dmsToDecimal(readRationalArray(buffer, tiffStart, lng, littleEndian), longitudeRef);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    lng: longitude,
    lat: latitude,
  };
}
