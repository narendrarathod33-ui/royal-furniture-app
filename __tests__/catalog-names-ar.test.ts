import { catalogData } from '../app/data/catalogData';
import { NAMES_AR, SCN_AR } from '../app/data/catalogNamesAr';
import { pname, pscn } from '../components/catalog/kit';
import { useLangStore } from '../app/i18n';

const ARABIC = /[\u0600-\u06FF]/;

beforeEach(() => {
  useLangStore.getState().setLang('en');
});

test('every catalog id has a display entry (translation or English fallback)', () => {
  for (const p of catalogData as { id: string }[]) {
    expect(typeof NAMES_AR[p.id]).toBe('string');
    expect(NAMES_AR[p.id].length).toBeGreaterThan(0);
  }
});

test('at least 95% of names carry real Arabic, the rest fall back to English', () => {
  const entries = Object.values(NAMES_AR);
  const arabic = entries.filter((n) => ARABIC.test(n));
  expect(arabic.length / entries.length).toBeGreaterThan(0.95);
});

test('pname shows Arabic in Arabic mode, English otherwise, with safe fallback', () => {
  const p = { id: '7072-serafina-corner-sofa', n: 'Serafina Corner Sofa' };
  expect(pname(p)).toBe('Serafina Corner Sofa');
  useLangStore.getState().setLang('ar');
  expect(pname(p)).toBe('أريكة زاوية Serafina');
  expect(ARABIC.test(pname(p))).toBe(true);
  // Unknown id (synthetic cart line) falls back to the passed name.
  expect(pname({ id: 'no-such-id::size=200x90', n: 'Whatever' })).toBe('Whatever');
});

test('pscn translates every subcategory shown in the catalog', () => {
  const scns = [...new Set((catalogData as { scn: string }[]).map((p) => p.scn))];
  for (const scn of scns) {
    expect(SCN_AR[scn]).toBeTruthy();
    expect(ARABIC.test(SCN_AR[scn])).toBe(true);
  }
  useLangStore.getState().setLang('ar');
  expect(pscn('Corner Sofas')).toBe('أرائك زاوية');
  expect(pscn('Not a real one')).toBe('Not a real one');
});
