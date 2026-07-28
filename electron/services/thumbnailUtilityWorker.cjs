const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const parentPort = process.parentPort;

sharp.concurrency(1);

async function generateThumbnail({
  sourcePath,
  targetPath,
  width,
  height,
  quality
}) {
  const png = await sharp(sourcePath, {
    failOn: 'error',
    limitInputPixels: 160_000_000
  })
    .rotate()
    .resize({
      width,
      height,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: quality === 'best' ? sharp.kernel.lanczos3 : sharp.kernel.cubic
    })
    .png({
      compressionLevel: quality === 'best' ? 7 : 6,
      adaptiveFiltering: quality === 'best'
    })
    .toBuffer();
  if (!png?.length) throw new Error('Thumbnail encoding failed');
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, png);
    await fs.promises.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    throw error;
  }
  return targetPath;
}

if (!parentPort) {
  throw new Error('Electron utility process parentPort is unavailable');
}

parentPort.on('message', async (event) => {
  const message = event?.data;
  if (message?.type !== 'generate') return;
  try {
    const targetPath = await generateThumbnail(message.payload || {});
    parentPort.postMessage({
      type: 'result',
      requestId: message.requestId,
      targetPath
    });
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: String(error?.message || error)
    });
  }
});

module.exports = {
  generateThumbnail
};
