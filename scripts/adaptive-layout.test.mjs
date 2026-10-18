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

test('the real adaptive list measures its pane, supports one column, and keeps the visible product on reflow', () => {
  const slots=[]; let cursor=0; let layout={width:1024,fontScale:1};
  const jsx=(type,props,key)=>({type,props:props||{},key});
  const hooks={createContext:()=>({Provider:'CardProvider'}),useContext:()=>null,useEffect:()=>{},useRef:v=>{const i=cursor++; return slots[i]??=( {current:v} );},useState:v=>{const i=cursor++; if(!(i in slots))slots[i]=v;return[slots[i],v=>slots[i]=v];}};
  hooks.createElement=(type,props,...children)=>jsx(type,{...props, ...(children.length ? {children:children.length===1?children[0]:children} : {})},props?.key);
  const module={exports:{},require:name=>name==='react'?hooks:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='react-native'?{FlatList:'FlatList',View:'View',Platform:{OS:'ios'}}:name.includes('useAdaptiveLayout')?{useAdaptiveLayout:()=>layout}:utility.exports};
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
