import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../components/HomePromotions.tsx',import.meta.url),'utf8');
const nodes=t=>!t?[]:Array.isArray(t)?t.flatMap(nodes):t.props?[t,...nodes(t.props.children)]:[];
function harness(){
 let cursor=0;const state=[],effects=[],scrolls=[],routes=[],intervals=[];let dimensions={width:390,height:844,fontScale:1};
 const jsx=(type,props)=>({type,props:props||{}});
 const hooks={useState:v=>{const i=cursor++;if(!(i in state))state[i]=v;return[state[i],v=>state[i]=v];},useRef:v=>{const i=cursor++;if(!(i in state))state[i]={current:v===null?{scrollTo:x=>scrolls.push(x)}:v};return state[i];},useCallback:fn=>fn,useEffect:(fn,deps)=>effects.push({fn,deps})};
 const native=new Proxy({Platform:{OS:'web'},StyleSheet:{create:s=>s}},{get:(o,k)=>o[k]||k});
 const module={exports:{},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval:()=>{},require:n=>n==='react'?hooks:n==='react-native'?native:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n.includes('lucide')?{ArrowRight:'ArrowRight',ChevronLeft:'ChevronLeft',ChevronRight:'ChevronRight'}:n.includes('useAdaptiveLayout')?{useAdaptiveLayout:()=>dimensions}:n.includes('glass')?{GLASS:{},useReducedMotion:()=>false}:n.includes('gallery')?{wrapSlideIndex:(i,n)=>(i%n+n)%n}:n.includes('i18n')?{t:k=>({'home.moreHome':'More home.\nLess spend.','home.exploreDeals':'Explore deals','home.madeToOrder':'MADE TO ORDER','home.yourHomeYourWay':'Your home.\nYour way.','home.customize':'Customize your space','home.littleSpaces':'LITTLE SPACES, BIG IDEAS','home.littleDreamers':'Room for little\ndreamers.','home.exploreKids':'Explore kids’ rooms'})[k]??k}:1};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module);
 const render=()=>{cursor=0;effects.length=0;return module.exports.HomePromotions({onShop:()=>routes.push('deals'),onCategory:c=>routes.push(c),onCustomize:()=>routes.push('customization')});};
 const find=predicate=>{const n=nodes(render()).find(predicate);assert(n);return n;};
 return{render,find,scrolls,routes,effects,intervals,resize:(width,height=844,fontScale=1)=>dimensions={width,height,fontScale},click:label=>find(n=>n.props.accessibilityLabel===label).props.onPress()};
}
test('controls wrap, swipe updates the counter, and resizing realigns the same promotion',()=>{
 // The shipped carousel has no prev/next arrows: dot controls select a
 // promotion directly and autoplay advance wraps from the last slide to the first.
 const h=harness();const counter=v=>assert(nodes(h.render()).some(n=>Array.isArray(n.props.children)&&n.props.children.join('')===v));
 counter('1 / 3');h.click('Show promotion 3');counter('3 / 3');h.click('Show promotion 1');counter('1 / 3');
 h.find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{x:712}}});counter('3 / 3');
 h.find(n=>n.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width:700}}});h.render();h.effects[1].fn();assert.equal(h.scrolls.at(-1).x,1400);assert.equal(h.scrolls.at(-1).animated,false);
 h.effects[0].fn();h.intervals.at(-1).fn();counter('1 / 3');
});
