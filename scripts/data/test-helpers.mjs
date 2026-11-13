import { deflateRawSync } from 'node:zlib';
import { crc32 } from './zip.mjs';
import { readDatasets, tables } from './schema.mjs';

export function fixture() {
  const data = readDatasets('src/data');
  const row = data.gi_comuni_cap[0];
  return {
    gi_comuni_cap: [row],
    gi_province: [{ ...data.gi_province.find((p) => p.sigla_provincia === row.sigla_provincia), numero_comuni: '1' }],
    gi_regioni: [{ ...data.gi_regioni.find((r) => r.codice_regione === row.codice_regione), numero_comuni: '1', numero_province: '1' }],
  };
}
export const buffers = (data) => Object.fromEntries(tables.map((name) => [name, Buffer.from(JSON.stringify(data[name]) + '\n')]));

export function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content, options = {}] of entries) {
    const filename = Buffer.from(name);
    const body = options.stored ? content : deflateRawSync(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(options.flags || 0, 6);
    header.writeUInt16LE(options.stored ? 0 : 8, 8);
    header.writeUInt32LE(crc32(content), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    header.copy(directory, 6, 4, 28);
    directory.writeUInt32LE(options.attributes || 0, 38);
    directory.writeUInt32LE(offset, 42);
    local.push(header, filename, body);
    central.push(directory, filename);
    offset += header.length + filename.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export const datasetZip = (data, extra = [], options = {}) => zip([...Object.entries(buffers(data)).map(([name, content]) => [`json/${name}.json`, content, options]), ...extra]);
