const fs = require('node:fs');
const path = require('node:path');

let cachedIconMap;
function getLucideIconMap() {
  if (cachedIconMap !== undefined) return cachedIconMap;
  const barrelPath = path.join(
    __dirname,
    'node_modules/lucide-react-native/dist/esm/lucide-react-native.js',
  );
  if (!fs.existsSync(barrelPath)) {
    cachedIconMap = null;
    return cachedIconMap;
  }
  const map = Object.create(null);
  const src = fs.readFileSync(barrelPath, 'utf8');
  const exportRe = /export\s*\{([^}]+)\}\s*from\s*'\.\/icons\/([^']+)\.js'/g;
  let match;
  while ((match = exportRe.exec(src))) {
    const slug = match[2];
    const specList = match[1].split(',');
    for (const entry of specList) {
      const asMatch = /\bas\s+(\w+)/.exec(entry);
      if (asMatch) map[asMatch[1]] = slug;
    }
  }
  cachedIconMap = map;
  return cachedIconMap;
}

function lucideTreeShakePlugin({ types: t }) {
  return {
    name: 'lucide-tree-shake',
    visitor: {
      ImportDeclaration(importPath) {
        if (importPath.node.source.value !== 'lucide-react-native') return;
        if (importPath.node.importKind === 'type') return;
        const specifiers = importPath.node.specifiers;
        if (!specifiers.length) return;
        const iconMap = getLucideIconMap();
        if (!iconMap) return;
        const replacements = [];
        for (const spec of specifiers) {
          if (!t.isImportSpecifier(spec) || spec.importKind === 'type') return;
          const importedName = t.isIdentifier(spec.imported)
            ? spec.imported.name
            : spec.imported.value;
          const slug = iconMap[importedName];
          if (!slug) return;
          replacements.push(
            t.importDeclaration(
              [t.importDefaultSpecifier(t.identifier(spec.local.name))],
              t.stringLiteral(`lucide-react-native/dist/esm/icons/${slug}`),
            ),
          );
        }
        if (replacements.length) importPath.replaceWithMultiple(replacements);
      },
    },
  };
}

module.exports = function (api) {
  const isTest = Boolean(process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test');
  api.cache.using(() => (isTest ? 'test' : 'app'));
  return {
    presets: ['babel-preset-expo'],
    plugins: isTest ? [] : [lucideTreeShakePlugin],
  };
};
