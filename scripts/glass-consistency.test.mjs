import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function tokens(platform) {
 const context = { exports: {}, require: name => name === 'react-native' ? { Platform: { OS: platform }, StyleSheet: { create: x => x, absoluteFillObject: {} } } : {} };
 vm.runInNewContext(compile(read('app/ui/glass.tsx')), context);
 return context.exports;
}
function styles(path, name = 's', platform = 'web') {
 const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 let object;
 function visit(n) { if(ts.isVariableDeclaration(n) && n.name.getText(source) === name && n.initializer && ts.isCallExpression(n.initializer)) object = n.initializer.arguments[0].getText(source); ts.forEachChild(n, visit); }
 visit(source); assert(object, `${path} ${name}`);
 const { GLASS, asTextStyle, glassTilt } = tokens(platform);
 const context = { exports: {}, GLASS, asTextStyle, glassTilt, StyleSheet: { absoluteFillObject: {} }, COLORS: new Proxy({}, {get:(_,k)=>k==='red'?'#DA1921':'#504C54'}), RED:'#AC332E' };
 vm.runInNewContext(compile(`exports.styles = (${object});`), context);
 return context.exports.styles;
}
test('shared glass tokens blur on web, and keep their tint/border fallback without unsupported native blur', () => {
 for(const platform of ['web','ios','android']) {
  const { GLASS }=tokens(platform);
  for(const key of ['panel','panelStrong','sheet','chip','chipActive','dark','input','nav']) {
   assert(GLASS[key].backgroundColor.startsWith('rgba(')); assert(GLASS[key].boxShadow);
   if(platform==='web')assert.match(GLASS[key].backdropFilter,/blur\(/);
   else assert.equal(GLASS[key].backdropFilter,undefined);
  }
  assert.equal(GLASS.hero.backdropFilter,undefined); // Product photos must stay crisp.
 }
});
test('routed and adaptive wrappers no longer hide the existing ambient backdrop', () => {
 assert(read('app/_layout.tsx').includes("contentStyle: { backgroundColor: 'transparent' }"));
 assert(read('app/(tabs)/_layout.tsx').includes("sceneStyle: { backgroundColor: 'transparent' }"));
 assert(read('app/_layout.tsx').includes('[role=\"tab\"]:focus-visible'));
 assert(read('app/_layout.tsx').includes('[role=\"radio\"]:focus-visible'));
 assert(read('hooks/useAdaptiveLayout.tsx').includes("return <View style={{ flex: 1, backgroundColor: 'transparent' }}"));
});
test('Browse and Deals sheets share the established sheet material without changing their geometry', () => {
 const glass=tokens('web').GLASS;
 for(const path of ['components/BrowseNavigation.tsx','components/DealsPage.tsx']) {
  const s=styles(path);assert.equal(s.sheet.backgroundColor,glass.sheet.backgroundColor);assert.equal(s.sheet.backdropFilter,glass.sheet.backdropFilter);assert.equal(s.sheet.maxWidth,640);
 }
 assert.equal(styles('components/BrowseNavigation.tsx').sheet.maxHeight,'88%');
 assert.equal(styles('components/DealsPage.tsx').sheet.minHeight,0);
});
test('newer controls reuse existing glass presets, with selected states still visibly distinct', () => {
 const g=tokens('web').GLASS;
 const browse=styles('components/BrowseNavigation.tsx'),custom=styles('components/CustomizationPage.tsx'),sandbox=styles('components/SandboxCheckout.tsx','styles');
 assert.equal(browse.search.backgroundColor,g.input.backgroundColor);
 assert.equal(browse.shortcut.backgroundColor,g.chip.backgroundColor);
 assert.equal(browse.shortcutSelected.backgroundColor,g.chipDarkActive.backgroundColor);
 assert.equal(custom.sort.backgroundColor,g.chip.backgroundColor);assert.equal(custom.sortSelected.backgroundColor,g.chipActive.backgroundColor);
 assert.equal(custom.hero.backgroundColor,'#F8F0EA'); // Preserve editorial colour, add chrome only.
 assert.equal(sandbox.panel.backgroundColor,g.panelStrong.backgroundColor);assert.equal(sandbox.button.backgroundColor,g.accent.backgroundColor);
 const viewer=styles('components/ProductPhotoViewer.tsx');assert.equal(viewer.button.backgroundColor,g.dark.backgroundColor);assert.equal(viewer.viewer.backgroundColor,'#19161DF5');
});
function luminance(hex) { const c=hex.match(/\w\w/g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
test('inactive navigation ink retains AA text contrast even over a black photo behind its translucent tint', () => {
 const nav=styles('components/catalog/BottomNav.tsx','floatingNavStyles');
 assert.equal(nav.surface.backgroundColor,'rgba(255,255,255,0.86)');assert.equal(nav.label.color,'#504C54');
 const worstBackground='#'+Math.round(255*.86).toString(16).repeat(3);
 assert((luminance(worstBackground)+.05)/(luminance(nav.label.color)+.05)>=4.5);
 assert.match(read('components/catalog/BottomNav.tsx'),/selected \? COLORS.red : '#504C54'/);
});
test('selected gallery thumbnail has a continuous brand-colour rim', () => {
 const s=styles('app/ProductDetails.tsx','styles');assert.equal(s.galleryThumbActive.borderTopColor,s.galleryThumbActive.borderColor);
});
