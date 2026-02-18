/**
 * Language Study — app entry point.
 * Wires together: router, menu, game modes, stats, add-words.
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

const app = document.getElementById('app');

// --- State ---
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

// --- Game launch ---
function startGame({ direction, mode }) {
  const ModeClass = MODE_MAP[mode];
  if (!ModeClass) {
    console.error('Unknown mode:', mode);
    return;
  }

  const engine = new GameEngine({
    entries: allEntries,
    direction,
    sessionSize: 20,
  });

  activeMode = new ModeClass();
  activeMode.init(screens.play, engine);

  // Listen for session end to record progress
  engine.on('session:ended', (summary) => {
    recordSession({
      date: new Date().toISOString(),
      score: summary.score,
      total: summary.totalWords,
      durationSeconds: Math.round(summary.elapsedTime / 1000),
      wordIds: [],
    });
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

// --- Init ---
async function init() {
  try {
    const [enEntries, srEntries] = await Promise.all([
      loadVocabulary('data/vocabulary-en.json'),
      loadVocabulary('data/vocabulary-sr.json'),
    ]);

    const builtIn = [...enEntries, ...srEntries];
    const userWords = loadUserWords();
    allEntries = mergeWithBuiltIn(builtIn, userWords);

    // Menu
    menuScreen = new MenuScreen();
    menuScreen.init(screens.menu, {
      wordCount: allEntries.length,
      onStart: startGame,
      onExport: () => exportToExcel(allEntries),
    });

    // Stats
    statsScreen = new StatsScreen();
    statsScreen.init(screens.stats);

    // Add Words
    addWordsScreen = new AddWordsScreen();
    addWordsScreen.init(screens.addWords, builtIn);

    // Tab bar
    buildTabBar();

    // Router
    router = new Router();
    router.register('#home', () => {
      stopGame();
      // Refresh word count in case user added words
      const freshUserWords = loadUserWords();
      allEntries = mergeWithBuiltIn(builtIn, freshUserWords);
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

    router.register('#add-words', () => {
      addWordsScreen.show();
    }, () => {
      addWordsScreen.hide();
    });

    router.start();
  } catch (err) {
    console.error('Failed to initialize app:', err);
    app.innerHTML = `<p style="color:var(--color-danger);padding:2rem">Ошибка загрузки: ${err.message}</p>`;
  }
}

init();
