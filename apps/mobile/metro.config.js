const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const appNodeModules = path.join(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

// Shared packages live outside the app folder; Metro has to watch them to bundle their source.
config.watchFolders = [path.join(monorepoRoot, 'packages')];
config.resolver.nodeModulesPaths = [appNodeModules];

// file: junctions make packages/core/src/useWordApp.ts look like it lives above the app, so
// Metro can pick a second React and every hook blows up. Always use the app's copy.
// Hierarchical lookup stays on so nested packages such as @react-native/virtualized-lists resolve.
config.resolver.extraNodeModules = {
  react: path.join(appNodeModules, 'react'),
  'react-native': path.join(appNodeModules, 'react-native'),
};

module.exports = config;
