// Script to generate valid PNG icons for PWA without external dependencies
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

function generatePharmacyIconPNG(size, outputPath) {
  // Raw RGBA pixel buffer: size * (1 filter byte + size * 4 bytes)
  const rowLength = 1 + size * 4;
  const rawData = Buffer.alloc(size * rowLength);

  const center = size / 2;
  const radius = size * 0.44;
  const crossWidth = size * 0.16;
  const crossLength = size * 0.56;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Check if inside rounded squircle / background
      const inSquircle = Math.abs(dx) <= radius && Math.abs(dy) <= radius &&
        (Math.abs(dx) < radius - size * 0.1 || Math.abs(dy) < radius - size * 0.1 || dist <= radius * 1.08);

      // Check if inside pharmacy cross
      const inVertical = Math.abs(dx) <= crossWidth / 2 && Math.abs(dy) <= crossLength / 2;
      const inHorizontal = Math.abs(dy) <= crossWidth / 2 && Math.abs(dx) <= crossLength / 2;
      const inCross = inVertical || inHorizontal;

      if (inCross) {
        // Crisp White cross
        rawData[pxOffset] = 255;     // R
        rawData[pxOffset + 1] = 255; // G
        rawData[pxOffset + 2] = 255; // B
        rawData[pxOffset + 3] = 255; // Alpha
      } else if (inSquircle) {
        // Modern Blue/Teal gradient (#0284c7 to #0f766e)
        const t = (x + y) / (size * 2);
        rawData[pxOffset] = Math.round(14 * (1 - t) + 15 * t);     // R
        rawData[pxOffset + 1] = Math.round(130 * (1 - t) + 118 * t); // G
        rawData[pxOffset + 2] = Math.round(220 * (1 - t) + 110 * t); // B
        rawData[pxOffset + 3] = 255; // Alpha
      } else {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr.writeUInt8(8, 8);       // bit depth: 8
  ihdr.writeUInt8(6, 9);       // color type: 6 (RGBA)
  ihdr.writeUInt8(0, 10);      // compression
  ihdr.writeUInt8(0, 11);      // filter
  ihdr.writeUInt8(0, 12);      // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngBuffer = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(outputPath, pngBuffer);
  console.log(`Generated ${outputPath} (${size}x${size})`);
}

const publicDir = path.resolve('public');
generatePharmacyIconPNG(192, path.join(publicDir, 'pwa-192x192.png'));
generatePharmacyIconPNG(512, path.join(publicDir, 'pwa-512x512.png'));
generatePharmacyIconPNG(512, path.join(publicDir, 'maskable-icon-512x512.png'));
generatePharmacyIconPNG(180, path.join(publicDir, 'apple-touch-icon.png'));
