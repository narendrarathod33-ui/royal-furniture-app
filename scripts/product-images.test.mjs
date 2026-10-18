import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const source = read('app/(tabs)/index.tsx');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const card = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'ProductCard');
const compile = code => ts.transpileModule(code, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const nodes = tree => !tree ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : tree.props ? [tree, ...nodes(tree.props.children)] : [];
function harness() {
  let failed; let width = 240; let image = {uri:'wide-photo.webp'};
  const jsx = (type, props) => ({type,props:props||{}});
  const context = { exports:{}, require:()=>({jsx,jsxs:jsx}), useGridCardWidth:()=>width,
    useState:()=>[failed,v=>{failed=v;}], photoFor:()=>image, styles:new Proxy({},{get:(_,key)=>key}),
    COLORS:{}, money:v=>`AED ${v}`, shortName:v=>v, isMadeToOrderText:()=>false,
    Pressable:'Pressable',View:'View',Image:'Image',Text:'Text',Heart:'Heart'};
  vm.runInNewContext(compile(card.getText(ast))+'\nexports.card = ProductCard;',context);
  const props={product:{id:'sofa',n:'Sofa',o:100,l:100,c:'sofas'},onPress(){},wide:true};
  return {render:()=>context.exports.card(props), setWidth:v=>width=v, setImage:v=>image=v, props};
}
test('grid and rail cards preserve product proportions with contain rather than crop/fill',()=>{
  const h=harness();
  for(const wide of [true,false]) for(const width of [144,163,240,320]) {
    h.props.wide=wide;h.setWidth(width);
    const tree=h.render();const image=nodes(tree).find(n=>n.type==='Image');
    assert.equal(image.props.resizeMode,'contain');
    assert.equal(image.props.accessibilityLabel,'Sofa');
    if(wide) assert.equal(tree.props.style[1].width,width);
    assert.equal(nodes(tree).find(n=>n.props.testID==='product-thumbnail-frame').props.style,'productImage');
  }
});
test('failed or missing photos use an accessible fallback without removing the image frame',()=>{
  const h=harness();
  nodes(h.render()).find(n=>n.type==='Image').props.onError();
  let tree=h.render();assert(!nodes(tree).some(n=>n.type==='Image'));
  assert(nodes(tree).some(n=>n.props.accessibilityLabel==='Photo unavailable for Sofa'));
  assert(nodes(tree).some(n=>n.props.testID==='product-thumbnail-frame'));
  h.setImage(undefined);tree=h.render();assert(nodes(tree).some(n=>n.props.testID==='product-thumbnail-frame'));
});
test('a changed source retries normally, while a recreated failed source does not loop',()=>{
  const h=harness();nodes(h.render()).find(n=>n.type==='Image').props.onError();
  h.setImage({uri:'wide-photo.webp'});assert(!nodes(h.render()).some(n=>n.type==='Image'));
  h.setImage({uri:'portrait-photo.webp'});assert(nodes(h.render()).some(n=>n.type==='Image'));
});
test('thumbnail styles reserve a square for both rail and grid, without a fixed height',()=>{
  let properties;
  const visit=n=>{if(ts.isPropertyAssignment(n)&&n.name.getText(ast)==='productImage')properties=n.initializer;ts.forEachChild(n,visit);};visit(ast);
  const module={exports:{},GLASS:{hero:{}},glassTilt:()=>({})};
  vm.runInNewContext(compile('exports.style = '+properties.getText(ast)),module);
  assert.equal(module.exports.style.aspectRatio,1);assert.equal(module.exports.style.width,'100%');
  assert.equal(module.exports.style.height,undefined);assert.equal(module.exports.style.overflow,'hidden');
});
test('detail gallery, detail thumbnails and cart photos contain products; editorial and swatches still cover',()=>{
  const details=read('app/ProductDetails.tsx');
  assert.match(details,/style=\{styles.galleryThumbImage\} resizeMode="contain"/);
  assert.match(details,/style=\{styles.swatchImage\} resizeMode="cover"/);
  assert.match(source,/style=\{styles.cartPhoto\} resizeMode="contain"/);
  assert.match(read('components/HomePromotions.tsx'), /style=\{s.photo\} resizeMode="contain"/);
  const start=details.indexOf('testID="product-gallery-touch-surface"');
  assert.match(details.slice(start,details.indexOf('style={styles.slider}',start+1)),/resizeMode="contain"/);
});
