import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../components/HomePromotions.tsx',import.meta.url),'utf8');
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):t.props?[t,...nodes(t.props.children)]:[];
function harness(){
 let cursor=0;const state=[],effects=[],scrolls=[],routes=[];let dimensions={width:390,height:844,fontScale:1};
 const jsx=(type,props)=>({type,props:props||{}});
 const hooks={useState:v=>{const i=cursor++;if(!(i in state))state[i]=v;return[state[i],v=>state[i]=v];},useRef:()=>({current:{scrollTo:v=>scrolls.push(v)}}),useEffect:(fn,deps)=>effects.push({fn,deps})};
 const native=new Proxy({Platform:{OS:'web'},StyleSheet:{create:s=>s}},{get:(o,k)=>o[k]||k});
 const module={exports:{},require:n=>n==='react'?hooks:n==='react-native'?native:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n.includes('lucide')?{ArrowRight:'ArrowRight',ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight'}:n.includes('useAdaptiveLayout')?{useAdaptiveLayout:()=>dimensions}:n.includes('glass')?{GLASS:{}}:n.includes('gallery')?{wrapSlideIndex:(i,n)=>(i%n+n)%n}:1};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module);
 const render=()=>{cursor=0;effects.length=0;return module.exports.HomePromotions({onShop:()=>routes.push('deals'),onCategory:c=>routes.push(c),onCustomize:()=>routes.push('customization')});};
 const find=predicate=>{const n=nodes(render()).find(predicate);assert(n);return n;};
 return{render,find,scrolls,routes,effects,resize:(width,height=844,fontScale=1)=>dimensions={width,height,fontScale},click:label=>find(n=>n.props.accessibilityLabel===label).props.onPress()};
}
test('controls wrap, swipe updates the counter, and resizing realigns the same promotion',()=>{
 const h=harness();h.click('Previous promotion');assert(nodes(h.render()).some(n=>Array.isArray(n.props.children)&&n.props.children.join('')==='3 / 3'));
 h.click('Next promotion');assert(nodes(h.render()).some(n=>Array.isArray(n.props.children)&&n.props.children.join('')==='1 / 3'));
 h.find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{x:712}}});assert(nodes(h.render()).some(n=>Array.isArray(n.props.children)&&n.props.children.join('')==='3 / 3'));
 h.find(n=>n.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width:700}}});h.render();h.effects[0].fn();assert.equal(h.scrolls.at(-1).x,1400);assert.equal(h.scrolls.at(-1).animated,false);
});
