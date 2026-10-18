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
test('promotions are height-bounded rather than square posters and adapt to short windows and enlarged text',()=>{
 const h=harness();for(const [width,height,max]of[[320,844,176],[390,844,176],[768,1000,204],[1280,900,204],[700,360,148]]){
  h.resize(width,height);const scroll=h.find(n=>n.type==='ScrollView');assert.equal(scroll.props.style.height,max);
 }
 h.resize(390,844,1.5);assert.equal(h.find(n=>n.type==='ScrollView').props.style.height,264);
});
test('actual viewport measurement controls every slide and snapping, not a capped partial slide',()=>{
 const h=harness();h.find(n=>n.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width:700}}});const tree=h.render();
 assert.equal(nodes(tree).find(n=>n.type==='ScrollView').props.snapToInterval,700);
 assert(nodes(tree).filter(n=>n.props.testID==='home-promotion-slide').every(n=>n.props.style.width===700));
});
test('controls wrap, swipe updates the counter, and resizing realigns the same promotion',()=>{
 const h=harness();h.click('Previous promotion');assert(nodes(h.render()).some(n=>Array.isArray(n.props.children)&&n.props.children.join('')==='3 / 3'));
 h.click('Next promotion');assert(nodes(h.render()).some(n=>Array.isArray(n.props.children)&&n.props.children.join('')==='1 / 3'));
 h.find(n=>n.type==='ScrollView').props.onScroll({nativeEvent:{contentOffset:{x:712}}});assert(nodes(h.render()).some(n=>Array.isArray(n.props.children)&&n.props.children.join('')==='3 / 3'));
 h.find(n=>n.type==='ScrollView').props.onLayout({nativeEvent:{layout:{width:700}}});h.render();h.effects[0].fn();assert.equal(h.scrolls.at(-1).x,1400);assert.equal(h.scrolls.at(-1).animated,false);
});
test('promotions preserve Deals and kids-category destinations',()=>{
 const h=harness();h.click('Explore deals');h.click('Customize your space');h.click('Explore kids’ rooms');assert.deepEqual(h.routes,['deals','customization','kids-and-teens']);
});

test('promotions contain complete product photos instead of cropping category posters',()=>{
 const h=harness();const images=nodes(h.render()).filter(n=>n.type==='Image');
 assert.equal(images.length,3);assert(images.every(n=>n.props.resizeMode==='contain'));
 assert(!source.includes('home-kids.webp'));assert(!source.includes('home-furniture.webp'));
});
test('pay-later banner uses the supplied artwork without cropping, stretching or tap actions',()=>{
 const code=readFileSync(new URL('../components/HomePaymentCard.tsx',import.meta.url),'utf8');
 const jsx=(type,props)=>({type,props:props||{}});
 const native=new Proxy({StyleSheet:{create:s=>s}},{get:(o,k)=>o[k]||k});
 const module={exports:{},require:n=>n==='react-native'?native:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:n.includes('glass')?{GLASS:{panelStrong:{}}}:n.endsWith('.webp')?1:{Wallet:'Wallet'}};
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module);
 const tree=module.exports.HomePaymentCard();assert.equal(tree.type,'View');assert.equal(tree.props.onPress,undefined);assert.equal(tree.props.accessibilityRole,undefined);
 assert.equal(tree.props.style.marginHorizontal,16);assert.equal(tree.props.style.marginTop,10);assert.equal(tree.props.style.alignItems,'center');
 const images=nodes(tree).filter(n=>n.type==='Image');assert.equal(images.length,1);
 assert.equal(images[0].props.resizeMode,'contain');assert.equal(images[0].props.style.width,'100%');const frame=nodes(tree).find(n=>n.props.testID==='home-payment-artwork');assert(frame);assert.equal(frame.props.style.aspectRatio,1920/197);
 assert.equal(frame.props.style.maxWidth,624);assert.equal(frame.props.style.borderRadius,8);assert(frame.props.style.maxWidth/frame.props.style.aspectRatio<=65);
 assert.equal(images[0].props.style.height,'100%'); // Prevent RN Web from reserving the intrinsic 197px height.
 assert.equal(images[0].props.accessibilityLabel,'Shop now. Pay later with Tabby and Tamara.');
 assert(code.includes("require('../assets/images/home-deals-strip.webp')"));
 assert(!nodes(tree).some(n=>n.props.onPress||n.props.accessibilityRole==='button'||n.type==='Pressable'));
});

test('compact section spacing is limited to Home and does not shrink the kids carousel',()=>{
 const app=readFileSync(new URL('../app/(tabs)/index.tsx',import.meta.url),'utf8');
 const home=app.slice(app.indexOf('function HomeContent('),app.indexOf('function TrustRow('));
 assert.equal((home.match(/<SectionTitle compact title=/g)||[]).length,3);
 assert(app.includes('homeSectionTitle: { paddingTop: 14, paddingBottom: 8 }'));
 assert(app.includes('compact = false'));
 assert(app.includes('officialFeature: { marginHorizontal: 20, marginTop: 12,'));
 assert(app.includes('collectionStories: { marginTop: 12, gap: 10 }'));
});

test('Shop by room keeps its photos and category actions without decorative icon badges',()=>{
 const app=readFileSync(new URL('../app/(tabs)/index.tsx',import.meta.url),'utf8');
 const home=app.slice(app.indexOf('function HomeContent('),app.indexOf('function TrustRow('));
 assert(!home.includes('styles.roomIcon'));assert(!home.includes("'◒'"));
 assert(home.includes('onPress={() => onCategory(cat.s)}'));
 assert(home.includes('source={categoryThumbnail(cat.s)}'));
 assert(home.includes('<Text style={styles.roomLabel}>{cat.n}</Text>'));
});
