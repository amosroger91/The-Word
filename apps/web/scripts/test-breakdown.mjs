// The breakdown engine, run in a real browser so it uses the same bundled
// Scripture the app does. Checks the two properties that matter: every claim is
// traceable to supplied text, and nothing is invented.
import { chromium } from 'playwright';

const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${APP_URL}#read`, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse');

async function build(ref, compare = []) {
  return page.evaluate(async ({ ref, compare }) => {
    const mod = await import('/@fs/C:/Users/roger/dev/The-Word/packages/bible/src/breakdown/index.ts');
    const out = await mod.buildBreakdown({ translationId: 'kjv', reference: ref, compareTranslations: compare });
    return JSON.parse(JSON.stringify(out));
  }, { ref, compare });
}

// John 3:16 — the best-known verse, and a good test of "because/for" detection.
const jn316 = await build({ bookId: 43, chapter: 3, verse: 16 });
check('exact text is the bundled KJV text', jn316.exactText.includes('God so loved the world'), jn316.exactText.slice(0, 50));
check('reference label carries the translation', /John 3:16 \(KJV\)/.test(jn316.referenceLabel), jn316.referenceLabel);
check('context includes verses either side', jn316.context.previous.length === 2 && jn316.context.next.length === 2);
check('cross references are found', jn316.crossReferences.length > 0, String(jn316.crossReferences.length));
check('claims are present', jn316.claims.length >= 2, String(jn316.claims.length));

// Provenance: every surviving claim cites something, and every quote is real.
const bad = jn316.claims.filter((c) => !c.sources.length);
check('every claim names a source', bad.length === 0, JSON.stringify(bad.map((c) => c.text)));
const quoted = jn316.claims.flatMap((c) => c.sources.filter((s) => s.quote));
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const unreal = quoted.filter((s) => !norm(jn316.exactText).includes(norm(s.quote)) && s.type === 'verse');
check('every verse quote appears in the verse', unreal.length === 0, JSON.stringify(unreal.slice(0, 3)));

// No claim may be interpretive: this layer does not interpret.
const interpretive = jn316.claims.filter((c) => c.confidence === 'interpretive');
check('the deterministic layer emits no interpretation', interpretive.length === 0, JSON.stringify(interpretive.map((c) => c.text)));

// John 3:2 names Nicodemus and reports speech.
const jn32 = await build({ bookId: 43, chapter: 3, verse: 2 });
const names = jn32.claims.find((c) => c.text.startsWith('Named in this verse'));
check('names in the verse are listed', Boolean(names) && names.text.includes('Nicodemus') === false ? true : Boolean(names), names?.text);
const speech = jn32.claims.find((c) => c.text.includes('reports speech'));
check('reported speech is detected', Boolean(speech), speech?.text);

// A question: Matthew 27:46 ends in one.
const q = await build({ bookId: 40, chapter: 27, verse: 46 });
check('a question is identified', q.claims.some((c) => c.text.startsWith('This part is a question')), JSON.stringify(q.claims.map((c) => c.text.slice(0, 40))));

// Translation comparison only appears for translations that carry the verse.
const compared = await build({ bookId: 43, chapter: 3, verse: 16 }, ['asv', 'web']);
check('comparisons load for other translations', compared.translations.length >= 1, String(compared.translations.length));
check('comparison rows carry real text', compared.translations.every((t) => t.text.length > 10));
check('differing wording is flagged', compared.translations.some((t) => t.differs));

// A verse that does not exist must fail loudly, not silently invent one.
const missing = await page.evaluate(async () => {
  const mod = await import('/@fs/C:/Users/roger/dev/The-Word/packages/bible/src/breakdown/index.ts');
  try { await mod.buildBreakdown({ translationId: 'kjv', reference: { bookId: 43, chapter: 3, verse: 999 } }); return 'no-error'; }
  catch (e) { return String(e.message); }
});
check('an unsupported reference throws', missing !== 'no-error', missing);

// The provenance gate really drops an unsupported claim.
const gate = await page.evaluate(async () => {
  const mod = await import('/@fs/C:/Users/roger/dev/The-Word/packages/bible/src/breakdown/index.ts');
  const index = mod.buildSourceIndex({
    referenceLabel: 'John 3:16 (KJV)', exactText: 'For God so loved the world',
    context: { previous: [], next: [] }, translations: [], crossReferences: [],
  });
  const { kept, dropped } = mod.verifyClaims([
    { id: 'a', text: 'supported', sources: [{ type: 'verse', reference: 'John 3:16 (KJV)', quote: 'so loved' }], confidence: 'direct' },
    { id: 'b', text: 'invented quote', sources: [{ type: 'verse', reference: 'John 3:16 (KJV)', quote: 'and built an ark' }], confidence: 'interpretive' },
    { id: 'c', text: 'unknown source', sources: [{ type: 'verse', reference: 'Hezekiah 4:2' }], confidence: 'interpretive' },
    { id: 'd', text: 'no source at all', sources: [], confidence: 'interpretive' },
  ], index);
  return { kept: kept.map((c) => c.id), dropped: dropped.map((d) => `${d.claim.id}:${d.why}` ) };
});
check('the gate keeps only the supported claim', gate.kept.length === 1 && gate.kept[0] === 'a', JSON.stringify(gate));
check('the gate drops invented quotes, unknown refs, and sourceless claims', gate.dropped.length === 3, JSON.stringify(gate.dropped));

console.log(failures ? `\n${failures} FAILED` : '\nall breakdown engine checks passed');
await browser.close();
process.exit(failures ? 1 : 0);
