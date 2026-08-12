// SPENT — pure core. No DOM, no WebAudio, no Date.now()/Math.random() in logic paths.
// Every distinct meaningful word a player types is burned from a lifetime budget of 1000.

export const BUDGET = 1000;
const SCENE_SEED = 913574021; // fixed constant — deterministic rotation order, not Math.random()

export const STOPWORDS = new Set([
  'a','an','the','to','of','and','is','it','in','on','for','with','my','your','i','you','me',
  'that','this','at','as','be','so','but','or','do','did','does','not','no','yes','he','she',
  'they','we','us','them','his','her','its','our','their','was','were','am','are','will','would',
  'can','could','should','just','if','from','by','im','ive','dont','youre','its','theres','all',
  'up','out','into','than','then','when','what','who','how'
]);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(arr, seed) {
  const out = arr.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function normalizeWord(w) {
  return (w || '').toString().toLowerCase().replace(/[^a-z]/g, '');
}

export function tokenize(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .split(/[^a-z]+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0);
}

export function levenshtein(a, b) {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return row[n];
}

export function isTypoMatch(token, target) {
  const t = normalizeWord(token), g = normalizeWord(target);
  if (!t || !g) return false;
  if (t === g) return true;
  const threshold = g.length <= 4 ? 0 : g.length <= 7 ? 1 : 2;
  return levenshtein(t, g) <= threshold;
}

export function matchesSynonym(token, synonyms) {
  for (const s of synonyms) {
    if (isTypoMatch(token, s)) return s;
  }
  return null;
}

// ---- concept vocabulary pools (each reused by a small, bounded set of scenes) ----

const POOLS = {
  comfort: ['comfort','soothe','solace','ease','tender','console','cradle','hush','reassure','gentle','steady','balm','sanctuary','held','mercy','kindly'],
  presence: ['here','near','close','beside','stay','alongside','together','company','abide','present','nearby','adjoining'],
  direction: ['turn','ahead','straight','left','right','follow','bear','veer','onward','toward','forward','guide'],
  distance: ['mile','league','span','stretch','gap','short','long','reach','yard','ways','distant','apart'],
  color: ['amber','gold','crimson','copper','rose','ember','saffron','garnet','bronze','honeyed','scarlet','russet'],
  motion: ['fading','sinking','spreading','melting','bleeding','softening','drifting','dimming','waning','glowing','shifting','unfolding'],
  apology: ['sorry','regret','fault','forgive','mend','amends','remorse','apologize','wrong','undo','contrite','atone'],
  care: ['cherish','treasure','matter','value','dear','precious','important','honor','mind','tend','protect','nurture'],
  welcome: ['welcome','greet','arrive','hello','glad','embrace','invite','open','join','gather','hail','receive'],
  hope: ['future','grow','bright','horizon','dawn','tomorrow','blossom','unfold','rise','kindle','budding','aspire'],
  farewell: ['goodbye','farewell','leaving','parting','until','someday','depart','wave','last','journey','absence','farther'],
  gratitude: ['thank','grateful','thankful','lucky','blessed','appreciate','indebted','fortunate','moved','humbled','grace','thanks'],
  safety: ['safe','protected','shelter','guarded','secure','harbor','refuge','unharmed','watched','shielded','safeguard','secured'],
  calm: ['quiet','still','peaceful','settle','serene','mellow','tranquil','restful','soft','slow','hushed','easeful'],
  courage: ['brave','bold','dare','strength','nerve','grit','valor','steel','spine','fortitude','daring','gallant'],
  wonder: ['marvel','awe','amazing','astonish','dazzle','magic','spellbound','wondrous','enchant','radiant','marvelous','awestruck','dazzling','luminous'],
  sound: ['murmur','whisper','rustle','echo','hum','ring','chime','patter','sigh','drone','rumble','crackle'],
  texture: ['rough','smooth','silky','coarse','velvet','grain','ridge','satin','worn','supple','coarsened','plush'],
  question: ['ask','curious','ponder','query','puzzle','guess','explore','probe','investigate','unravel','inquire','curiosity'],
  memory: ['remember','recall','memory','past','keepsake','linger','remnant','trace','relic','imprint','recollect','nostalgic'],
  promise: ['vow','pledge','swear','promise','commit','oath','assure','guarantee','bind','word','promised','pledged'],
  patience: ['wait','patient','endure','tolerate','persist','weather','hold','outlast','stick','ride','waiting','lasting'],
  loss: ['grief','mourn','ache','missing','sorrow','longing','hollow','gone','grieving','mournful','bereft','forlorn'],
  joy: ['joy','delight','cheer','bliss','gladness','sparkle','merry','glee','jubilant','beaming','joyful','elated'],
};

function concept(name) {
  return { name, synonyms: POOLS[name].slice() };
}

const RAW_SCENES = [
  ['friend-tears','The Kitchen Table','Your friend is crying at the kitchen table and will not say why yet.','your friend','comfort','presence'],
  ['stranger-lost','Lost at the Crossing','A stranger stops you, turned around, looking for the old mill road.','a stranger','direction','distance'],
  ['sunset-blind','Describing the Sky','Your grandmother lost her sight last spring. Tell her what the sunset is doing.','your grandmother','color','motion'],
  ['broken-vase','The Broken Vase','You broke something that mattered to your brother. He has not spoken since.','your brother','apology','care'],
  ['newborn','First Night','Your sister just had a baby. Say something to welcome him.','the baby','welcome','hope'],
  ['last-train','The Last Train','Your oldest friend is moving across the ocean. The train leaves in a minute.','your oldest friend','farewell','gratitude'],
  ['thunder','Thunder at Midnight','Your daughter is scared of the storm outside her window.','your daughter','safety','calm'],
  ['exam-fear','Before the Exam','Your nephew is shaking in the hallway before his driving test.','your nephew','courage','calm'],
  ['first-snow','First Snow','A child presses her face to the glass, seeing snow for the first time.','the child at the window','wonder','joy'],
  ['old-radio','The Old Radio','Static, then a song your mother used to hum. Tell her what you hear.','your mother','sound','memory'],
  ['new-blanket','The New Quilt','You are describing the quilt\'s pattern to a friend who has been blind since birth.','your friend who cannot see','texture','color'],
  ['why-sky','Why Is the Sky Blue','Your niece asks the question again, the fourth time today.','your curious niece','question','wonder'],
  ['photo-box','The Shoebox of Photos','Your father found a box of old photographs in the attic.','your father','memory','joy'],
  ['wedding-vow','At the Altar','It is your turn to speak, and the room has gone quiet.','the one you are marrying','promise','gratitude'],
  ['waiting-room','The Waiting Room','Your friend\'s test results are late. She is staring at the door.','your worried friend','patience','comfort'],
  ['empty-chair','The Empty Chair','It is the first holiday since your grandfather passed.','the empty chair at the table','loss','memory'],
  ['new-job','First Day Nerves','Your roommate is pacing before her first day at the new job.','your roommate','courage','hope'],
  ['lost-dog','The Missing Dog','A neighbor is posting flyers, voice cracking with worry.','your worried neighbor','comfort','hope'],
  ['birthday-card','The Birthday Card','You are eighty words into a card that keeps saying nothing.','your oldest friend','gratitude','joy'],
  ['hospital-hallway','The Hospital Hallway','Your uncle is scared before the surgery.','your uncle','courage','safety'],
  ['platform-goodbye','The Platform','You are saying goodbye to someone you just met, and it mattered anyway.','the stranger from the train','farewell','wonder'],
  ['garden-morning','Morning in the Garden','Describe the dew and the light to a friend who has never seen a garden.','your city-raised friend','color','texture'],
  ['lullaby','The Lullaby','The baby will not sleep, and your voice is the only thing that helps.','the baby who will not sleep','calm','comfort'],
  ['map-directions','The Wrong Turn','A driver rolls down the window, lost in your town.','the lost driver','direction','patience'],
  ['storm-camp','Storm at Camp','The tent is shaking and your friend is gripping the flashlight too hard.','your camping friend','safety','courage'],
  ['lost-ring','The Missing Ring','Your partner is on their knees in the grass, searching.','your searching partner','patience','comfort'],
  ['first-steps','First Steps','Your son let go of the couch and took three steps toward you.','your son','joy','wonder'],
  ['old-letter','The Unsent Letter','You found a letter your grandmother never mailed, forty years late.','your grandmother, forty years late','loss','memory'],
  ['new-neighbor','The New Neighbor','Someone just moved in next door and looks nervous on the porch.','your new neighbor','welcome','comfort'],
  ['far-call','The Long-Distance Call','Your daughter is homesick, three time zones away.','your homesick daughter','comfort','distance'],
  ['rainy-window','Rain on the Window','Describe the storm outside to your grandfather, who can no longer get to the window.','your grandfather','sound','motion'],
  ['apology-friend','The Fight','You said something you did not mean, and your friend has not called back.','your friend','apology','promise'],
  ['graduation','Cap and Gown','Your daughter is crossing the stage, looking for your face in the crowd.','your graduating daughter','joy','gratitude'],
  ['sick-day','The Fever','Your son is burning up and asking if he is going to be okay.','your feverish son','safety','comfort'],
  ['school-gate','The School Gate','Your daughter\'s hand will not let go of yours at the gate.','your daughter at the gate','courage','promise'],
  ['old-friend-reunion','After Twenty Years','You are face to face with someone you have not seen since school.','your old friend','wonder','gratitude'],
  ['dying-garden','The Last Bloom','The garden your mother planted is fading with the season.','your mother\'s garden','loss','color'],
  ['new-year','The Last Minute of the Year','Everyone is counting down, and you are standing next to the one who matters.','the one beside you at midnight','hope','promise'],
  ['quiet-drive','The Quiet Drive Home','No one has said anything in twenty minutes, and someone should.','the quiet in the car','presence','calm'],
  ['final-porch','The Porch at Dusk','You and someone you love are watching the light go, saying nothing yet.','the one on the porch beside you','presence','wonder'],
];

export const SCENES = RAW_SCENES.map(([id, title, prompt, recipient, p1, p2]) => ({
  id, title, prompt, recipient,
  concepts: [concept(p1), concept(p2)],
}));

export const SCENE_ORDER = shuffleDeterministic(
  SCENES.map((_, i) => i),
  SCENE_SEED
);

export const FINAL_SCENE = {
  id: 'final-silence',
  title: 'The Last Word Spent',
  prompt: 'There is nothing left to spend. Sit with the one beside you and say nothing at all.',
  recipient: 'the quiet',
  concepts: [],
};

export function sceneForDay(dayIndex) {
  const idx = SCENE_ORDER[(dayIndex - 1 + SCENE_ORDER.length * 1000000) % SCENE_ORDER.length];
  return SCENES[idx];
}

export function createLedger() {
  return { budget: BUDGET, burned: [], history: [] };
}

export function remainingWords(ledger) {
  return Math.max(0, ledger.budget - ledger.burned.length);
}

export function isFinalScene(ledgerOrRemaining) {
  const remaining = typeof ledgerOrRemaining === 'number'
    ? ledgerOrRemaining
    : remainingWords(ledgerOrRemaining);
  return remaining <= 0;
}

export function meaningCoverage(text, scene, burnedWords) {
  const burnedSet = burnedWords instanceof Set ? burnedWords : new Set(burnedWords || []);
  const tokens = tokenize(text);
  const seen = new Set();
  const distinctOrdered = [];
  for (const t of tokens) {
    if (!seen.has(t)) { seen.add(t); distinctOrdered.push(t); }
  }
  const spendable = distinctOrdered.filter((t) => !STOPWORDS.has(t) && !burnedSet.has(t));

  const perConcept = scene.concepts.map((c) => {
    for (const tok of spendable) {
      const synonym = matchesSynonym(tok, c.synonyms);
      if (synonym) return { name: c.name, matched: tok, synonym };
    }
    return { name: c.name, matched: null, synonym: null };
  });

  const covered = scene.concepts.length > 0 && perConcept.every((c) => c.matched !== null);
  return { covered, perConcept, spendable };
}

export function burn(ledger, words, meta) {
  const set = new Set(ledger.burned);
  const added = [];
  for (const w of words || []) {
    const n = normalizeWord(w);
    if (n && !set.has(n)) { set.add(n); added.push(n); }
  }
  const burned = Array.from(set).sort();
  const history = ledger.history.concat([{
    day: meta && meta.day,
    sceneId: meta && meta.sceneId,
    recipient: meta && meta.recipient,
    words: (words || []).map(normalizeWord).filter(Boolean),
  }]);
  return { budget: ledger.budget, burned, history };
}

export function ledgerStats(ledger) {
  const byRecipient = {};
  for (const h of ledger.history) {
    if (!h.recipient) continue;
    byRecipient[h.recipient] = (byRecipient[h.recipient] || 0) + (h.words ? h.words.length : 0);
  }
  return {
    budget: ledger.budget,
    spent: ledger.burned.length,
    remaining: remainingWords(ledger),
    daysPlayed: ledger.history.length,
    byRecipient,
  };
}

export function buildShareText({ day, remaining, word, recipient, url }) {
  return `\u{1F56F}️ SPENT · day ${day} · ${remaining} words left · I spent “${word}” on ${recipient} · ${url}`;
}
