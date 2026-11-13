import { inflateRawSync } from 'node:zlib';
import { tables } from './schema.mjs';

const MAX_ARCHIVE = 32 * 1024 * 1024;
const MAX_FILE = 16 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
export function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
const invalid = (message) => { throw new Error(`Invalid ZIP: ${message}`); };

// Read the bounded, ordinary ZIP format used by Garda. Never extract arbitrary paths.
// ZIP64, multipart, encrypted, symlink and unsupported compression entries fail closed.
export function readArchive(buffer) {
  if (buffer.length < 22 || buffer.length > MAX_ARCHIVE) invalid('archive size');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0) invalid('missing end record');
  const count = buffer.readUInt16LE(end + 10);
  const centralSize = buffer.readUInt32LE(end + 12);
  const centralOffset = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== count || count > 128 || centralOffset + centralSize !== end) invalid('unsupported central directory');
  const files = {};
  const names = new Set();
  let cursor = centralOffset;
  let totalSize = 0;
  const text = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) invalid('central entry');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const size = buffer.readUInt32LE(cursor + 20);
    const originalSize = buffer.readUInt32LE(cursor + 24);
    const nameSize = buffer.readUInt16LE(cursor + 28);
    const extraSize = buffer.readUInt16LE(cursor + 30);
    const commentSize = buffer.readUInt16LE(cursor + 32);
    const attributes = buffer.readUInt32LE(cursor + 38);
    const offset = buffer.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameSize + extraSize + commentSize;
    if (next > end) invalid('truncated entry');
    const name = text.decode(buffer.subarray(cursor + 46, cursor + 46 + nameSize));
    const parts = name.replace(/\/$/, '').split('/');
    if (!name || /[\\\x00-\x1f]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name) || parts.some((part) => !part || part === '.' || part === '..')) invalid('unsafe path');
    if (names.has(name) || ((attributes >>> 16) & 0xf000) === 0xa000) invalid('duplicate path or symlink');
    names.add(name);
    totalSize += originalSize;
    if (flags & ~0x80e || ![0, 8].includes(method) || buffer.readUInt16LE(cursor + 34) || size === 0xffffffff || originalSize > MAX_FILE || totalSize > 128 * 1024 * 1024 || originalSize > Math.max(size * 200, 1024 * 1024)) invalid('unsupported or excessive entry');
    const table = tables.find((key) => name === `json/${key}.json`);
    if (table) {
      if (offset + 30 > centralOffset || buffer.readUInt32LE(offset) !== 0x04034b50) invalid('local header');
      const localNameSize = buffer.readUInt16LE(offset + 26);
      const start = offset + 30 + localNameSize + buffer.readUInt16LE(offset + 28);
      if (start + size > centralOffset || text.decode(buffer.subarray(offset + 30, offset + 30 + localNameSize)) !== name || buffer.readUInt16LE(offset + 6) !== flags || buffer.readUInt16LE(offset + 8) !== method) invalid('local entry mismatch');
      const compressed = buffer.subarray(start, start + size);
      const content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_FILE });
      if (content.length !== originalSize || crc32(content) !== crc) invalid('size or CRC mismatch');
      files[table] = content;
    }
    cursor = next;
  }
  if (cursor !== end || tables.some((name) => !files[name])) invalid('missing datasets or directory mismatch');
  return files;
}
