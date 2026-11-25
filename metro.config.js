const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const webRouterCtx = path.resolve(__dirname, 'utils/expoRouterCtx.web.js');
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === 'web' &&
    (moduleName === 'expo-router/_ctx' ||
      ((moduleName === './_ctx' || moduleName === '../../_ctx') &&
        context.originModulePath.includes(`${path.sep}expo-router${path.sep}`)))
  ) {
    return { type: 'sourceFile', filePath: webRouterCtx };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
