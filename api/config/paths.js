const path = require('path');

// Keep mutable application data outside the source checkout. The deployment
// sets LIBRECHAT_DATA_DIR to the D-drive data directory; the fallback remains
// source-local for unconfigured upstream development installs.
const dataRoot = process.env.LIBRECHAT_DATA_DIR
  ? path.resolve(process.env.LIBRECHAT_DATA_DIR)
  : path.resolve(__dirname, '..', '..');

module.exports = {
  root: path.resolve(__dirname, '..', '..'),
  uploads: process.env.LIBRECHAT_UPLOADS_DIR
    ? path.resolve(process.env.LIBRECHAT_UPLOADS_DIR)
    : path.join(dataRoot, 'uploads'),
  clientPath: path.resolve(__dirname, '..', '..', 'client'),
  dist: path.resolve(__dirname, '..', '..', 'client', 'dist'),
  publicPath: path.resolve(__dirname, '..', '..', 'client', 'public'),
  fonts: path.resolve(__dirname, '..', '..', 'client', 'public', 'fonts'),
  assets: path.resolve(__dirname, '..', '..', 'client', 'public', 'assets'),
  imageOutput: path.resolve(__dirname, '..', '..', 'client', 'public', 'images'),
  structuredTools: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'structured'),
  pluginManifest: path.resolve(__dirname, '..', 'app', 'clients', 'tools', 'manifest.json'),
};
