import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crcData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePNGFile(size, rawData, outputPath) {
  const deflated = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Generated ${outputPath} (${size}x${size})`);
}

function generatePharmacyIconPNG(size, outputPath, options = {}) {
  const { isMaskable = false } = options;
  const rowLength = 1 + size * 4;
  const rawData = Buffer.alloc(size * rowLength);
  const center = size / 2;
  const halfSize = size * 0.45;
  const cornerR = size * 0.16;
  const crossWidth = isMaskable ? size * 0.22 : size * 0.24;
  const crossLength = isMaskable ? size * 0.54 : size * 0.64;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0;

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);
      let inBackground = false;
      if (isMaskable) {
        inBackground = true;
      } else {
        if (dx <= halfSize - cornerR && dy <= halfSize) {
          inBackground = true;
        } else if (dy <= halfSize - cornerR && dx <= halfSize) {
          inBackground = true;
        } else {
          const cornerDx = dx - (halfSize - cornerR);
          const cornerDy = dy - (halfSize - cornerR);
          if (cornerDx * cornerDx + cornerDy * cornerDy <= cornerR * cornerR) {
            inBackground = true;
          }
        }
      }
      const inVertical = dx <= crossWidth / 2 && dy <= crossLength / 2;
      const inHorizontal = dy <= crossWidth / 2 && dx <= crossLength / 2;
      const inCross = inVertical || inHorizontal;

      if (inCross) {
        rawData[pxOffset] = 255;
        rawData[pxOffset + 1] = 255;
        rawData[pxOffset + 2] = 255;
        rawData[pxOffset + 3] = 255;
      } else if (inBackground) {
        const t = (x + y) / (size * 2);
        rawData[pxOffset] = Math.round(2 * (1 - t) + 15 * t);
        rawData[pxOffset + 1] = Math.round(132 * (1 - t) + 118 * t);
        rawData[pxOffset + 2] = Math.round(199 * (1 - t) + 110 * t);
        rawData[pxOffset + 3] = 255;
      } else {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  writePNGFile(size, rawData, outputPath);
}

/**
 * Genera el icono de silueta para la barra de estado y badge de Android (Monochrome con fondo transparente).
 */
function generateNotificationBadgePNG(size, outputPath) {
  const rowLength = 1 + size * 4;
  const rawData = Buffer.alloc(size * rowLength);

  const center = size / 2;
  const crossWidth = Math.round(size * 0.28);
  const crossLength = Math.round(size * 0.74);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0;

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = Math.abs(x - center);
      const dy = Math.abs(y - center);

      const inVertical = dx <= crossWidth / 2 && dy <= crossLength / 2;
      const inHorizontal = dy <= crossWidth / 2 && dx <= crossLength / 2;
      const inCross = inVertical || inHorizontal;

      if (inCross) {
        rawData[pxOffset] = 255;
        rawData[pxOffset + 1] = 255;
        rawData[pxOffset + 2] = 255;
        rawData[pxOffset + 3] = 255;
      } else {
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  writePNGFile(size, rawData, outputPath);
}

const publicDir = path.resolve('public');
generatePharmacyIconPNG(192, path.join(publicDir, 'pwa-192x192.png'));
generatePharmacyIconPNG(512, path.join(publicDir, 'pwa-512x512.png'));
generatePharmacyIconPNG(512, path.join(publicDir, 'maskable-icon-512x512.png'), { isMaskable: true });
generatePharmacyIconPNG(180, path.join(publicDir, 'apple-touch-icon.png'));
generateNotificationBadgePNG(96, path.join(publicDir, 'notification-badge-96x96.png'));
