/**
 * Language Study — app entry point.
 * Wires together: router, menu, game modes, stats, add-words.
 *
 * Vocabulary is lazy-loaded: only the needed language file is fetched
 * when the user starts a game, keeping the initial page load fast.
 */

import { Router } from './router.js';
import { GameEngine, loadVocabulary } from './engine.js';
import { MenuScreen } from './ui/menu.js';
import { StatsScreen } from './ui/stats.js';
import { AddWordsScreen, loadUserWords, mergeWithBuiltIn } from './ui/add-words.js';
import { recordSession } from './progress.js';
import { FlashcardsMode } from './modes/flashcards.js';
import { QuizMode } from './modes/quiz.js';
import { TypingMode } from './modes/typing.js';
import { MatchMode } from './modes/match.js';
import { exportToExcel } from './export.js';

const MODE_MAP = {
  flashcards: FlashcardsMode,
  quiz: QuizMode,
  typing: TypingMode,
  match: MatchMode,
};

const VOCAB_FILES = {
  en: 'data/vocabulary-en.json',
  sr: 'data/vocabulary-sr.json',
};

const app = document.getElementById('app');

// --- State ---
const vocabCache = {};  // { en: [...], sr: [...] } — loaded on demand
let allEntries = [];
let router = null;
let menuScreen = null;
let statsScreen = null;
let addWordsScreen = null;
let activeMode = null;

// --- Screens ---
const screens = {
  menu: createScreen('menu-screen'),
  play: createScreen('play-screen'),
  stats: createScreen('stats-screen'),
  addWords: createScreen('add-words-screen'),
};

function createScreen(id) {
  const div = document.createElement('div');
  div.id = id;
  div.className = 'screen';
  app.appendChild(div);
  return div;
}

// --- Tab bar ---
function buildTabBar() {
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';

  const tabs = [
    { hash: '#home', icon: '🏠', label: 'Игра' },
    { hash: '#stats', icon: '📊', label: 'Статистика' },
    { hash: '#add-words', icon: '➕', label: 'Слова' },
  ];

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'tab-bar__item';
    btn.type = 'button';
    btn.innerHTML = `<span class="tab-bar__icon">${tab.icon}</span>${tab.label}`;
    btn.addEventListener('click', () => router.navigate(tab.hash));
    bar.appendChild(btn);
  }

  document.body.appendChild(bar);
}

// --- Lazy vocabulary loader ---
async function ensureVocabLoaded(...langs) {
  const toLoad = langs.filter((l) => !vocabCache[l] && VOCAB_FILES[l]);
  if (toLoad.length === 0) return;

  const results = await Promise.all(
    toLoad.map((l) => loadVocabulary(VOCAB_FILES[l]).then((entries) => [l, entries]))
  );
  for (const [lang, entries] of results) {
    vocabCache[lang] = entries;
  }
}

function rebuildAllEntries() {
  const builtIn = [...(vocabCache.en || []), ...(vocabCache.sr || [])];
  const userWords = loadUserWords();
  allEntries = mergeWithBuiltIn(builtIn, userWords);
  return allEntries;
}

// --- Game launch ---
async function startGame({ direction, mode }) {
  const ModeClass = MODE_MAP[mode];
  if (!ModeClass) {
    console.error('Unknown mode:', mode);
    return;
  }

  // Load vocabulary for both languages (need distractors from both)
  menuScreen.setLoading(true);
  try {
    await ensureVocabLoaded('en', 'sr');
  } finally {
    menuScreen.setLoading(false);
  }

  rebuildAllEntries();
  menuScreen.setWordCount(allEntries.length);

  const engine = new GameEngine({
    entries: allEntries,
    direction,
    sessionSize: 20,
  });

  activeMode = new ModeClass();
  activeMode.init(screens.play, engine);

  engine.on('session:ended', (summary) => {
    recordSession({
      date: new Date().toISOString(),
      score: summary.score,
      total: summary.totalWords,
      durationSeconds: Math.round(summary.elapsedTime / 1000),
      wordIds: [],
    });
  });

  engine.on('mode:done', () => {
    router.navigate('#home');
  });

  router.navigate('#play');
  activeMode.start();
}

function stopGame() {
  if (activeMode) {
    activeMode.destroy();
    activeMode = null;
  }
  screens.play.innerHTML = '';
}

// --- Init (lightweight — no vocabulary fetch) ---
async function init() {
  try {
    // Menu (show immediately with 0 word count, updated after first load)
    menuScreen = new MenuScreen();
    menuScreen.init(screens.menu, {
      wordCount: 0,
      onStart: startGame,
      onExport: async () => {
        await ensureVocabLoaded('en', 'sr');
        rebuildAllEntries();
        exportToExcel(allEntries);
      },
    });

    // Stats
    statsScreen = new StatsScreen();
    statsScreen.init(screens.stats);

    // Add Words (pass empty built-in for now, updated after load)
    addWordsScreen = new AddWordsScreen();
    addWordsScreen.init(screens.addWords, []);

    // Tab bar
    buildTabBar();

    // Router
    router = new Router();
    router.register('#home', () => {
      stopGame();
      rebuildAllEntries();
      menuScreen.setWordCount(allEntries.length);
      menuScreen.show();
    }, () => menuScreen.hide());

    router.register('#play', () => {
      screens.play.classList.add('screen--active');
    }, () => {
      screens.play.classList.remove('screen--active');
      stopGame();
    });

    router.register('#stats', () => {
      statsScreen.show();
    }, () => {
      statsScreen.hide();
    });

    router.register('#add-words', async () => {
      await ensureVocabLoaded('en', 'sr');
      addWordsScreen.updateBuiltIn([...(vocabCache.en || []), ...(vocabCache.sr || [])]);
      addWordsScreen.show();
    }, () => {
      addWordsScreen.hide();
    });

    router.start();

    // Preload vocabulary in background after UI is shown
    ensureVocabLoaded('en', 'sr').then(() => {
      rebuildAllEntries();
      menuScreen.setWordCount(allEntries.length);
    });
  } catch (err) {
    console.error('Failed to initialize app:', err);
    app.innerHTML = `<p style="color:var(--color-danger);padding:2rem">Ошибка загрузки: ${err.message}</p>`;
  }
}

init();
