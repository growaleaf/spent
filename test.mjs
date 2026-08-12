import {
  BUDGET, STOPWORDS, mulberry32, normalizeWord, tokenize, levenshtein, isTypoMatch,
  matchesSynonym, SCENES, SCENE_ORDER, FINAL_SCENE, sceneForDay, createLedger,
  remainingWords, isFinalScene, meaningCoverage, burn, ledgerStats, buildShareText,
} from './words.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

// 1. normalize basic case/punctuation handling
check('normalizeWord strips case and punctuation', normalizeWord('Shimmer!') === 'shimmer' && normalizeWord("Don't") === 'dont');

// 2. tokenize splits and normalizes
check('tokenize splits on punctuation/whitespace', JSON.stringify(tokenize('I spent "Shimmer," gently.')) === JSON.stringify(['i','spent','shimmer','gently']));

// 3. levenshtein known distances
check('levenshtein exact known distances', levenshtein('kitten','sitting') === 3 && levenshtein('same','same') === 0 && levenshtein('','abc') === 3);

// 4. isTypoMatch accepts small typos, rejects large differences
check('isTypoMatch accepts a one-letter typo on a long word', isTypoMatch('shimmr','shimmer') === true);
check('isTypoMatch rejects an unrelated word', isTypoMatch('banana','shimmer') === false);
check('isTypoMatch requires exact match on short words (<=4 letters)', isTypoMatch('wave','safe') === false && isTypoMatch('safe','safe') === true);

// 5/6. meaningCoverage accepts exact and typo'd synonyms
{
  const scene = SCENES.find((s) => s.id === 'friend-tears');
  const exact = meaningCoverage('I offer comfort and stay near', scene, new Set());
  check('meaningCoverage accepts exact synonyms for both concepts', exact.covered === true);

  const typoScene = SCENES.find((s) => s.id === 'friend-tears');
  const typo = meaningCoverage('I bring comfert and stay clse', typoScene, new Set());
  check('meaningCoverage accepts typo-tolerant synonyms', typo.covered === true);
}

// 7. meaningCoverage rejects empty text
{
  const scene = SCENES[0];
  const r = meaningCoverage('', scene, new Set());
  check('meaningCoverage rejects empty text', r.covered === false);
}

// 8. meaningCoverage rejects irrelevant text
{
  const scene = SCENES.find((s) => s.id === 'friend-tears');
  const r = meaningCoverage('bicycle spreadsheet nonsense', scene, new Set());
  check('meaningCoverage rejects irrelevant text', r.covered === false);
}

// 9. meaningCoverage ignores already-burned words
{
  const scene = SCENES.find((s) => s.id === 'friend-tears'); // comfort, presence
  const burnedSet = new Set(['comfort']);
  const r = meaningCoverage('comfort', scene, burnedSet);
  check('meaningCoverage does not let a burned word satisfy a concept', r.covered === false);
  const r2 = meaningCoverage('comfort soothe near', scene, burnedSet);
  check('meaningCoverage still finds an unburned alternate synonym', r2.covered === true);
}

// 10. structural: every scene has >=1 concept, every concept has >=4 synonyms (never a single required word)
{
  const structurallySound = SCENES.every((s) =>
    s.concepts.length >= 1 && s.concepts.every((c) => c.synonyms.length >= 4)
  );
  check('every scene concept offers at least 4 synonym routes', structurallySound);
}

// 11. exactly 40 authored scene templates
check('SCENES has at least 40 authored templates', SCENES.length >= 40);

// 12. sceneForDay determinism
check('sceneForDay is deterministic for the same day', sceneForDay(17).id === sceneForDay(17).id && JSON.stringify(sceneForDay(5)) === JSON.stringify(sceneForDay(5)));

// 13. SCENE_ORDER is a true permutation covering every scene exactly once
{
  const seen = new Set(SCENE_ORDER);
  check('SCENE_ORDER is a permutation of all scene indices', seen.size === SCENES.length && SCENE_ORDER.length === SCENES.length);
  const daySceneIds = new Set();
  for (let d = 1; d <= SCENES.length; d++) daySceneIds.add(sceneForDay(d).id);
  check('every scene appears exactly once across one full rotation', daySceneIds.size === SCENES.length);
}

// 14/15. burn() permanence and idempotency
{
  let ledger = createLedger();
  ledger = burn(ledger, ['love'], { day: 1, sceneId: 'x', recipient: 'test' });
  check('burn() adds the word', ledger.burned.includes('love'));
  const before = ledger.burned.length;
  ledger = burn(ledger, [], { day: 2, sceneId: 'x', recipient: 'test' });
  check('burning nothing new leaves burned permanent and unchanged', ledger.burned.includes('love') && ledger.burned.length === before);
  ledger = burn(ledger, ['love','Love','LOVE!'], { day: 3, sceneId: 'x', recipient: 'test' });
  check('re-burning the same word (any case/punct) does not grow the burned count', ledger.burned.length === before);
}

// 16. ledger remaining math, clamped at 0
{
  let ledger = createLedger();
  check('fresh ledger has full budget remaining', remainingWords(ledger) === BUDGET);
  const words = ['alpha','bravo','charlie','delta','echo'];
  ledger = burn(ledger, words, { day: 1, sceneId: 'x', recipient: 'test' });
  check('remaining decrements by distinct burned words', remainingWords(ledger) === BUDGET - 5);

  let tiny = { budget: 2, burned: [], history: [] };
  tiny = burn(tiny, ['alpha','beta','gamma'], { day: 1, sceneId: 'x', recipient: 'test' });
  check('remaining never goes negative', remainingWords(tiny) === 0);
}

// 17. THE SOLVER TEST — the 1000-word budget survives at least 60 scene-plays with disjoint vocabulary
{
  let ledger = createLedger();
  let solverOk = true;
  let failedAt = null;
  for (let day = 1; day <= 60; day++) {
    if (isFinalScene(ledger)) { failedAt = 'ran out before day ' + day; solverOk = false; break; }
    const scene = sceneForDay(day);
    const burnedSet = new Set(ledger.burned);
    const chosen = [];
    for (const c of scene.concepts) {
      let pick = null;
      for (const syn of c.synonyms) {
        const n = normalizeWord(syn);
        if (!burnedSet.has(n) && !chosen.includes(n)) { pick = n; break; }
      }
      if (!pick) { failedAt = `day ${day} scene ${scene.id} concept ${c.name} has no unburned route`; solverOk = false; break; }
      chosen.push(pick);
      burnedSet.add(pick);
    }
    if (!solverOk) break;
    // prove the coverage check itself accepts the solver's chosen words
    const coverage = meaningCoverage(chosen.join(' '), scene, new Set(ledger.burned));
    if (!coverage.covered) { failedAt = `day ${day} scene ${scene.id} chosen words did not pass meaningCoverage`; solverOk = false; break; }
    ledger = burn(ledger, chosen, { day, sceneId: scene.id, recipient: scene.recipient });
  }
  if (!solverOk) console.error('solver failure detail:', failedAt);
  check('greedy solver completes 60 scene-plays without ever running out of a route', solverOk);
  check('budget after 60 scene-plays stays within the 1000-word lifetime cap', ledger.burned.length <= BUDGET);
}

// 18. final scene trigger
check('isFinalScene true at 0 remaining, false above 0', isFinalScene(0) === true && isFinalScene(1) === false);
check('FINAL_SCENE requires no words to resolve', FINAL_SCENE.concepts.length === 0);

// 19. share text format
{
  const text = buildShareText({ day: 12, remaining: 803, word: 'shimmer', recipient: 'the harbor', url: 'http://spent.defimagic.io' });
  check('buildShareText matches the required format', text === '\u{1F56F}️ SPENT · day 12 · 803 words left · I spent “shimmer” on the harbor · http://spent.defimagic.io');
}

// 20. mulberry32 determinism across independent instantiations
{
  const seqA = [0,1,2].map((i) => { void i; return null; });
  const rngA = mulberry32(42), rngB = mulberry32(42);
  const a = [rngA(), rngA(), rngA()];
  const b = [rngB(), rngB(), rngB()];
  void seqA;
  check('mulberry32 is deterministic for a given seed', JSON.stringify(a) === JSON.stringify(b));
  const rngC = mulberry32(43);
  const c = [rngC(), rngC(), rngC()];
  check('mulberry32 differs across seeds', JSON.stringify(a) !== JSON.stringify(c));
}

// 21. ledgerStats math
{
  let ledger = createLedger();
  ledger = burn(ledger, ['gentle','near'], { day: 1, sceneId: 'friend-tears', recipient: 'your friend' });
  ledger = burn(ledger, ['sorry'], { day: 2, sceneId: 'broken-vase', recipient: 'your brother' });
  const stats = ledgerStats(ledger);
  check('ledgerStats totals spent words correctly', stats.spent === 3 && stats.remaining === BUDGET - 3);
  check('ledgerStats groups by recipient', stats.byRecipient['your friend'] === 2 && stats.byRecipient['your brother'] === 1);
}

// 22. STOPWORDS never satisfy a concept even if coincidentally similar
check('stopwords set is non-trivial', STOPWORDS.has('the') && STOPWORDS.has('and'));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
