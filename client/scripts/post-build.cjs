const fs = require('fs-extra');
const crypto = require('crypto');

const digest = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

async function copyWithLockedDestinationRecovery(source, destination) {
  try {
    await fs.copy(source, destination);
    return;
  } catch (error) {
    if (error.code !== 'EBUSY' && error.code !== 'EPERM') throw error;
    // Windows can briefly lock an unchanged asset while the dev server or
    // indexer is reading it. Do not overwrite an identical destination.
    if (await fs.pathExists(destination) && (await digest(source)) === (await digest(destination))) return;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      try { await fs.copy(source, destination); return; } catch (retryError) {
        if (retryError.code !== 'EBUSY' && retryError.code !== 'EPERM') throw retryError;
        if (await fs.pathExists(destination) && (await digest(source)) === (await digest(destination))) return;
        if (attempt === 3) throw retryError;
      }
    }
  }
}

async function postBuild() {
  try {
    await copyWithLockedDestinationRecovery('public/assets', 'dist/assets');
    await copyWithLockedDestinationRecovery('public/robots.txt', 'dist/robots.txt');
    console.log('✅ PWA icons and robots.txt copied successfully. Glob pattern warnings resolved.');
  } catch (err) {
    console.error('❌ Error copying files:', err);
    process.exit(1);
  }
}

postBuild();
