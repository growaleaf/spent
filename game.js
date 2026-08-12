import {
  BUDGET, SCENES, FINAL_SCENE, sceneForDay, createLedger, remainingWords,
  isFinalScene, meaningCoverage, burn, ledgerStats, buildShareText,
} from './words.mjs';

const STORAGE_KEY = 'spent_v1';
const SHARE_URL = 'http://spent.defimagic.io';

const RESOLUTIONS = [
  'It reaches them. You can see it land.',
  'Something in the room eases.',
  'The words find their way in.',
  'It was enough. You watch it take hold.',
  'They hear it — really hear it.',
  'The right words, spent at the right time.',
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.ledger && Array.isArray(parsed.ledger.burned)) {
        return { day: parsed.day || 1, ledger: parsed.ledger };
      }
    }
  } catch (e) { /* corrupted or unavailable storage — start fresh */ }
  return { day: 1, ledger: createLedger() };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* storage full or unavailable — session still playable */ }
}

let state = loadState();

function currentScene() {
  if (isFinalScene(state.ledger)) return FINAL_SCENE;
  return sceneForDay(state.day);
}

const el = (id) => document.getElementById(id);
const screens = ['title', 'howto', 'play', 'ledger', 'final'];

function showScreen(name) {
  for (const s of screens) {
    el('screen-' + s).classList.toggle('active', s === name);
  }
  if (name === 'title') renderTitle();
  if (name === 'play') renderPlay();
  if (name === 'ledger') renderLedger();
  if (name === 'final') renderFinal();
}

function renderTitle() {
  el('title-remaining').textContent = remainingWords(state.ledger);
  el('btn-start').textContent = state.ledger.history.length > 0 ? 'Continue' : 'Begin';
}

function renderPlay() {
  const scene = currentScene();
  if (scene.id === 'final-silence') { showScreen('final'); return; }

  el('play-remaining').textContent = remainingWords(state.ledger);
  el('play-day').textContent = state.day;
  el('scene-recipient').textContent = 'for ' + scene.recipient;
  el('scene-title').textContent = scene.title;
  el('scene-prompt').textContent = scene.prompt;
  el('input-text').value = '';
  el('feedback').textContent = '';
  el('feedback').classList.remove('warm');
  el('compose-area').style.display = '';
  el('resolve-area').style.display = 'none';
  el('input-text').focus();
}

function renderLedger() {
  const stats = ledgerStats(state.ledger);
  el('ledger-remaining').textContent = stats.remaining;
  const wrap = el('ledger-history');
  wrap.innerHTML = '';
  const entries = state.ledger.history.slice().reverse();
  el('ledger-empty').style.display = entries.length ? 'none' : '';
  for (const h of entries) {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<span class="h-recipient">day ${h.day} · ${h.recipient || ''}</span><br><span class="h-words">${(h.words || []).join(', ')}</span>`;
    wrap.appendChild(div);
  }
  el('share-feedback').textContent = '';
}

function renderFinal() {
  el('final-title').textContent = FINAL_SCENE.title;
  el('final-prompt').textContent = FINAL_SCENE.prompt;
}

function submitText(text) {
  const scene = currentScene();
  if (scene.id === 'final-silence') return { ok: false, reason: 'final' };

  const coverage = meaningCoverage(text, scene, new Set(state.ledger.burned));
  if (!coverage.covered) {
    return { ok: false, reason: 'not-covered', coverage };
  }

  const spent = coverage.spendable;
  state.ledger = burn(state.ledger, spent, {
    day: state.day,
    sceneId: scene.id,
    recipient: scene.recipient,
  });
  saveState(state);
  return { ok: true, spent, scene };
}

function wireUp() {
  el('btn-start').addEventListener('click', () => showScreen('play'));
  el('btn-howto').addEventListener('click', () => showScreen('howto'));
  el('btn-howto-back').addEventListener('click', () => showScreen('title'));
  el('btn-play-ledger').addEventListener('click', () => showScreen('ledger'));
  el('btn-play-title').addEventListener('click', () => showScreen('title'));
  el('btn-to-ledger').addEventListener('click', () => showScreen('ledger'));
  el('btn-ledger-play').addEventListener('click', () => showScreen('play'));
  el('btn-ledger-title').addEventListener('click', () => showScreen('title'));
  el('btn-final-ledger').addEventListener('click', () => showScreen('ledger'));

  el('btn-submit').addEventListener('click', () => {
    const text = el('input-text').value;
    const result = submitText(text);
    if (!result.ok) {
      el('feedback').classList.remove('warm');
      el('feedback').textContent = text.trim().length === 0
        ? 'Say something to them first.'
        : 'That doesn’t quite reach them yet. Try saying it more plainly.';
      return;
    }
    el('compose-area').style.display = 'none';
    el('resolve-area').style.display = '';
    el('resolve-message').textContent = RESOLUTIONS[Math.floor(Math.random() * RESOLUTIONS.length)];
    const wordsWrap = el('resolve-words');
    wordsWrap.innerHTML = '';
    for (const w of result.spent) {
      const span = document.createElement('span');
      span.textContent = w;
      wordsWrap.appendChild(span);
    }
    el('btn-next').textContent = isFinalScene(state.ledger) ? 'Sit in the quiet' : 'Next scene';
  });

  el('btn-next').addEventListener('click', () => {
    state.day += 1;
    saveState(state);
    if (isFinalScene(state.ledger)) showScreen('final');
    else showScreen('play');
  });

  el('btn-share').addEventListener('click', async () => {
    const last = state.ledger.history[state.ledger.history.length - 1];
    const word = last && last.words && last.words.length ? last.words[last.words.length - 1] : 'quiet';
    const recipient = last ? last.recipient : 'the quiet';
    const text = buildShareText({
      day: state.day,
      remaining: remainingWords(state.ledger),
      word,
      recipient,
      url: SHARE_URL,
    });
    try {
      await navigator.clipboard.writeText(text);
      el('share-feedback').textContent = 'Copied.';
    } catch (e) {
      el('share-feedback').textContent = text;
    }
  });
}

wireUp();
showScreen('title');

if (new URLSearchParams(location.search).get('dev') === '1') {
  window.__g = {
    getState: () => JSON.parse(JSON.stringify(state)),
    currentScene: () => currentScene(),
    goTo: (name) => showScreen(name),
    submit: (text) => {
      const before = JSON.stringify(state.ledger.burned);
      const result = submitText(text);
      return { ...result, ledgerChanged: JSON.stringify(state.ledger.burned) !== before, remaining: remainingWords(state.ledger) };
    },
    advanceDay: () => {
      state.day += 1;
      saveState(state);
      showScreen(isFinalScene(state.ledger) ? 'final' : 'play');
    },
    forceEmptyBudget: () => {
      const idxToWord = (n) => {
        let s = '';
        n += 1;
        while (n > 0) { n -= 1; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
        return 'zz' + s;
      };
      const filler = Array.from({ length: BUDGET }, (_, i) => idxToWord(i));
      state.ledger = burn(state.ledger, filler, { day: state.day, sceneId: 'dev', recipient: 'dev' });
      saveState(state);
    },
    reset: () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state = { day: 1, ledger: createLedger() };
      showScreen('title');
    },
  };
}
