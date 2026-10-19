import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';

// P4: the native Maestro flows cannot run in this sandbox (no device), so
// this suite lints them instead — valid YAML, expected structure, and,
// most importantly, selector parity with the accessibilityLabels the app
// actually ships. If a label changes, this fails until the flow is updated
// in the same commit.

const FLOWS_DIR = 'native-flows';
const SOURCE_DIRS = ['components', 'app'];

// Maestro flow files are two YAML documents: the config (appId, then `---`)
// and the step list.
function readFlow(name) {
  const docs = parseAllDocuments(readFileSync(join(FLOWS_DIR, name), 'utf8')).map((doc) => doc.toJS());
  assert.ok(docs.length === 2, `${name} must be config --- steps`);
  const [config, steps] = docs;
  assert.ok(Array.isArray(steps), `${name} steps must be a list`);
  return { ...config, steps };
}

const flows = new Map(
  readdirSync(FLOWS_DIR)
    .filter((name) => name.endsWith('.yaml'))
    .sort()
    .map((name) => [name, readFlow(name)])
);

const COMMANDS = new Set([
  'launchApp', 'tapOn', 'assertVisible', 'assertNotVisible',
  'inputText', 'hideKeyboard', 'scrollUntilVisible', 'runFlow',
]);

/** Yields [command, body] for each step; bare commands (`- launchApp`) have no body. */
function* stepsOf(steps) {
  for (const step of steps) {
    if (typeof step === 'string') {
      yield [step, undefined];
      continue;
    }
    assert.ok(typeof step === 'object' && step !== null && Object.keys(step).length === 1, `malformed step: ${JSON.stringify(step)}`);
    const [[command, body]] = Object.entries(step);
    yield [command, body];
  }
}

/** Collects what a flow taps/asserts (`text` selectors) and what it types. */
function analyze(steps) {
  const texts = [];
  const typed = [];
  for (const [command, body] of stepsOf(steps)) {
    assert.ok(COMMANDS.has(command), `unknown Maestro command: ${command}`);
    if (command === 'tapOn' || command === 'assertVisible' || command === 'assertNotVisible' || command === 'scrollUntilVisible') {
      const text = typeof body === 'string' ? body : body?.text;
      assert.equal(typeof text, 'string', `${command} must carry a text selector`);
      texts.push(text);
    }
    if (command === 'inputText') {
      assert.equal(typeof body, 'string', 'inputText needs a string value');
      typed.push(body);
    }
  }
  return { texts, typed };
}

/** Regex selectors here whose app-side source is a template, not a literal. */
const PATTERN_SOURCES = new Map([
  ['^Cart, \\d+ items$', 'Cart, {count} items'],
  ['^Cart, 1 items$', 'Cart, {count} items'],
  ['\\d+ results', '{n} results'],
  ['RF-\\d{8}', 'RF-${Date.now'],
  ['Nimbus Bed.*AED', ', ${money(product.o)}'],
]);;

/** Every app source file's content, for label lookups. */
function sourceContents() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(tsx?|mjs)$/.test(entry.name)) out.push(readFileSync(path, 'utf8'));
    }
  };
  for (const dir of SOURCE_DIRS) walk(dir);
  return out;
}

test('every Maestro flow parses with an appId header and real steps', () => {
  assert.deepEqual([...flows.keys()], ['cart.yaml', 'search.yaml', 'smoke.yaml']);
  for (const [name, flow] of flows) {
    assert.equal(flow.appId, '${APP_ID}', `${name} must take the app id from the environment`);
    assert.ok(Array.isArray(flow.steps) && flow.steps.length >= 5, `${name} has no steps`);
    analyze(flow.steps); // throws on unknown commands / malformed selectors
  }
});

test('smoke.yaml pins the home money path (tabs, badge, account)', () => {
  const { texts } = analyze(flows.get('smoke.yaml').steps);
  for (const expected of ['Shop by room', '^Home$', '^Browse$', '^Search$', '^Deals$', '^New in$', '^Cart, \\d+ items$', '^Account$']) {
    assert.ok(texts.includes(expected), `smoke.yaml should assert ${expected}`);
  }
});

test('search.yaml drives the real search field and asserts a result count', () => {
  const { texts, typed } = analyze(flows.get('search.yaml').steps);
  for (const expected of ['^Search$', '^Search products$', '\\d+ results', 'Sofa']) {
    assert.ok(texts.includes(expected), `search.yaml should assert ${expected}`);
  }
  assert.ok(typed.includes('sofa'), 'search.yaml should type a query');
});

test('cart.yaml covers bag → checkout → order in Account', () => {
  const { texts, typed } = analyze(flows.get('cart.yaml').steps);
  for (const expected of [
    'Nimbus Bed.*AED', 'Tap to change size', '^Add to bag', '^Cart, 1 items$',
    'Checkout', '^Your name$', '^Mobile number$', '^Delivery address$',
    'Place order request', 'Order placed', '^Account$', 'RF-\\d{8}',
  ]) {
    assert.ok(texts.includes(expected), `cart.yaml should assert ${expected}`);
  }
  for (const expected of ['0501234567']) {
    assert.ok(typed.includes(expected), `cart.yaml should type ${expected}`);
  }
});

test('flow selectors only reference labels the app actually ships', () => {
  const sources = sourceContents();
  const allTexts = [...flows.values()].flatMap((flow) => analyze(flow.steps).texts);
  for (const text of allTexts) {
    const probe = PATTERN_SOURCES.get(text) ?? text.replace(/^\^/, '').replace(/\$$/, '');
    assert.ok(
      sources.some((content) => content.includes(probe)),
      `no app source contains "${probe}" (selector "${text}") — update the flow with the label`
    );
  }
});
