import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const utility = { exports: {} };
vm.runInNewContext(compile(read('utils/adaptiveLayout.ts')), utility);
const { gridMetrics, layoutMode, usableSegment } = utility.exports;

test('window breakpoints use exact boundaries, not device or orientation labels', () => {
  for (const [width, expected] of [[320,'compact'],[599,'compact'],[600,'medium'],[839,'medium'],[840,'expanded'],[1199,'expanded'],[1200,'wide']]) assert.equal(layoutMode(width), expected);
});
test('cards and gaps fit at phone, tablet, split-window and wide widths', () => {
  for (const width of [240,288,358,568,600,736,808,992,1248,1328]) {
    const { columns, gap, cardWidth } = gridMetrics(width);
    assert(columns >= 1 && columns <= 5);
    assert(Math.abs(columns * cardWidth + (columns - 1) * gap - width) < 0.001);
    assert(cardWidth >= 0);
  }
  assert.equal(gridMetrics(288).columns, 1);
  assert.equal(gridMetrics(358).columns, 2);
  assert.equal(gridMetrics(736).columns, 3);
  assert.equal(gridMetrics(1328).columns, 5);
});
test('large text reduces columns instead of compressing card copy', () => {
  for (const width of [358,736,992,1328]) assert(gridMetrics(width, 1.8).columns < gridMetrics(width).columns);
});
test('separating book and tabletop displays choose a complete usable region', () => {
  assert.equal(usableSegment([{left:0,top:0,width:530,height:800},{left:550,top:0,width:530,height:800}],1080,800).left, 0);
  assert.equal(usableSegment([{left:0,top:0,width:900,height:350},{left:0,top:370,width:900,height:430}],900,800).top, 370);
});
test('unsupported, continuous and malformed segment data use the ordinary responsive fallback', () => {
  for (const segments of [[],[{left:0,top:0,width:900,height:800}],[{left:-1,top:0,width:500,height:800},{left:510,top:0,width:500,height:800}],[{left:0,top:0,width:NaN,height:800}]]) assert.equal(usableSegment(segments,900,800),undefined);
});
test('CSS-only fold implementations read env segments and remove measuring probes', () => {
  const module = {exports:{}};
  vm.runInNewContext(compile(read('utils/webDisplaySegments.ts')), module);
  let removed = 0; let created = 0;
  const fake = { matchMedia: q => ({matches:q==='(horizontal-viewport-segments: 2)'}), document:{ body:{ appendChild(){} }, createElement(){ const i=created++; return {setAttribute(){},style:{},getBoundingClientRect:()=>({left:i*550,top:0,width:530,height:800}),remove(){removed++;}}; } } };
  const result = module.exports.readDisplaySegments(fake);
  assert.equal(result.length,2); assert.equal(result[1].left,550); assert.equal(removed,2);
});

test('the real adaptive list measures its pane, supports one column, and keeps the visible product on reflow', () => {
  const slots=[]; let cursor=0; let layout={width:1024,fontScale:1};
  const jsx=(type,props,key)=>({type,props:props||{},key});
  const hooks={createContext:()=>({Provider:'CardProvider'}),useContext:()=>null,useEffect:()=>{},useRef:v=>{const i=cursor++; return slots[i]??=( {current:v} );},useState:v=>{const i=cursor++; if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];}};
  hooks.createElement=(type,props,...children)=>jsx(type,{...props, ...(children.length ? {children:children.length===1?children[0]:children} : {})},props?.key);
  const module={exports:{},require:name=>name==='react'?hooks:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='react-native'?{FlatList:'FlatList',View:'View'}:name.includes('useAdaptiveLayout')?{useAdaptiveLayout:()=>layout}:utility.exports};
  vm.runInNewContext(compile(read('components/AdaptiveProductList.tsx')), module);
  const props={data:Array.from({length:100},(_,i)=>({id:String(i)}))};
  const render=()=>{cursor=0;const tree=module.exports.AdaptiveProductList(props);return{tree,list:tree.props.children.props.children};};
  let {tree,list}=render();
  assert.equal(list.props.numColumns,4);
  list.props.onViewableItemsChanged({viewableItems:[{item:{id:'40'}}]});
  tree.props.onLayout({nativeEvent:{layout:{width:390}}}); layout={width:390,fontScale:1};
  ({list}=render()); assert.equal(list.props.numColumns,2); assert.equal(list.props.initialScrollIndex,20);
  tree.props.onLayout({nativeEvent:{layout:{width:260}}});
  ({list}=render()); assert.equal(list.props.numColumns,1); assert.equal(list.props.columnWrapperStyle,undefined);
});

test('resize does not reset the active product photo, route, or selected size', () => {
  const details = read('app/ProductDetails.tsx');
  assert.match(details,/\[sourceId, galleryKey, slides.length, webGalleryOffset\]/);
  assert.doesNotMatch(details,/\[sourceId, galleryKey, slides.length, slideBox.width/);
  assert.match(details,/activeSlideRef.current \+ 1/);
  assert.match(read('app/_layout.tsx'),/<AdaptiveFrame><Stack(?:\s[^>]+)?>/);
  assert.doesNotMatch(read('hooks/useAdaptiveLayout.tsx'),/key=\{/);
  assert.match(read('components/catalog/BottomNav.tsx'),/navigation-rail/);
});
