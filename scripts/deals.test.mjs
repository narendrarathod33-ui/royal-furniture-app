import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = code => ts.transpileModule(code, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const modules = {};
for(const name of ['catalogData','dealsCatalog','royalFurnitureData','sizeVariants']) {
 const context={exports:{},require:path=>modules[path.replace('./','')]};vm.runInNewContext(compile(read(`app/data/${name}.ts`)),context);modules[name]=context.exports;
}
const utility={exports:{},require:()=>modules.sizeVariants};vm.runInNewContext(compile(read('utils/deals.ts')),utility);
const {selectDeals,DEFAULT_DEAL_FILTERS,activeDealFilterCount}=utility.exports;
const products=modules.dealsCatalog.dealsCatalog;
const ids = list => Array.from(list,p=>p.id);
test('deal criteria and price boundaries match the previous pipeline for every existing filter combination',()=>{
 const before=JSON.stringify(products);
 const legacy=(f,q)=>modules.sizeVariants.collapseSizeFamilies(products.filter(p=>{
  const d=p.pc||(p.l>p.o?Math.round((1-p.o/p.l)*100):0);
  return d>=f.discount&&(f.category==='all'||p.c===f.category)&&p.n.toLowerCase().includes(q.toLowerCase())&&(f.price==='all'||f.price==='under500'&&p.o<500||f.price==='500to1500'&&p.o>=500&&p.o<=1500||f.price==='over1500'&&p.o>1500);
 }).sort((a,b)=>f.sort==='priceLow'?a.o-b.o:f.sort==='priceHigh'?b.o-a.o:f.sort==='name'?a.n.localeCompare(b.n):(b.pc||(b.l>b.o?Math.round((1-b.o/b.l)*100):0))-(a.pc||(a.l>a.o?Math.round((1-a.o/a.l)*100):0))));
 for(const category of ['all','sofas','household'])for(const discount of [41,50,60,70])for(const price of ['all','under500','500to1500','over1500'])for(const sort of ['priceLow','priceHigh','name','discount']) {
  const f={category,discount,price,sort};assert.deepEqual(ids(selectDeals(products,f,'a')),ids(legacy(f,'a')));
 }
 assert.equal(JSON.stringify(products),before);
});
test('deal price directions stay numeric after repeated switching and filter counts exclude default eligibility and sorting',()=>{
 for(const sort of ['priceLow','priceHigh','priceLow']) {
  const list=selectDeals(products,{...DEFAULT_DEAL_FILTERS,sort});assert(list.length>1);
  for(let i=1;i<list.length;i++)assert(sort==='priceHigh'?list[i-1].o>=list[i].o:list[i-1].o<=list[i].o);
 }
 assert.equal(activeDealFilterCount(DEFAULT_DEAL_FILTERS),0);
 assert.equal(activeDealFilterCount({category:'sofas',discount:70,price:'under500',sort:'priceHigh'}),3);
});
const nodes = tree => !tree ? [] : Array.isArray(tree)?tree.flatMap(nodes):tree.props?[tree,...nodes(tree.props.children),...nodes(tree.props.ListHeaderComponent),...nodes(tree.props.ListEmptyComponent)]:[];
function harness() {
 const slots=[];let cursor=0;
 const jsx=(type,props,key)=>({type,props:props||{},key});
 const hooks={useState:initial=>{const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef:value=>{const i=cursor++;return slots[i]??={current:value};},useMemo:fn=>fn()};
 const native=new Proxy({Platform:{OS:'web'},StyleSheet:{create:s=>s,absoluteFill:{} }},{get:(o,k)=>o[k]||k});
 const context={exports:{},require:name=>name==='react'?hooks:name==='react-native'?native:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:name==='lucide-react-native'?new Proxy({},{get:(_,k)=>k}):name.includes('useAdaptiveLayout')?{useAdaptiveLayout:()=>({width:390}),AdaptiveFrame:'AdaptiveFrame'}:name.includes('AdaptiveProductList')?{AdaptiveProductList:'AdaptiveProductList'}:name.includes('/glass')?{GLASS:{}}:name.includes('/deals')?utility.exports:1};
 vm.runInNewContext(compile(read('components/DealsPage.tsx')),context);
 const render=()=>{cursor=0;return context.exports.DealsPage({products,categories:modules.royalFurnitureData.royalFurnitureData.cats,header:'Header',photo:()=>1,renderCard:()=>null});};
 const find=predicate=>{const n=nodes(render()).find(predicate);assert(n);return n;};
 const click=label=>find(n=>n.props.accessibilityLabel===label).props.onPress();
 const list=()=>find(n=>n.type==='AdaptiveProductList');
 const open=()=>find(n=>n.props.accessibilityLabel?.startsWith('Filter and sort deals')).props.onPress();
 const apply=()=>find(n=>/^Show \d+ deals$/.test(n.props.accessibilityLabel)).props.onPress();
 return{render,find,click,list,open,apply};
}
test('filter sheet previews draft choices, cancels safely, then applies without losing selected criteria',()=>{
 const h=harness();const initial=ids(h.list().props.data);h.open();h.click('Sofa & Seating');h.click('50% or more');h.click('Price: high to low');
 assert.deepEqual(ids(h.list().props.data),initial,'draft must not change applied results');h.click('Close deal filters');assert.deepEqual(ids(h.list().props.data),initial);
 h.open();assert(h.find(n=>n.props.accessibilityLabel==='All categories').props.accessibilityState.checked);
 h.click('Sofa & Seating');h.click('50% or more');h.click('Price: high to low');h.apply();
 const list=h.list().props.data;assert(list.length>0);assert(list.every(p=>p.c==='sofas'));for(let i=1;i<list.length;i++)assert(list[i-1].o>=list[i].o);
 assert(h.find(n=>n.props.testID==='active-deal-filters'));
 h.open();assert(h.find(n=>n.props.accessibilityLabel==='Sofa & Seating'&&n.props.accessibilityRole==='radio').props.accessibilityState.checked);
});
test('reset stays a draft until apply; individual chips and clear all remove the correct filters',()=>{
 const h=harness();h.open();h.click('Sofa & Seating');h.click('50% or more');h.apply();const applied=ids(h.list().props.data);
 h.open();h.click('Reset deal filter choices');assert.deepEqual(ids(h.list().props.data),applied);h.click('Close deal filters');
 h.click('Remove 50%+ off filter');assert(h.list().props.data.every(p=>p.c==='sofas'));
 h.click('Clear all deal filters');assert.deepEqual(ids(h.list().props.data),ids(selectDeals(products,DEFAULT_DEAL_FILTERS)));
});
test('empty searches recover, and typing does not remount the list header/input on every character',()=>{
 const h=harness();const key=h.list().key;
 h.find(n=>n.props.accessibilityLabel==='Search deals').props.onChangeText('nothing-matches-this-query');assert.equal(h.list().props.data.length,0);assert.equal(h.list().key,key);
 h.find(n=>n.props.testID==='deals-empty-state');h.find(n=>n.props.children==='Explore all deals'&&n.type==='Text');
 h.click('Clear all deal filters');assert(h.list().props.data.length>0);
});
