/**
 * IceBeats Web — Main Application Controller & UI Router
 * Initializes components, handles navigation, searches, lyrics synchronization, and events.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide Icons
  if (window.lucide) window.lucide.createIcons();

  // App Controller
  const app = new IceBeatsApp();
  await app.init();
});

class IceBeatsApp {
  constructor() {
    this.currentView = 'home';
    this.currentLyrics = [];
    this.activeLyricIndex = -1;
    this.searchDebounceTimer = null;
    this.activeGenre = 'all';
    this.currentTheme = 'frost';
  }

  async init() {
    this.initNavigation();
    this.initHeaderControls();
    this.initSearch();
    this.initMiniPlayerEvents();
    this.initFullPlayerEvents();
    this.initLyricsEvents();
    this.initQueueDrawer();
    this.initLocalFilesHandler();
    this.initSettings();
    this.initKeyboardShortcuts();
    this.initModals();
    this.initHeroCarousel();

    // Load initial feed
    await this.loadHomeFeed();
    await this.updateFavoritesCounter();
    this.loadPersistedSettings();
  }

  /* --- 1. NAVIGATION & ROUTING --- */
  initNavigation() {
    const navLinks = document.querySelectorAll('[data-nav]');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-nav');
        this.switchView(targetView);

        // Close mobile sidebar if open
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('open');
      });
    });

    // Mobile sidebar toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.getElementById('sidebar');

    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => sidebar.classList.add('open'));
    }
    if (closeSidebarBtn && sidebar) {
      closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));
    }
  }

  async switchView(viewName) {
    this.currentView = viewName;

    // Update active nav links
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.getAttribute('data-nav') === viewName);
    });

    // Hide all view sections
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    // Show target view
    const targetSection = document.getElementById(`view-${viewName}`);
    if (targetSection) {
      targetSection.classList.add('active');
    }

    // Lazy load view contents
    if (viewName === 'favorites') {
      await this.loadFavoritesView();
    } else if (viewName === 'history') {
      await this.loadHistoryView();
    } else if (viewName === 'explore') {
      await this.loadExploreView();
    } else if (viewName === 'playlists') {
      await this.loadPlaylistsView();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  /* --- HERO CAROUSEL AUTO-ROTATION --- */
  initHeroCarousel() {
    this._heroSlideIndex = 0;
    this._heroSlideCount = 0;
    this._heroCarouselInterval = null;
  }

  startHeroCarousel(count) {
    this._heroSlideCount = count;
    this._heroSlideIndex = 0;
    if (this._heroCarouselInterval) clearInterval(this._heroCarouselInterval);
    this._heroCarouselInterval = setInterval(() => {
      this._heroSlideIndex = (this._heroSlideIndex + 1) % this._heroSlideCount;
      this.goToHeroSlide(this._heroSlideIndex);
    }, 5000);
  }

  goToHeroSlide(idx) {
    const heroTrack = document.getElementById('hero-track');
    const heroDots = document.getElementById('hero-dots');
    if (!heroTrack) return;

    heroTrack.style.transform = `translateX(-${idx * 100}%)`;

    if (heroDots) {
      heroDots.querySelectorAll('.hero-dot').forEach((d, i) => {
        d.classList.toggle('active', i === idx);
      });
    }
  }

  /* --- 2. HOME FEED & CAROUSEL --- */
  async loadHomeFeed() {
    const heroTrack = document.getElementById('hero-track');
    const heroDots = document.getElementById('hero-dots');
    const quickGrid = document.getElementById('quick-picks-grid');
    const trendShelf = document.getElementById('trending-shelf');
    const artistShelf = document.getElementById('top-artists-shelf');

    // Load trending tracks
    const tracks = await window.musicApi.getTrendingFeed(this.activeGenre);

    if (tracks.length > 0) {
      // 1. Populate Hero Carousel (Top 3 tracks)
      const heroSlides = tracks.slice(0, 3);
      if (heroTrack) {
        heroTrack.innerHTML = heroSlides.map(t => `
          <div class="hero-slide">
            <img src="${t.thumbnail}" alt="${t.title}" class="hero-slide-bg">
            <div class="hero-slide-content">
              <span class="hero-tag"><i data-lucide="sparkles"></i> PILIHAN UTAMA</span>
              <h2 class="hero-title">${t.title}</h2>
              <p class="hero-artist">${t.artist}</p>
              <div class="hero-actions">
                <button class="btn-primary play-hero-btn" data-track-id="${t.id}">
                  <i data-lucide="play"></i> Putar Sekarang
                </button>
                <button class="btn-secondary add-hero-queue-btn" data-track-id="${t.id}">
                  <i data-lucide="plus"></i> Tambah Antrean
                </button>
              </div>
            </div>
          </div>
        `).join('');


        if (heroDots) {
          heroDots.innerHTML = heroSlides.map((_, i) => `
            <div class="hero-dot ${i === 0 ? 'active' : ''}" data-slide="${i}"></div>
          `).join('');

          heroDots.querySelectorAll('.hero-dot').forEach((dot, i) => {
            dot.addEventListener('click', () => {
              this._heroSlideIndex = i;
              this.goToHeroSlide(i);
              // Restart auto-rotation
              this.startHeroCarousel(heroSlides.length);
            });
          });
        }

        // Attach hero play buttons
        heroTrack.querySelectorAll('.play-hero-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const tId = btn.getAttribute('data-track-id');
            const track = tracks.find(t => t.id === tId);
            if (track) {
              window.queue.setQueue(tracks, tracks.indexOf(track));
              window.audioEngine.playTrack(track);
            }
          });
        });

        // Start auto-rotation
        this.startHeroCarousel(heroSlides.length);
      }

      // 2. Populate Quick Picks Grid
      if (quickGrid) {
        quickGrid.innerHTML = tracks.slice(0, 8).map(t => `
          <div class="music-card" data-track-id="${t.id}">
            <div class="card-art-wrap">
              <img src="${t.thumbnail}" alt="${t.title}" class="card-cover" loading="lazy">
              <button class="card-play-hover-btn" aria-label="Putar">
                <i data-lucide="play"></i>
              </button>
            </div>
            <span class="card-title">${t.title}</span>
            <span class="card-artist">${t.artist}</span>
          </div>
        `).join('');

        quickGrid.querySelectorAll('.music-card').forEach(card => {
          card.addEventListener('click', () => {
            const tId = card.getAttribute('data-track-id');
            const track = tracks.find(t => t.id === tId);
            if (track) {
              window.queue.setQueue(tracks, tracks.indexOf(track));
              window.audioEngine.playTrack(track);
            }
          });
        });
      }

      // 3. Populate Trending Shelf
      if (trendShelf) {
        trendShelf.innerHTML = tracks.slice(2, 10).map(t => `
          <div class="music-card" data-track-id="${t.id}">
            <div class="card-art-wrap">
              <img src="${t.thumbnail}" alt="${t.title}" class="card-cover" loading="lazy">
              <button class="card-play-hover-btn" aria-label="Putar">
                <i data-lucide="play"></i>
              </button>
            </div>
            <span class="card-title">${t.title}</span>
            <span class="card-artist">${t.artist}</span>
          </div>
        `).join('');

        trendShelf.querySelectorAll('.music-card').forEach(card => {
          card.addEventListener('click', () => {
            const tId = card.getAttribute('data-track-id');
            const track = tracks.find(t => t.id === tId);
            if (track) {
              window.queue.setQueue(tracks, tracks.indexOf(track));
              window.audioEngine.playTrack(track);
            }
          });
        });
      }

      // 4. Populate Top Artists Shelf
      if (artistShelf) {
        const uniqueArtists = Array.from(new Set(tracks.map(t => t.artist))).slice(0, 6);
        artistShelf.innerHTML = uniqueArtists.map(artistName => {
          const sample = tracks.find(t => t.artist === artistName);
          return `
            <div class="music-card artist-card" data-artist="${artistName}">
              <div class="card-art-wrap">
                <img src="${sample ? sample.thumbnail : ''}" alt="${artistName}" class="card-cover" loading="lazy">
                <button class="card-play-hover-btn" aria-label="Cari Artis">
                  <i data-lucide="search"></i>
                </button>
              </div>
              <span class="card-title" style="text-align: center;">${artistName}</span>
              <span class="card-artist" style="text-align: center;">Artis Populer</span>
            </div>
          `;
        }).join('');

        artistShelf.querySelectorAll('.artist-card').forEach(card => {
          card.addEventListener('click', () => {
            const artistName = card.getAttribute('data-artist');
            this.executeSearch(artistName);
          });
        });
      }

      // Play All Quick Picks
      const playAllBtn = document.getElementById('play-all-quick-picks');
      if (playAllBtn) {
        playAllBtn.onclick = () => {
          window.queue.setQueue(tracks, 0);
          window.audioEngine.playTrack(tracks[0]);
        };
      }
    }

    // Genre/Mood Chips handler
    const moodChips = document.querySelectorAll('#mood-chips .chip');
    moodChips.forEach(chip => {
      chip.addEventListener('click', async () => {
        moodChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeGenre = chip.getAttribute('data-genre');
        await this.loadHomeFeed();
      });
    });

    if (window.lucide) window.lucide.createIcons();
  }

  /* --- 3. SEARCH & AUTOCOMPLETE --- */
  initSearch() {
    const input = document.getElementById('global-search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    const suggestionsDropdown = document.getElementById('search-suggestions');

    if (!input) return;

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn.style.display = q ? 'block' : 'none';

      clearTimeout(this.searchDebounceTimer);
      if (q.length >= 2) {
        this.searchDebounceTimer = setTimeout(async () => {
          const suggestions = await window.musicApi.getSuggestions(q);
          if (suggestions.length > 0 && suggestionsDropdown) {
            suggestionsDropdown.innerHTML = suggestions.slice(0, 5).map(s => `
              <div class="suggestion-item" data-query="${s}">
                <i data-lucide="search"></i>
                <span>${s}</span>
              </div>
            `).join('');
            suggestionsDropdown.style.display = 'block';
            if (window.lucide) window.lucide.createIcons();

            suggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
              item.addEventListener('click', () => {
                const query = item.getAttribute('data-query');
                input.value = query;
                suggestionsDropdown.style.display = 'none';
                this.executeSearch(query);
              });
            });
          }
        }, 250);
      } else {
        if (suggestionsDropdown) suggestionsDropdown.style.display = 'none';
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) {
          if (suggestionsDropdown) suggestionsDropdown.style.display = 'none';
          this.executeSearch(q);
        }
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        if (suggestionsDropdown) suggestionsDropdown.style.display = 'none';
      });
    }

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-box-header') && suggestionsDropdown) {
        suggestionsDropdown.style.display = 'none';
      }
    });

    // Search filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.getAttribute('data-filter');
        const q = input.value.trim();
        if (q) this.executeSearch(q, filter);
      });
    });
  }

  async executeSearch(query, filter = 'all') {
    this.switchView('search');
    const container = document.getElementById('search-results-container');
    const statusBar = document.getElementById('search-status-bar');
    const queryLabel = document.getElementById('search-query-label');
    const countLabel = document.getElementById('search-count-label');

    if (statusBar && queryLabel) {
      statusBar.style.display = 'flex';
      queryLabel.textContent = `Mencari "${query}"...`;
    }

    if (container) {
      container.innerHTML = `
        <div class="empty-search-placeholder">
          <i data-lucide="loader" class="large-placeholder-icon" style="animation: spin 1s linear infinite;"></i>
          <h3>Sedang mengambil data musik...</h3>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    const results = await window.musicApi.search(query, filter);

    if (container) {
      if (results.length === 0) {
        container.innerHTML = `
          <div class="empty-search-placeholder">
            <i data-lucide="music" class="large-placeholder-icon"></i>
            <h3>Tidak ada hasil ditemukan</h3>
            <p>Coba kata kunci lagu atau artis lain.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="songs-list-view">
            ${results.map((t, idx) => `
              <div class="song-row-item" data-track-id="${t.id}">
                <span class="song-row-num">${idx + 1}</span>
                <img src="${t.thumbnail}" alt="${t.title}" class="song-row-art" loading="lazy">
                <div class="song-row-info">
                  <span class="song-row-title">${t.title}</span>
                  <span class="song-row-artist">${t.artist}</span>
                </div>
                <span class="song-row-duration">${t.durationStr}</span>
                <div class="song-row-actions">
                  <button class="icon-btn row-fav-btn" title="Sukai" data-fav-id="${t.id}">
                    <i data-lucide="heart"></i>
                  </button>
                  <button class="icon-btn row-queue-btn" title="Tambah Antrean" data-queue-id="${t.id}">
                    <i data-lucide="plus"></i>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        // Row clicks to play
        container.querySelectorAll('.song-row-item').forEach(row => {
          row.addEventListener('click', (e) => {
            if (e.target.closest('.song-row-actions')) return;
            const tId = row.getAttribute('data-track-id');
            const track = results.find(t => t.id === tId);
            if (track) {
              window.queue.setQueue(results, results.indexOf(track));
              window.audioEngine.playTrack(track);
            }
          });
        });

        // Fav button inside row
        container.querySelectorAll('.row-fav-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const tId = btn.getAttribute('data-fav-id');
            const track = results.find(t => t.id === tId);
            if (track) await this.toggleFavorite(track, btn);
          });
        });

        // Queue button inside row
        container.querySelectorAll('.row-queue-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const tId = btn.getAttribute('data-queue-id');
            const track = results.find(t => t.id === tId);
            if (track) {
              window.queue.addToQueue(track);
              window.showToast(`Ditambahkan ke antrean: ${track.title}`, 'plus');
            }
          });
        });

        if (queryLabel) queryLabel.textContent = `Hasil untuk "${query}"`;
        if (countLabel) countLabel.textContent = `${results.length} lagu ditemukan`;
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  /* --- 4. FAVORITES, HISTORY & PLAYLISTS --- */
  async toggleFavorite(track, btnElement = null) {
    if (!window.db || !track) return;
    const isFav = await window.db.isFavorite(track.id);

    if (isFav) {
      await window.db.removeFavorite(track.id);
      window.showToast(`Dihapus dari Favorit: ${track.title}`, 'heart-off');
    } else {
      await window.db.addFavorite(track);
      window.showToast(`Disimpan ke Favorit: ${track.title}`, 'heart');
    }

    if (btnElement) {
      btnElement.classList.toggle('active', !isFav);
    }
    window.audioEngine.updateFavoriteButtonState(track.id);
    await this.updateFavoritesCounter();

    if (this.currentView === 'favorites') {
      await this.loadFavoritesView();
    }
  }

  async updateFavoritesCounter() {
    if (!window.db) return;
    const favs = await window.db.getFavorites();
    const countEl = document.getElementById('favorites-count');
    const favMeta = document.getElementById('fav-count-meta');
    if (countEl) countEl.textContent = favs.length;
    if (favMeta) favMeta.textContent = `${favs.length} Lagu • Tersimpan di Browser`;
  }

  async loadFavoritesView() {
    if (!window.db) return;
    const favs = await window.db.getFavorites();
    const list = document.getElementById('favorites-list');
    if (!list) return;

    if (favs.length === 0) {
      list.innerHTML = `
        <div class="empty-search-placeholder">
          <i data-lucide="heart" class="large-placeholder-icon"></i>
          <h3>Belum ada lagu favorit</h3>
          <p>Klik tombol hati ❤️ pada lagu mana pun untuk menambahkannya ke sini.</p>
        </div>
      `;
    } else {
      list.innerHTML = favs.map((t, idx) => `
        <div class="song-row-item" data-fav-id="${t.id}">
          <span class="song-row-num">${idx + 1}</span>
          <img src="${t.thumbnail}" alt="${t.title}" class="song-row-art" loading="lazy">
          <div class="song-row-info">
            <span class="song-row-title">${t.title}</span>
            <span class="song-row-artist">${t.artist}</span>
          </div>
          <span class="song-row-duration">${t.durationStr || '3:00'}</span>
          <div class="song-row-actions">
            <button class="icon-btn row-del-fav-btn" title="Hapus dari Favorit" data-del-id="${t.id}">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.song-row-item').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.song-row-actions')) return;
          const tId = row.getAttribute('data-fav-id');
          const track = favs.find(t => t.id === tId);
          if (track) {
            window.queue.setQueue(favs, favs.indexOf(track));
            window.audioEngine.playTrack(track);
          }
        });
      });

      list.querySelectorAll('.row-del-fav-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tId = btn.getAttribute('data-del-id');
          await window.db.removeFavorite(tId);
          await this.loadFavoritesView();
          await this.updateFavoritesCounter();
        });
      });

      const playFavBtn = document.getElementById('play-all-favorites');
      const shuffleFavBtn = document.getElementById('shuffle-favorites');
      if (playFavBtn) {
        playFavBtn.onclick = () => {
          window.queue.setQueue(favs, 0);
          window.audioEngine.playTrack(favs[0]);
        };
      }
      if (shuffleFavBtn) {
        shuffleFavBtn.onclick = () => {
          window.queue.isShuffle = true;
          window.queue.setQueue(favs, 0);
          window.audioEngine.playTrack(window.queue.getCurrentTrack());
        };
      }
    }
  }

  async loadHistoryView() {
    if (!window.db) return;
    const history = await window.db.getHistory();
    const list = document.getElementById('history-list');
    if (!list) return;

    if (history.length === 0) {
      list.innerHTML = `
        <div class="empty-search-placeholder">
          <i data-lucide="history" class="large-placeholder-icon"></i>
          <h3>Belum ada riwayat pemutaran</h3>
          <p>Lagu yang Anda dengarkan akan tercatat di sini secara otomatis.</p>
        </div>
      `;
    } else {
      list.innerHTML = history.map((t, idx) => `
        <div class="song-row-item" data-hist-id="${t.id}">
          <span class="song-row-num">${idx + 1}</span>
          <img src="${t.thumbnail}" alt="${t.title}" class="song-row-art" loading="lazy">
          <div class="song-row-info">
            <span class="song-row-title">${t.title}</span>
            <span class="song-row-artist">${t.artist}</span>
          </div>
          <span class="song-row-duration">${t.durationStr || '3:00'}</span>
        </div>
      `).join('');

      list.querySelectorAll('.song-row-item').forEach(row => {
        row.addEventListener('click', () => {
          const tId = row.getAttribute('data-hist-id');
          const track = history.find(t => t.id === tId);
          if (track) {
            window.queue.setQueue(history, history.indexOf(track));
            window.audioEngine.playTrack(track);
          }
        });
      });
    }

    const clearHistBtn = document.getElementById('clear-history-btn');
    if (clearHistBtn) {
      clearHistBtn.onclick = async () => {
        await window.db.clearHistory();
        await this.loadHistoryView();
        window.showToast('Riwayat putar telah dibersihkan', 'trash-2');
      };
    }
  }

  async loadExploreView() {
    const genreGrid = document.getElementById('explore-genre-grid');
    const top100List = document.getElementById('explore-top100-list');

    const genres = [
      { name: 'Pop Hits', bg: 'linear-gradient(135deg, #f43f5e, #e11d48)', icon: 'sparkles', query: 'Top Pop Hits' },
      { name: 'Indo Hits', bg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', icon: 'music', query: 'Lagu Hits Indonesia Populer' },
      { name: 'K-Pop Trend', bg: 'linear-gradient(135deg, #ec4899, #db2777)', icon: 'heart', query: 'K-Pop Top Hits' },
      { name: 'Lo-Fi Chill', bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', icon: 'coffee', query: 'Lo-Fi Beats to Relax' },
      { name: 'Rock Legends', bg: 'linear-gradient(135deg, #f97316, #ea580c)', icon: 'flame', query: 'Classic Rock Hits' },
      { name: 'EDM & Party', bg: 'linear-gradient(135deg, #06b6d4, #0891b2)', icon: 'zap', query: 'Festival EDM Party' }
    ];

    if (genreGrid) {
      genreGrid.innerHTML = genres.map(g => `
        <div class="genre-card" style="background: ${g.bg};" data-genre-query="${g.query}">
          <span>${g.name}</span>
          <i data-lucide="${g.icon}"></i>
        </div>
      `).join('');

      genreGrid.querySelectorAll('.genre-card').forEach(card => {
        card.addEventListener('click', () => {
          const q = card.getAttribute('data-genre-query');
          this.executeSearch(q);
        });
      });
    }

    if (top100List) {
      const topTracks = await window.musicApi.getTrendingFeed('all');
      top100List.innerHTML = topTracks.map((t, idx) => `
        <div class="song-row-item" data-top-id="${t.id}">
          <span class="song-row-num">${idx + 1}</span>
          <img src="${t.thumbnail}" alt="${t.title}" class="song-row-art" loading="lazy">
          <div class="song-row-info">
            <span class="song-row-title">${t.title}</span>
            <span class="song-row-artist">${t.artist}</span>
          </div>
          <span class="song-row-duration">${t.durationStr}</span>
        </div>
      `).join('');

      top100List.querySelectorAll('.song-row-item').forEach(row => {
        row.addEventListener('click', () => {
          const tId = row.getAttribute('data-top-id');
          const track = topTracks.find(t => t.id === tId);
          if (track) {
            window.queue.setQueue(topTracks, topTracks.indexOf(track));
            window.audioEngine.playTrack(track);
          }
        });
      });
    }
  }

  async loadPlaylistsView() {
    if (!window.db) return;
    const playlists = await window.db.getPlaylists();
    const grid = document.getElementById('playlists-grid');
    if (!grid) return;

    if (playlists.length === 0) {
      grid.innerHTML = `
        <div class="empty-search-placeholder" style="grid-column: 1 / -1;">
          <i data-lucide="list-music" class="large-placeholder-icon"></i>
          <h3>Belum ada playlist kustom</h3>
          <p>Klik tombol "Buat Playlist Baru" di atas untuk membuat koleksi Anda sendiri.</p>
        </div>
      `;
    } else {
      grid.innerHTML = playlists.map(pl => `
        <div class="music-card playlist-card" data-pl-id="${pl.id}">
          <div class="card-art-wrap" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="music" style="width: 48px; height: 48px; color: #fff;"></i>
          </div>
          <span class="card-title">${pl.name}</span>
          <span class="card-artist">${pl.tracks ? pl.tracks.length : 0} Lagu</span>
        </div>
      `).join('');
    }
  }

  /* --- 5. MINI PLAYER CONTROLS --- */
  initMiniPlayerEvents() {
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const seekSlider = document.getElementById('seek-slider');
    const volSlider = document.getElementById('volume-slider');
    const muteBtn = document.getElementById('mute-btn');
    const favBtn = document.getElementById('mp-fav-btn');

    if (playPauseBtn) playPauseBtn.addEventListener('click', () => window.audioEngine.togglePlay());
    if (prevBtn) prevBtn.addEventListener('click', () => window.audioEngine.playPreviousTrack());
    if (nextBtn) nextBtn.addEventListener('click', () => window.audioEngine.playNextTrack());

    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => {
        const isShuff = window.queue.toggleShuffle();
        shuffleBtn.classList.toggle('active', isShuff);
        window.showToast(isShuff ? 'Acak Lagu (Shuffle) Aktif' : 'Acak Lagu Dimatikan', 'shuffle');
      });
    }

    if (repeatBtn) {
      repeatBtn.addEventListener('click', () => {
        const rep = window.queue.toggleRepeat();
        repeatBtn.classList.toggle('active', rep !== 'none');
        window.showToast(`Mode Ulang: ${rep.toUpperCase()}`, 'repeat');
      });
    }

    if (seekSlider) {
      seekSlider.addEventListener('input', () => {
        window.audioEngine.seekPercent(parseFloat(seekSlider.value));
      });
    }

    if (volSlider) {
      volSlider.addEventListener('input', () => {
        window.audioEngine.setVolume(parseFloat(volSlider.value));
      });
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', () => window.audioEngine.toggleMute());
    }

    if (favBtn) {
      favBtn.addEventListener('click', () => {
        const track = window.audioEngine.currentTrack;
        if (track) this.toggleFavorite(track, favBtn);
      });
    }

    // Mini progress track top click
    const miniTrack = document.getElementById('mini-progress-track');
    if (miniTrack) {
      miniTrack.addEventListener('click', (e) => {
        const rect = miniTrack.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        window.audioEngine.seekPercent(percent);
      });
    }
  }

  /* --- 6. FULLSCREEN ADAPTIVE PLAYER --- */
  initFullPlayerEvents() {
    const fullOverlay = document.getElementById('full-player-overlay');
    const openTrigger = document.getElementById('open-full-player-trigger');
    const expandBtn = document.getElementById('expand-player-btn');
    const collapseBtn = document.getElementById('collapse-full-player-btn');

    const openFullPlayer = () => fullOverlay && fullOverlay.classList.add('open');
    const closeFullPlayer = () => fullOverlay && fullOverlay.classList.remove('open');

    if (openTrigger) openTrigger.addEventListener('click', openFullPlayer);
    if (expandBtn) expandBtn.addEventListener('click', openFullPlayer);
    if (collapseBtn) collapseBtn.addEventListener('click', closeFullPlayer);

    // Full Player controls
    const fpPlayBtn = document.getElementById('fp-play-pause-btn');
    const fpPrevBtn = document.getElementById('fp-prev-btn');
    const fpNextBtn = document.getElementById('fp-next-btn');
    const fpShuffleBtn = document.getElementById('fp-shuffle-btn');
    const fpRepeatBtn = document.getElementById('fp-repeat-btn');
    const fpSeekSlider = document.getElementById('fp-seek-slider');
    const fpFavBtn = document.getElementById('fp-fav-btn');

    if (fpPlayBtn) fpPlayBtn.addEventListener('click', () => window.audioEngine.togglePlay());
    if (fpPrevBtn) fpPrevBtn.addEventListener('click', () => window.audioEngine.playPreviousTrack());
    if (fpNextBtn) fpNextBtn.addEventListener('click', () => window.audioEngine.playNextTrack());

    if (fpShuffleBtn) {
      fpShuffleBtn.addEventListener('click', () => {
        const isShuff = window.queue.toggleShuffle();
        fpShuffleBtn.classList.toggle('active', isShuff);
      });
    }

    if (fpRepeatBtn) {
      fpRepeatBtn.addEventListener('click', () => {
        const rep = window.queue.toggleRepeat();
        fpRepeatBtn.classList.toggle('active', rep !== 'none');
      });
    }

    if (fpSeekSlider) {
      fpSeekSlider.addEventListener('input', () => {
        window.audioEngine.seekPercent(parseFloat(fpSeekSlider.value));
      });
    }

    if (fpFavBtn) {
      fpFavBtn.addEventListener('click', () => {
        const track = window.audioEngine.currentTrack;
        if (track) this.toggleFavorite(track, fpFavBtn);
      });
    }

    // Playback Speed Toggle
    const speedBtn = document.getElementById('fp-speed-btn');
    const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
    let speedIdx = 1;
    if (speedBtn) {
      speedBtn.addEventListener('click', () => {
        speedIdx = (speedIdx + 1) % speeds.length;
        window.audioEngine.setPlaybackRate(speeds[speedIdx]);
      });
    }

    // Full Player Tab Switching (Lyrics / Queue)
    const lyricsTab = document.getElementById('fp-view-lyrics-tab');
    const queueTab = document.getElementById('fp-view-queue-tab');
    const lyricsContainer = document.getElementById('lyrics-view-container');
    const inlineQueue = document.getElementById('fp-inline-queue');

    if (lyricsTab) {
      lyricsTab.addEventListener('click', () => {
        lyricsTab.classList.add('active');
        if (queueTab) queueTab.classList.remove('active');
        if (lyricsContainer) lyricsContainer.style.display = 'flex';
        if (inlineQueue) inlineQueue.style.display = 'none';
      });
    }

    if (queueTab) {
      queueTab.addEventListener('click', () => {
        queueTab.classList.add('active');
        if (lyricsTab) lyricsTab.classList.remove('active');
        if (inlineQueue) inlineQueue.style.display = 'block';
        if (lyricsContainer) lyricsContainer.style.display = 'none';
        // Populate inline queue list
        this.renderInlineQueue();
      });
    }
  }

  renderInlineQueue() {
    const list = document.getElementById('fp-inline-queue-list');
    if (!list) return;
    const q = window.queue.queue;
    const idx = window.queue.currentIndex;
    const upNext = q.slice(idx + 1);
    if (upNext.length === 0) {
      list.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">Tidak ada lagu berikutnya.</p>`;
    } else {
      list.innerHTML = upNext.map((t, i) => `
        <div class="q-item" data-fp-q-idx="${idx + 1 + i}">
          <img src="${t.thumbnail}" alt="${t.title}">
          <div class="q-meta">
            <span class="q-title">${t.title}</span>
            <span class="q-artist">${t.artist}</span>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.q-item').forEach(item => {
        item.addEventListener('click', () => {
          const qIdx = parseInt(item.getAttribute('data-fp-q-idx'), 10);
          const track = window.queue.queue[qIdx];
          if (track) {
            window.queue.currentIndex = qIdx;
            window.audioEngine.playTrack(track);
          }
        });
      });
    }
    if (window.lucide) window.lucide.createIcons();
  }

  /* --- 7. LIVE KARAOKE LYRICS SYNC --- */
  initLyricsEvents() {
    const linesWrapper = document.getElementById('lyrics-lines-wrapper');
    const lyricsStatus = document.getElementById('lyrics-status');
    const lyricsScrollBox = document.getElementById('lyrics-scroll-box');
    const lyricsProvider = document.getElementById('lyrics-provider-label');
    const copyBtn = document.getElementById('copy-lyrics-btn');
    const toggleLyricsBtn = document.getElementById('toggle-lyrics-btn');

    // Toggle lyrics panel or fullscreen lyrics
    if (toggleLyricsBtn) {
      toggleLyricsBtn.addEventListener('click', () => {
        const fullOverlay = document.getElementById('full-player-overlay');
        if (fullOverlay) {
          fullOverlay.classList.add('open');
        }
      });
    }

    // Load lyrics event
    window.addEventListener('icebeats:loadlyrics', async (e) => {
      const track = e.detail;
      this.currentLyrics = [];
      this.activeLyricIndex = -1;

      if (lyricsStatus) {
        lyricsStatus.style.display = 'flex';
        lyricsStatus.innerHTML = `<i data-lucide="mic"></i><p>Mencari lirik untuk "${track.title}"...</p>`;
        if (window.lucide) window.lucide.createIcons();
      }
      if (linesWrapper) linesWrapper.innerHTML = '';

      const lyricsData = await window.lyricsApi.getLyrics(track.title, track.artist, track.duration, track.album);

      if (lyricsProvider) lyricsProvider.textContent = lyricsData.provider;

      if (lyricsData.synced && lyricsData.lines.length > 0) {
        this.currentLyrics = lyricsData.lines;
        if (lyricsStatus) lyricsStatus.style.display = 'none';

        if (linesWrapper) {
          linesWrapper.innerHTML = this.currentLyrics.map((line, idx) => `
            <div class="lyric-line" data-line-idx="${idx}" data-time="${line.time}">
              ${line.text}
            </div>
          `).join('');

          // Click to seek to that lyric timestamp
          linesWrapper.querySelectorAll('.lyric-line').forEach(lineEl => {
            lineEl.addEventListener('click', () => {
              const targetTime = parseFloat(lineEl.getAttribute('data-time'));
              window.audioEngine.seek(targetTime);
            });
          });
        }
      } else if (lyricsData.plain) {
        if (lyricsStatus) lyricsStatus.style.display = 'none';
        if (linesWrapper) {
          linesWrapper.innerHTML = `<div class="lyrics-plain-text">${lyricsData.plain}</div>`;
        }
      }
    });

    // Real-time timeupdate synchronization
    window.addEventListener('icebeats:timeupdate', (e) => {
      const { currentTime } = e.detail;
      if (this.currentLyrics.length === 0) return;

      // Find current active lyric line
      let newIdx = -1;
      for (let i = 0; i < this.currentLyrics.length; i++) {
        if (currentTime >= this.currentLyrics[i].time) {
          newIdx = i;
        } else {
          break;
        }
      }

      if (newIdx !== this.activeLyricIndex && newIdx >= 0) {
        this.activeLyricIndex = newIdx;

        const allLines = linesWrapper.querySelectorAll('.lyric-line');
        allLines.forEach((lineEl, idx) => {
          lineEl.classList.toggle('active', idx === newIdx);
          lineEl.classList.toggle('passed', idx < newIdx);
        });

        // Smooth Auto Scroll to center active line
        const activeEl = allLines[newIdx];
        if (activeEl && lyricsScrollBox) {
          const scrollTarget = activeEl.offsetTop - lyricsScrollBox.offsetHeight / 2 + activeEl.offsetHeight / 2;
          lyricsScrollBox.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        }
      }
    });

    // Copy Lyrics
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (this.currentLyrics.length > 0) {
          const fullText = this.currentLyrics.map(l => l.text).join('\n');
          navigator.clipboard.writeText(fullText);
          window.showToast('Lirik disalin ke papan klip', 'check');
        }
      });
    }
  }

  /* --- 8. QUEUE DRAWER --- */
  initQueueDrawer() {
    const toggleBtn = document.getElementById('toggle-queue-btn');
    const closeBtn = document.getElementById('close-queue-btn');
    const drawer = document.getElementById('queue-drawer');
    const list = document.getElementById('queue-list');
    const countBadge = document.getElementById('queue-count-badge');
    const clearBtn = document.getElementById('clear-queue-btn');

    const openDrawer = () => drawer && drawer.classList.add('open');
    const closeDrawer = () => drawer && drawer.classList.remove('open');

    if (toggleBtn) toggleBtn.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    window.queue.onChange(({ queue, currentTrack, currentIndex }) => {
      if (countBadge) countBadge.textContent = queue.length;

      // Update Current Playing Card
      const qTitle = document.getElementById('q-title');
      const qArtist = document.getElementById('q-artist');
      const qThumb = document.getElementById('q-thumb');

      if (currentTrack) {
        if (qTitle) qTitle.textContent = currentTrack.title;
        if (qArtist) qArtist.textContent = currentTrack.artist;
        if (qThumb) qThumb.src = currentTrack.thumbnail;
      }

      // Render Up Next list
      if (list) {
        const upNext = queue.slice(currentIndex + 1);
        if (upNext.length === 0) {
          list.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); padding: 1rem 0;">Tidak ada lagu berikutnya dalam antrean.</p>`;
        } else {
          list.innerHTML = upNext.map((t, idx) => `
            <div class="q-item" data-q-idx="${currentIndex + 1 + idx}">
              <img src="${t.thumbnail}" alt="${t.title}">
              <div class="q-meta">
                <span class="q-title">${t.title}</span>
                <span class="q-artist">${t.artist}</span>
              </div>
              <button class="q-item-remove-btn" data-rem-idx="${currentIndex + 1 + idx}">
                <i data-lucide="x"></i>
              </button>
            </div>
          `).join('');

          list.querySelectorAll('.q-item').forEach(item => {
            item.addEventListener('click', (e) => {
              if (e.target.closest('.q-item-remove-btn')) return;
              const idx = parseInt(item.getAttribute('data-q-idx'), 10);
              const track = window.queue.queue[idx];
              if (track) {
                window.queue.currentIndex = idx;
                window.audioEngine.playTrack(track);
              }
            });
          });

          list.querySelectorAll('.q-item-remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const idx = parseInt(btn.getAttribute('data-rem-idx'), 10);
              window.queue.removeAt(idx);
            });
          });
        }
        if (window.lucide) window.lucide.createIcons();
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        window.queue.clearQueue();
        window.showToast('Antrean lagu dibersihkan', 'trash-2');
      });
    }
  }

  /* --- 9. LOCAL AUDIO FILES HANDLER --- */
  initLocalFilesHandler() {
    const fileInput = document.getElementById('local-file-input');
    const dropzone = document.getElementById('local-dropzone');
    const localList = document.getElementById('local-files-list');

    if (!fileInput || !dropzone) return;

    const handleFiles = (files) => {
      const localTracks = [];
      for (const file of files) {
        if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|m4a|ogg|aac)$/i)) {
          const blobUrl = URL.createObjectURL(file);
          const track = {
            id: 'local_' + Math.random().toString(36).substr(2, 9),
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'File Audio Lokal',
            album: 'Perangkat Saya',
            duration: 0,
            durationStr: 'Lokal',
            thumbnail: 'https://raw.githubusercontent.com/B7ByteMe/IceBeats/refs/heads/main/icon2.png',
            audioUrl: blobUrl,
            isLocal: true
          };
          localTracks.push(track);
        }
      }

      if (localTracks.length > 0) {
        if (localList) {
          localList.innerHTML = localTracks.map((t, idx) => `
            <div class="song-row-item" data-local-idx="${idx}">
              <span class="song-row-num">${idx + 1}</span>
              <img src="${t.thumbnail}" alt="${t.title}" class="song-row-art">
              <div class="song-row-info">
                <span class="song-row-title">${t.title}</span>
                <span class="song-row-artist">${t.artist}</span>
              </div>
              <span class="song-row-duration">Local</span>
            </div>
          `).join('');

          localList.querySelectorAll('.song-row-item').forEach(row => {
            row.addEventListener('click', () => {
              const idx = parseInt(row.getAttribute('data-local-idx'), 10);
              const track = localTracks[idx];
              window.queue.setQueue(localTracks, idx);
              window.audioEngine.playTrack(track);
            });
          });
        }
        window.showToast(`${localTracks.length} file audio lokal berhasil dimuat`, 'folder-check');
      }
    };

    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });
  }

  /* --- 10. THEMES & SETTINGS --- */
  initHeaderControls() {
    const themeMenuBtn = document.getElementById('theme-menu-btn');
    const themeDropdown = document.getElementById('theme-dropdown');
    const currentThemeLabel = document.getElementById('current-theme-label');

    if (themeMenuBtn && themeDropdown) {
      themeMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        themeDropdown.style.display = themeDropdown.style.display === 'none' ? 'flex' : 'none';
      });

      document.addEventListener('click', () => {
        themeDropdown.style.display = 'none';
      });

      themeDropdown.querySelectorAll('.theme-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          const theme = opt.getAttribute('data-set-theme');
          this.setTheme(theme);
          if (currentThemeLabel) currentThemeLabel.textContent = opt.querySelector('span:last-child').textContent;
        });
      });
    }
  }

  setTheme(themeName) {
    this.currentTheme = themeName;
    document.body.setAttribute('data-theme', themeName);
    if (window.db) window.db.setSetting('theme', themeName);
    window.showToast(`Tema diubah ke: ${themeName.toUpperCase()}`, 'sparkles');
  }

  async loadPersistedSettings() {
    if (!window.db) return;
    const savedTheme = await window.db.getSetting('theme', 'frost');
    if (savedTheme) {
      this.setTheme(savedTheme);
      const sel = document.getElementById('settings-theme-select');
      if (sel) sel.value = savedTheme;
    }
  }

  initSettings() {
    const themeSel = document.getElementById('settings-theme-select');
    if (themeSel) {
      themeSel.addEventListener('change', (e) => this.setTheme(e.target.value));
    }

    // Visualizer toggle
    const vizToggle = document.getElementById('toggle-visualizer');
    if (vizToggle) {
      vizToggle.addEventListener('change', () => {
        if (window.audioEngine) {
          window.audioEngine.isVisualizerActive = vizToggle.checked;
          const canvas = document.getElementById('visualizer-canvas');
          if (canvas) canvas.style.display = vizToggle.checked ? 'block' : 'none';
          if (vizToggle.checked && window.audioEngine.analyser) {
            window.audioEngine.renderVisualizerFrame();
          }
        }
      });
    }

    // Dynamic color toggle
    const colorToggle = document.getElementById('toggle-dynamic-color');
    if (colorToggle) {
      colorToggle.addEventListener('change', () => {
        if (!colorToggle.checked) {
          const ambient = document.getElementById('ambient-glow');
          if (ambient) ambient.style.background = '';
        } else if (window.audioEngine && window.audioEngine.currentTrack) {
          window.audioEngine.extractDynamicColor(window.audioEngine.currentTrack.thumbnail);
        }
      });
    }

    // Playback speed setting
    const speedSel = document.getElementById('settings-playback-speed');
    if (speedSel) {
      speedSel.addEventListener('change', (e) => {
        if (window.audioEngine) window.audioEngine.setPlaybackRate(parseFloat(e.target.value));
      });
    }

    const resetBtn = document.getElementById('reset-db-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Yakin ingin mereset seluruh data favorit, riwayat, dan playlist?')) {
          await window.db.resetAll();
          window.showToast('Seluruh data lokal berhasil direset', 'trash-2');
          location.reload();
        }
      });
    }
  }

  /* --- 11. KEYBOARD SHORTCUTS --- */
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger when user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          window.audioEngine.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          window.audioEngine.seek(window.audioEngine.audio.currentTime + 5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          window.audioEngine.seek(window.audioEngine.audio.currentTime - 5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          window.audioEngine.setVolume(window.audioEngine.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          window.audioEngine.setVolume(window.audioEngine.volume - 0.05);
          break;
        case 'KeyM':
          e.preventDefault();
          window.audioEngine.toggleMute();
          break;
        case 'KeyL':
        case 'KeyF': {
          e.preventDefault();
          const trigger = document.getElementById('open-full-player-trigger');
          if (trigger) trigger.click();
          break;
        }
        case 'KeyQ': {
          e.preventDefault();
          const queueBtn = document.getElementById('toggle-queue-btn');
          if (queueBtn) queueBtn.click();
          break;
        }
        case 'Slash': {
          e.preventDefault();
          const searchInput = document.getElementById('global-search-input');
          if (searchInput) searchInput.focus();
          break;
        }
      }
    });
  }

  /* --- 12. MODALS --- */
  initModals() {
    // Shortcuts Modal
    const shortcutsBtn = document.getElementById('shortcuts-btn');
    const shortcutsModal = document.getElementById('shortcuts-modal');
    if (shortcutsBtn && shortcutsModal) {
      shortcutsBtn.addEventListener('click', () => shortcutsModal.style.display = 'flex');
    }

    // Sleep Timer Modal
    const sleepBtn = document.getElementById('sleep-timer-btn');
    const fpSleepBtn = document.getElementById('fp-sleep-btn');
    const sleepModal = document.getElementById('sleep-timer-modal');
    const openSleep = () => sleepModal && (sleepModal.style.display = 'flex');

    if (sleepBtn) sleepBtn.addEventListener('click', openSleep);
    if (fpSleepBtn) fpSleepBtn.addEventListener('click', openSleep);

    if (sleepModal) {
      sleepModal.querySelectorAll('.timer-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mins = btn.getAttribute('data-minutes');
          window.audioEngine.setSleepTimer(mins);
          sleepModal.style.display = 'none';
        });
      });
    }

    // Create Playlist Modal
    const createPlaylistBtn = document.getElementById('create-playlist-btn');
    const createPlaylistModal = document.getElementById('create-playlist-modal');
    if (createPlaylistBtn && createPlaylistModal) {
      createPlaylistBtn.addEventListener('click', () => {
        createPlaylistModal.style.display = 'flex';
      });
    }

    // Save New Playlist
    const savePlaylistBtn = document.getElementById('save-new-playlist-btn');
    if (savePlaylistBtn) {
      savePlaylistBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('playlist-name-input');
        const descInput = document.getElementById('playlist-desc-input');
        const name = nameInput ? nameInput.value.trim() : '';
        const desc = descInput ? descInput.value.trim() : '';
        if (!name) {
          window.showToast('Nama playlist tidak boleh kosong', 'alert-circle');
          return;
        }
        if (window.db) {
          await window.db.createPlaylist(name, desc);
          window.showToast(`Playlist "${name}" berhasil dibuat!`, 'list-music');
          if (createPlaylistModal) createPlaylistModal.style.display = 'none';
          if (nameInput) nameInput.value = '';
          if (descInput) descInput.value = '';
          await this.loadPlaylistsView();
        }
      });
    }

    // Modal Close buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mId = btn.getAttribute('data-close-modal');
        const modal = document.getElementById(mId);
        if (modal) modal.style.display = 'none';
      });
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    });
  }
}

// Global Toast System
window.showToast = function(message, icon = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
};
