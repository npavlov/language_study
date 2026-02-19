# Routing & Navigation

## Router

**File**: `src/js/router.js`

Hash-based SPA router. Routes: `#home`, `#play`, `#stats`, `#add-words`.

```js
const router = new Router();
router.register('#home', showFn, hideFn);
router.start();           // Binds hashchange + fires initial route
router.navigate('#play'); // Sets window.location.hash
```

### Route Handlers (in `main.js`)

| Route | Show | Hide |
|-------|------|------|
| `#home` | `stopGame()`, rebuild entries, show menu | Hide menu |
| `#play` | If no active game → redirect to `#home`. Else show play screen | Hide play screen, destroy game |
| `#stats` | Show stats screen | Hide stats screen |
| `#add-words` | Load vocab, update built-in list, show | Hide |

### Fallback

Unknown hashes fall back to `#home`.

## Tab Bar

**Built in**: `main.js → buildTabBar()`

Three tabs:
1. 🏠 Игра → `#home`
2. 📊 Статистика → `#stats`
3. ➕ Слова → `#add-words`

Fixed at bottom of viewport. CSS class: `.tab-bar`, `.tab-bar__item`, `.tab-bar__item--active`.

## Screens

Created programmatically in `main.js`:

```js
screens.menu     → #menu-screen
screens.play     → #play-screen
screens.stats    → #stats-screen
screens.addWords → #add-words-screen
```

Each screen is a `<div class="screen">`. Active screen gets `screen--active` (CSS: `display: block`).

## Game Launch Flow

```
User clicks "Начать" on menu
  → startGame({ direction, mode })
  → ensureVocabLoaded()       // lazy fetch vocabulary.db
  → rebuildAllEntries()       // merge built-in + user words
  → new GameEngine({ entries, direction })
  → new ModeClass().init(screens.play, engine)
  → engine.on('mode:done', () => router.navigate('#home'))
  → router.navigate('#play')
  → activeMode.start()
```

## Refresh Safety

If the user refreshes on `#play` with no active game, the `#play` show handler redirects to `#home`.
