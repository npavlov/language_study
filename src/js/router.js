/**
 * Simple hash-based SPA router.
 * Routes: #home, #play, #stats, #add-words
 */

export class Router {
  constructor() {
    this._routes = new Map();
    this._currentRoute = null;
    this._onHashChange = this._onHashChange.bind(this);
  }

  register(hash, showFn, hideFn) {
    this._routes.set(hash, { show: showFn, hide: hideFn });
  }

  start() {
    window.addEventListener('hashchange', this._onHashChange);
    this._onHashChange();
  }

  stop() {
    window.removeEventListener('hashchange', this._onHashChange);
  }

  navigate(hash) {
    window.location.hash = hash;
  }

  _onHashChange() {
    const hash = window.location.hash || '#home';

    if (this._currentRoute && this._routes.has(this._currentRoute)) {
      this._routes.get(this._currentRoute).hide();
    }

    this._currentRoute = hash;

    if (this._routes.has(hash)) {
      this._routes.get(hash).show();
    } else {
      // Fallback to home
      this._currentRoute = '#home';
      if (this._routes.has('#home')) {
        this._routes.get('#home').show();
      }
    }
  }
}
