/**
 * IceBeats Web — IndexedDB Local Storage Manager
 * Stores Favorites, Playlists, Play History, and Preferences persistently in the browser.
 */

class MusicDatabase {
  constructor() {
    this.dbName = 'IceBeatsWebDB';
    this.dbVersion = 1;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Favorites store
        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { keyPath: 'id' });
          favStore.createIndex('addedAt', 'addedAt', { unique: false });
        }

        // History store
        if (!db.objectStoreNames.contains('history')) {
          const histStore = db.createObjectStore('history', { keyPath: 'historyId', autoIncrement: true });
          histStore.createIndex('playedAt', 'playedAt', { unique: false });
          histStore.createIndex('id', 'id', { unique: false });
        }

        // Custom Playlists store
        if (!db.objectStoreNames.contains('playlists')) {
          const plStore = db.createObjectStore('playlists', { keyPath: 'id' });
          plStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Settings / Preferences store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB Error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async ensureDB() {
    if (!this.db) await this.initPromise;
    return this.db;
  }

  /* --- FAVORITES --- */
  async getFavorites() {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('favorites', 'readonly');
      const store = transaction.objectStore('favorites');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = () => resolve([]);
    });
  }

  async isFavorite(id) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('favorites', 'readonly');
      const store = transaction.objectStore('favorites');
      const request = store.get(id);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror = () => resolve(false);
    });
  }

  async addFavorite(track) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('favorites', 'readwrite');
      const store = transaction.objectStore('favorites');
      const item = { ...track, addedAt: Date.now() };
      store.put(item);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    });
  }

  async removeFavorite(id) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('favorites', 'readwrite');
      const store = transaction.objectStore('favorites');
      store.delete(id);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    });
  }

  /* --- HISTORY --- */
  async addToHistory(track) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('history', 'readwrite');
      const store = transaction.objectStore('history');
      const item = { ...track, playedAt: Date.now() };
      store.add(item);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    });
  }

  async getHistory(limit = 40) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('history', 'readonly');
      const store = transaction.objectStore('history');
      const request = store.getAll();
      request.onsuccess = () => {
        const unique = [];
        const seen = new Set();
        const raw = request.result.reverse();
        for (const item of raw) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            unique.push(item);
          }
          if (unique.length >= limit) break;
        }
        resolve(unique);
      };
      request.onerror = () => resolve([]);
    });
  }

  async clearHistory() {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('history', 'readwrite');
      const store = transaction.objectStore('history');
      store.clear();
      transaction.oncomplete = () => resolve(true);
    });
  }

  /* --- PLAYLISTS --- */
  async createPlaylist(name, description = '') {
    const db = await this.ensureDB();
    const id = 'pl_' + Date.now();
    const newPlaylist = {
      id,
      name,
      description,
      tracks: [],
      createdAt: Date.now()
    };
    return new Promise((resolve) => {
      const transaction = db.transaction('playlists', 'readwrite');
      const store = transaction.objectStore('playlists');
      store.put(newPlaylist);
      transaction.oncomplete = () => resolve(newPlaylist);
    });
  }

  async getPlaylists() {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('playlists', 'readonly');
      const store = transaction.objectStore('playlists');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });
  }

  async addTrackToPlaylist(playlistId, track) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('playlists', 'readwrite');
      const store = transaction.objectStore('playlists');
      const request = store.get(playlistId);
      request.onsuccess = () => {
        const playlist = request.result;
        if (playlist) {
          if (!playlist.tracks.some(t => t.id === track.id)) {
            playlist.tracks.push(track);
            store.put(playlist);
          }
        }
        resolve(true);
      };
    });
  }

  /* --- SETTINGS --- */
  async getSetting(key, defaultValue = null) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : defaultValue);
      };
      request.onerror = () => resolve(defaultValue);
    });
  }

  async setSetting(key, value) {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction('settings', 'readwrite');
      const store = transaction.objectStore('settings');
      store.put({ key, value });
      transaction.oncomplete = () => resolve(true);
    });
  }

  async resetAll() {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(['favorites', 'history', 'playlists', 'settings'], 'readwrite');
      transaction.objectStore('favorites').clear();
      transaction.objectStore('history').clear();
      transaction.objectStore('playlists').clear();
      transaction.objectStore('settings').clear();
      transaction.oncomplete = () => resolve(true);
    });
  }
}

// Global singleton instance
window.db = new MusicDatabase();
