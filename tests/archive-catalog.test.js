import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  listCbzImageEntriesSync,
  loadComicInfoForSourceSync
} = require('../electron/services/archive.cjs');

const tempDirs = [];

function dosDateTime() {
  return { time: 0, date: 0 };
}

function makeStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const dataBuffer = Buffer.from(entry.data, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, dataBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function writeCbzFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-cbz-'));
  tempDirs.push(root);
  const cbzPath = path.join(root, 'Chapter 01.cbz');
  fs.writeFileSync(cbzPath, makeStoredZip([
    { name: '002.png', data: 'two' },
    { name: 'ComicInfo.xml', data: '<ComicInfo><Series>Fast Manga</Series><Title>Chapter 1</Title></ComicInfo>' },
    { name: '001.jpg', data: 'one' }
  ]));
  return cbzPath;
}

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('CBZ archive catalog', () => {
  it('lists images and reads ComicInfo without reading the full archive buffer', () => {
    const cbzPath = writeCbzFixture();
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = function patchedReadFileSync(target, ...args) {
      if (path.resolve(String(target)) === path.resolve(cbzPath)) {
        throw new Error('full archive read is not allowed');
      }
      return originalReadFileSync.call(this, target, ...args);
    };

    try {
      expect(listCbzImageEntriesSync(cbzPath)).toEqual(['001.jpg', '002.png']);
      expect(loadComicInfoForSourceSync(cbzPath)).toMatchObject({
        series: 'Fast Manga',
        title: 'Chapter 1'
      });
    } finally {
      fs.readFileSync = originalReadFileSync;
    }
  });
});
