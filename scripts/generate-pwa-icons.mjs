import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/public");
await mkdir(root, { recursive: true });
for (const size of [192, 512]) {
  await writeFile(resolve(root, `pwa-${size}.png`), makePng(size));
}
await writeFile(resolve(root, "favicon.ico"), makeIco(makePng(192)));

function makeIco(png) {
  const icon = Buffer.alloc(22 + png.length);
  icon.writeUInt16LE(1, 2);
  icon.writeUInt16LE(1, 4);
  icon.writeUInt8(192, 6);
  icon.writeUInt8(192, 7);
  icon.writeUInt16LE(1, 10);
  icon.writeUInt16LE(32, 12);
  icon.writeUInt32LE(png.length, 14);
  icon.writeUInt32LE(22, 18);
  png.copy(icon, 22);
  return icon;
}

function makePng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const rect = (x1, y1, x2, y2, color, radius = 0) => {
    for (let y = Math.floor(y1 * scale); y < Math.ceil(y2 * scale); y += 1) {
      for (let x = Math.floor(x1 * scale); x < Math.ceil(x2 * scale); x += 1) {
        if (radius && !insideRoundedRect(x / scale, y / scale, x1, y1, x2, y2, radius)) continue;
        setPixel(pixels, size, x, y, color);
      }
    }
  };
  const line = (x, y, width, height, color) =>
    rect(x, y, x + width, y + height, color, Math.min(width, height) / 2);

  rect(0, 0, 512, 512, [23, 56, 79, 255]);
  rect(112, 72, 400, 440, [247, 247, 239, 255], 24);
  rect(148, 115, 226, 189, [46, 126, 115, 255], 12);
  line(246, 132, 108, 12, [23, 56, 79, 255]);
  line(246, 158, 80, 9, [127, 148, 147, 255]);
  line(148, 226, 216, 11, [170, 184, 178, 255]);
  line(148, 260, 216, 11, [170, 184, 178, 255]);
  line(148, 294, 178, 11, [170, 184, 178, 255]);
  line(148, 328, 216, 11, [170, 184, 178, 255]);
  line(148, 362, 135, 11, [170, 184, 178, 255]);
  rect(113, 396, 399, 440, [239, 194, 103, 255], 0);

  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (rowBytes + 1);
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk(
      "IHDR",
      Buffer.from([
        size >>> 24,
        (size >>> 16) & 255,
        (size >>> 8) & 255,
        size & 255,
        size >>> 24,
        (size >>> 16) & 255,
        (size >>> 8) & 255,
        size & 255,
        8,
        6,
        0,
        0,
        0,
      ]),
    ),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, x1, y1, x2, y2, radius) {
  const cx = Math.max(x1 + radius, Math.min(x, x2 - radius));
  const cy = Math.max(y1 + radius, Math.min(y, y2 - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function setPixel(buffer, size, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  buffer[offset] = r;
  buffer[offset + 1] = g;
  buffer[offset + 2] = b;
  buffer[offset + 3] = a;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}
