const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, utilityProcess } = require('electron');
const packagedArchive = String(process.env.SAWA_SMOKE_APP_ASAR || '').trim();
const serviceRoot = packagedArchive
  ? path.join(packagedArchive, 'electron', 'services')
  : path.join(__dirname, '..', 'electron', 'services');
const { createThumbnailUtilityPool } = require(path.join(serviceRoot, 'thumbnailUtilityClient.cjs'));

app.whenReady().then(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sawa-thumbnail-smoke-'));
  const sourcePath = path.join(tempDir, 'source.svg');
  const targetPath = path.join(tempDir, 'thumbnail.png');
  fs.writeFileSync(
    sourcePath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48"><rect width="32" height="48" fill="#b14cff"/></svg>'
  );
  const pool = createThumbnailUtilityPool({
    forkImpl: utilityProcess.fork.bind(utilityProcess),
    workerPath: path.join(serviceRoot, 'thumbnailUtilityWorker.cjs'),
    maxConcurrent: 2,
    taskTimeoutMs: 10_000
  });

  try {
    const result = await pool.generateThumbnail({
      sourcePath,
      targetPath,
      width: 256,
      height: 256,
      quality: 'best'
    });
    const stat = fs.statSync(result);
    if (stat.size <= 0) throw new Error('Generated thumbnail is empty');
    process.stdout.write(`THUMBNAIL_UTILITY_OK bytes=${stat.size}\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`THUMBNAIL_UTILITY_FAILED ${error?.stack || error}\n`);
    process.exitCode = 1;
  } finally {
    await pool.shutdown();
    fs.rmSync(tempDir, { recursive: true, force: true });
    app.quit();
  }
});
