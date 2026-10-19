const fs = require('fs');
const src = fs.readFileSync('app/data/catalogData.ts', 'utf8');
const start = src.indexOf('[', src.indexOf('='));
const end = src.lastIndexOf('] as const');
const data = JSON.parse(src.slice(start, end + 1).replace(/] as const$/, ']'));

// [english, arabic] — colors tagged C, everything else T
const LEX = [
  ['Single Seater', 'T:أريكة بمقعد مفرد'], ['Kids Bunk Bed', 'T:سرير أطفال بطابقين'], ['Kid Bunk Bed', 'T:سرير أطفال بطابقين'],
  ['Bunk Bed', 'T:سرير بطابقين'], ['Kids Bed', 'T:سرير أطفال'], ['Baby Cot', 'T:سرير أطفال'], ['Baby Bed', 'T:سرير أطفال'],
  ['Sofa Bed', 'T:أريكة سرير'], ['Corner Sofa', 'T:أريكة زاوية'], ['Sofa Set', 'T:طقم أرائك'], ['Seater Sofa', 'T:أريكة'],
  ['Sofa', 'T:أريكة'], ['Bedroom Set', 'T:طقم غرفة نوم'], ['Dining Set', 'T:طقم طعام'], ['Dining Table', 'T:طاولة طعام'],
  ['Bed with Built In Foot Bench', 'T:سرير بمقعد مدمج'], ['Bed Frame', 'T:هيكل سرير'], ['Bed', 'T:سرير'],
  ['Wardrobe', 'T:دولاب ملابس'], ['Night Stand', 'T:كومودينو'], ['Night Table', 'T:كومودينو'],
  ['Bedside Table', 'T:كومودينو'], ['Bed Side Table', 'T:كومودينو'], ['Side Table', 'T:طاولة جانبية'],
  ['End Table', 'T:طاولة جانبية'], ['Center Table', 'T:طاولة وسط'], ['Coffee Table', 'T:طاولة قهوة'],
  ['Console Table', 'T:طاولة كونسول'], ['Tea Table', 'T:طاولة شاي'], ['Dresser with Mirror', 'T:منضدة زينة بمرآة'],
  ['Dresser with Chair', 'T:منضدة زينة مع كرسي'], ['Dresser', 'T:منضدة زينة'], ['Shoe Cabinet', 'T:خزانة أحذية'],
  ['Shoe Rack', 'T:حامل أحذية'], ['Cabinet', 'T:خزانة'], ['TV Unit', 'T:وحدة تلفزيون'], ['Tv Unit', 'T:وحدة تلفزيون'],
  ['TV Stand', 'T:حامل تلفزيون'], ['Wall Art', 'T:لوحة جدارية'], ['Wall Decor', 'T:ديكور جداري'],
  ['Wall Clock', 'T:ساعة حائط'], ['Wall Mirror', 'T:مرآة جدارية'], ['Mirror', 'T:مرآة'], ['Bookshelf', 'T:مكتبة'],
  ['Study Desk', 'T:مكتب دراسة'], ['Study Table', 'T:مكتب دراسة'], ['Desk', 'T:مكتب'], ['Dining Chair', 'T:كرسي طعام'],
  ['Arm Chair', 'T:كرسي بذراعين'], ['Armchair', 'T:كرسي بذراعين'], ['Bar Stool', 'T:مقعد بار'],
  ['Bar Cabinet', 'T:خزانة بار'], ['Office Chair', 'T:كرسي مكتب'], ['Chair', 'T:كرسي'], ['Stool', 'T:مقعد'],
  ['Bench', 'T:مقعد'], ['Mattress', 'T:مرتبة'], ['Pillow', 'T:مخدة'], ['Cushion', 'T:وسادة'], ['Ottoman', 'T:أوتومان'],
  ['Recliner', 'T:كرسي استرخاء'], ['Bean Bag', 'T:بين باج'], ['Toy Organizer', 'T:منظم ألعاب'],
  ['Toy Storage', 'T:منظم ألعاب'], ['Storage Box', 'T:صندوق تخزين'], ['Storage', 'T:تخزين'],
  ['Tea Light Holder', 'T:حامل شموع'], ['Candle Holder', 'T:حامل شموع'], ['Vase', 'T:مزهرية'],
  ['Planter', 'T:حاصل نباتات'], ['Dustbin', 'T:سلة مهملات'], ['Laundry Basket', 'T:سلة غسيل'],
  ['Reed Diffuser', 'T:عيدان عطرية'], ['Aroma Diffuser', 'T:موزع عطر'], ['Diffuser', 'T:موزع عطر'],
  ['Room Spray', 'T:معطر جو'], ['Wall Shelf', 'T:رف جداري'], ['Shelf', 'T:رف'], ['Clock', 'T:ساعة'],
  ['Table', 'T:طاولة'], ['Frame', 'T:إطار'], ['Organizer', 'T:منظم'], ['Rack', 'T:حامل'], ['Stand', 'T:حامل'],
  ['Trunk', 'T:صندوق'], ['Bench Cushion', 'T:وسادة مقعد'],
  // phrases / qualifiers
  ['Set of 2', 'Q:مكون من قطعتين'], ['Set of 3', 'Q:مكون من 3 قطع'], ['Set of 4', 'Q:مكون من 4 قطع'],
  ['Sun Lounger', 'T:كرسي شمس'], ['Lounger', 'T:كرسي استرخاء'], ['Nesting Tables', 'T:طاولات متداخلة'],
  ['Ottomon', 'T:أوتومان'], ['Pouf', 'T:بوف'], ['Seat', 'T:مقعد'], ['Tray', 'T:صينية'], ['Bowl', 'T:سلطانية'],
  ['Fountain', 'T:نافورة'], ['Deco', 'T:ديكور'], ['Indoor', 'Q:داخلي'],
  ['Framed Canvas', 'T:كانفس مؤطر'], ['Canvas', 'T:كانفس'], ['Framed', 'Q:مؤطر'],
  ['Matt Finish', 'Q:بتشطيب مطفي'], ['Multi Layered', 'Q:متعدد الطبقات'],
  ['with Built In Foot Bench', 'T:بمقعد مدمج'], ['with Storage', 'T:بمساحة تخزين'],
  ['with Center and Side Tables', 'T:مع طاولتين وسط وجانبية'], ['with Chair', 'T:مع كرسي'],
  ['with Mirror', 'T:بمرآة'], ['with', 'T:مع'], ['Kids', 'Q:أطفال'], ['The ', 'T:'],
  ['Super King', 'S:سوبر كينغ'], ['King', 'S:كينغ'], ['Queen', 'S:كوين'], ['Single', 'S:مفرد'], ['Double', 'S:مزدوج'],
  ['4 Door', 'T:4 أبواب'], ['6 Door', 'T:6 أبواب'], ['3 Door', 'T:3 أبواب'], ['2 Door', 'T:بابان'], ['5 Door', 'T:5 أبواب'], ['Size', null],
  // colors (C)
  ['Maple', 'C:خشب القيقب'], ['Oak', 'C:بلوط'], ['Walnut', 'C:جوز'], ['Beige', 'C:بيج'],
  ['Grey', 'C:رمادي'], ['Gray', 'C:رمادي'], ['Cream', 'C:كريمي'], ['Brown', 'C:بني'],
  ['Black', 'C:أسود'], ['White', 'C:أبيض'], ['Navy', 'C:كحلي'], ['Blue', 'C:أزرق'],
  ['Pink', 'C:وردي'], ['Green', 'C:أخضر'], ['Maroon', 'C:عنابي'], ['Natural', 'C:طبيعي'],
  ['Teak', 'C:ساج'], ['Silver', 'C:فضي'], ['Gold', 'C:ذهبي'], ['Ivory', 'C:عاجي'],
  ['Charcoal', 'C:فحمي'], ['Multi', 'C:متعدد الألوان'],
  ['Essential Oil', 'T:زيت عطري'], ['Oil', 'T:زيت'], ['Lounge', 'T:كرسي استرخاء'],
  ['Pouffe', 'T:بوف'], ['Puff', 'T:بوف'], ['Throw', 'T:غطاء'], ['Comforter', 'T:لحاف'],
  ['Jar Candle', 'T:شمعة برطمان'], ['Candle', 'T:شمعة'], ['Mop', 'T:ممسحة'], ['Spray', 'T:بخاخ'],
  ['Lantern', 'T:فانوس'], ['Burner', 'T:مبخرة'], ['Accent', 'T:ديكور'],
  ['Wooden', 'Q:خشبي'], ['Antique', 'Q:عتيق'], ['Polyresin', 'Q:بولي ريزين'],
  ['Decorative', 'Q:زخرفية'], ['Figurine', 'T:تمثال صغير'], ['Resin', 'C:ريزين'], ['Textured', 'Q:منقوش'],
  ['Metal', 'C:معدن'], ['Ceramic', 'C:سيراميك'], ['Terracota', 'C:تراكوتا'], ['Travertine', 'C:ترافرتين'], ['Biege', 'C:بيج'],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function translate(name) {
  let rest = ' ' + name + ' ';
  rest = rest.replace(/(\d+)\s*[-–]?\s*Seater/gi, ' §SEAT:$1§ ');
  rest = rest.replace(/(\d+)\s*[-–]?\s*[Pp]iece/g, ' §PIECE:$1§ ');
  rest = rest.replace(/[\d.]+\s*[×x*]\s*[\d.]+(?:\s*[×x*]\s*[\d.]+)*\s*(?:cm|mm)?/g, ' §DIM§ ');
  rest = rest.replace(/(\w)-(\w)/g, '$1 $2'); // Wardrobe-Grey -> Wardrobe Grey
  let changed = true;
  while (changed) {
    changed = false;
    for (const [en, tag] of LEX) {
      const re = new RegExp('(?<![A-Za-z])' + esc(en) + '(?![A-Za-z])', 'i');
      if (re.test(rest)) { rest = rest.replace(re, tag === null ? ' ' : ' §' + tag + '§ '); changed = true; }
    }
  }
  const types = [], quals = [], colors = [];
  let m;
  const tagRe = /§T:([^§]*)§|§C:([^§]*)§|§S:([^§]*)§|§Q:([^§]*)§|§SEAT:(\d+)§|§PIECE:(\d+)§|§DIM§/g;
  while ((m = tagRe.exec(rest))) {
    if (m[1] !== undefined) { if (m[1]) types.push(m[1]); }
    else if (m[3] !== undefined) quals.push(m[3]);
    else if (m[4] !== undefined) quals.push(m[4]);
    else if (m[2] !== undefined) colors.push(m[2]);
    else if (m[5] !== undefined) quals.push(m[5] + ' مقاعد');
    else if (m[6] !== undefined) quals.push(m[6] + ' قطع');
  }
  const proper = rest.split(/§[^§]*§/).map((x) => x.replace(/[^A-Za-z0-9\- L]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
  const dims = (name.match(/[\d.]+\s*[×x*]\s*[\d.]+(?:\s*[×x*]\s*[\d.]+)*\s*(?:cm|mm)?/g) || []);
  const head = [...types, ...quals, ...colors].join(' ').replace(/\s+/g, ' ').trim();
  if (!head) return null;
  const bits = [head];
  if (proper) bits.push(proper);
  if (dims.length) bits.push('– ' + dims.join(' / '));
  return bits.join(' ').replace(/(?:\s*[–-]\s*){2,}/g, ' – ').replace(/\s+-\s*$/, '').replace(/\s{2,}/g, ' ').trim();
}
const NAMES_AR = {};
let translated = 0; const untranslated = [];
for (const p of data) {
  const ar = translate(p.n);
  if (ar && /[\u0600-\u06FF]/.test(ar)) { NAMES_AR[p.id] = ar; translated++; }
  else { NAMES_AR[p.id] = p.n; untranslated.push(p.n); }
}
console.log('TRANSLATED:', translated, 'OF', data.length);
console.log('UNTRANSLATED:', untranslated.slice(0, 14).join(' | '));
for (const k of ['7072-serafina-corner-sofa', '6585-nimbus-bed-190-x-90-single-size', '4223-the-yaseen-majlis-corner-sofa']) {
  console.log('>', data.find((p) => p.id === k).n, '=>', NAMES_AR[k]);
}
const probes = data.slice(0, 22);
for (const p of probes) console.log('  *', p.n, '=>', NAMES_AR[p.id]);
fs.writeFileSync('scripts/names-ar.json', JSON.stringify(NAMES_AR, null, 1));
