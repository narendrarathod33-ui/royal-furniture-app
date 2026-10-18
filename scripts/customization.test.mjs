import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const utility={exports:{}};vm.runInNewContext(compile(read('utils/madeToOrder.ts')),utility);
const {isExplicitlyMadeToOrder,selectMadeToOrder,DEFAULT_CUSTOMIZATION_FILTERS}=utility.exports;
const module={exports:{}};vm.runInNewContext(compile(read('app/data/catalogData.ts')),module);const catalog=module.exports.catalogData;
const ids=list=>Array.from(list,p=>p.id);
test('only explicit Made to Order list markers qualify, not generic size, fabric or customization options',()=>{
 const base={id:'a',n:'Bed',c:'bedroom',o:100};
 for(const p of [{...base,d:'Made to order. Choose your fabric.'},{...base,d:'MADE-TO-ORDER furniture'},{...base,lb:['Made to Order']}])assert(isExplicitlyMadeToOrder(p));
 for(const p of [base,{...base,d:'Available in many fabrics and sizes.',customizable:true},{...base,d:'Custom sizes available',lb:['Trending']}])assert(!isExplicitlyMadeToOrder(p));
});
test('all and only the marked existing catalog entries are included, with no arbitrary cap or family omission',()=>{
 const expected=catalog.filter(p=>/\bmade[\s-]+to[\s-]+order\b/i.test(p.d||'')||(p.lb||[]).some(l=>/^made[\s-]+to[\s-]+order$/i.test(l.trim())));
 assert.equal(expected.length,134);
 const selected=selectMadeToOrder(catalog,DEFAULT_CUSTOMIZATION_FILTERS);
 assert.deepEqual(ids(selected),ids(expected));assert.equal(new Set(ids(selected)).size,selected.length);
});
test('category, search and both price directions cannot leak unmarked products or mutate the catalog',()=>{
 const before=JSON.stringify(catalog);
 for(const sort of ['priceLow','priceHigh','priceLow']){
  const results=selectMadeToOrder(catalog,{category:'sofas',query:'sofa',sort});assert(results.length>1);
  assert(results.every(p=>p.c==='sofas'&&isExplicitlyMadeToOrder(p)));
  for(let i=1;i<results.length;i++)assert(sort==='priceHigh'?results[i-1].o>=results[i].o:results[i-1].o<=results[i].o);
 }
 assert.equal(selectMadeToOrder(catalog,{category:'all',query:'nothingshouldmatch1234',sort:'featured'}).length,0);
 assert.equal(JSON.stringify(catalog),before);
});
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):t.props?[t,...nodes(t.props.children),...nodes(t.props.ListHeaderComponent),...nodes(t.props.ListEmptyComponent)]:[];
test('collection controls expose qualifying categories, update results and recover from an empty search',()=>{
 let filters={...DEFAULT_CUSTOMIZATION_FILTERS};
 const jsx=(type,props,key)=>({type,props:props||{},key});
 const native=new Proxy({StyleSheet:{create:s=>s}},{get:(o,k)=>o[k]||k});
 const runtime={exports:{},require:n=>n==='react'?{useMemo:fn=>fn(),useRef:()=>({current:null})}:n==='react-native'?native:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n.includes('lucide')?new Proxy({},{get:(_,k)=>k}):n.includes('madeToOrder')?utility.exports:n.includes('glass')?{GLASS:{}}:n.includes('useAdaptiveLayout')?{useAdaptiveLayout:()=>({width:390})}:n.includes('AdaptiveProductList')?{AdaptiveProductList:'AdaptiveProductList'}:1};
 vm.runInNewContext(compile(read('components/CustomizationPage.tsx')),runtime);
 const render=()=>runtime.exports.CustomizationPage({products:catalog,categories:[{s:'all-unmarked',n:'Unmarked'},{s:'sofas',n:'Sofas'},{s:'bedroom',n:'Bedroom'}],filters,onFiltersChange:f=>filters=f,renderCard:()=>null});
 const find=predicate=>{const node=nodes(render()).find(predicate);assert(node);return node;};
 assert(!nodes(render()).some(n=>n.props.accessibilityLabel==='Show Unmarked'));
 find(n=>n.props.accessibilityLabel==='Show Sofas').props.onPress();
 find(n=>n.props.accessibilityLabel==='Price: high to low').props.onPress();
 let list=find(n=>n.type==='AdaptiveProductList');assert(list.props.data.every(p=>p.c==='sofas'));
 find(n=>n.props.accessibilityLabel==='Search made-to-order products').props.onChangeText('nomatch1234');list=find(n=>n.type==='AdaptiveProductList');assert.equal(list.props.data.length,0);
 find(n=>n.props.accessibilityLabel==='Reset customization filters').props.onPress();assert.equal(find(n=>n.type==='AdaptiveProductList').props.data.length,134);
});
test('the kids promotion remains exactly unchanged and the Everyday promotion is replaced',()=>{
 const source=read('components/HomePromotions.tsx');
 assert(source.includes("{ key: 'kids', eyebrow: 'LITTLE SPACES, BIG IDEAS', title: 'Room for little\\ndreamers.', action: 'Explore kids’ rooms', category: 'kids-and-teens', image: require('../assets/images/catalog-live/bunny-kids-bed-200x140-single-size.webp') }"));
 assert(!source.includes('EVERYDAY FAVOURITES'));assert(source.includes("action: 'Customize your space'"));
});
