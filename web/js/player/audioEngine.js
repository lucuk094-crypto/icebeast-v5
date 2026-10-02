/**
 * IceBeats Web — Core Audio Engine & Visualizer
 * Dual-Engine: Seamlessly supports YouTube IFrame Player API & HTML5 Audio (Blob/Direct Stream).
 * Includes Web Audio API visualizer, MediaSession, Sleep Timer & Dynamic Color Extraction.
 */

class AudioEngine {
  constructor() {
    this.audio = document.getElementById('global-audio-player');
    this.isPlaying = false;
    this.currentTrack = null;
    this.playbackRate = 1.0;
    this.volume = 0.9;
    this.isMuted = false;
    this.sleepTimer = null;
    this.sleepEndTime = null;

    // Active Engine: 'audio' | 'youtube'
    this.activeEngine = 'youtube';
    this.ytPlayer = null;
    this.isYtReady = false;
    this.ytTicker = null;
    this.pendingYtTrack = null;

    // Web Audio API & Visualizer nodes
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.visualizerCanvas = document.getElementById('visualizer-canvas');
    this.canvasCtx = this.visualizerCanvas ? this.visualizerCanvas.getContext('2d') : null;
    this.isVisualizerActive = true;

    this.initAudioEvents();
    this.initMediaSession();

    // Check if YouTube API is already loaded
    if (window.YT && window.YT.Player) {
      this.initYouTubePlayer();
    }
  }

  /* --- YOUTUBE IFRAME PLAYER ENGINE --- */
  initYouTubePlayer() {
    if (this.ytPlayer || !window.YT || !window.YT.Player) return;
    try {
      this.ytPlayer = new window.YT.Player('youtube-player', {
        height: '200',
        width: '200',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1
        },
        events: {
          onReady: () => {
            this.isYtReady = true;
            try {
              this.ytPlayer.setVolume(this.volume * 100);
            } catch (e) {}

            if (this.pendingYtTrack) {
              const track = this.pendingYtTrack;
              this.pendingYtTrack = null;
              this.playTrack(track);
            }
          },
          onStateChange: (event) => {
            this.handleYtStateChange(event.data);
          },
          onError: (event) => {
            console.warn('YouTube Player error code:', event.data);
            window.showToast('Lagu tidak tersedia, mencoba lagu berikutnya...', 'alert-circle');
            setTimeout(() => this.playNextTrack(), 1500);
          }
        }
      });
    } catch (e) {
      console.warn('YouTube Player initialization failed:', e);
    }
  }

  handleYtStateChange(state) {
    if (!window.YT) return;
    if (state === window.YT.PlayerState.PLAYING) {
      this.isPlaying = true;
      this.updatePlayStateUI(true);
      this.startYtTicker();
      if (this.isVisualizerActive && this.canvasCtx) {
        this.renderVisualizerFrame();
      }
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else if (state === window.YT.PlayerState.PAUSED) {
      this.isPlaying = false;
      this.updatePlayStateUI(false);
      this.stopYtTicker();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else if (state === window.YT.PlayerState.ENDED) {
      this.stopYtTicker();
      this.onTrackEnded();
    }
  }

  startYtTicker() {
    this.stopYtTicker();
    this.ytTicker = setInterval(() => {
      if (this.activeEngine !== 'youtube' || !this.ytPlayer || !this.isYtReady) return;
      try {
        const current = this.ytPlayer.getCurrentTime() || 0;
        const duration = this.ytPlayer.getDuration() || (this.currentTrack ? this.currentTrack.duration : 0);
        this.updateScrubber(current, duration);

        window.dispatchEvent(new CustomEvent('icebeats:timeupdate', {
          detail: { currentTime: current, duration: duration }
        }));
      } catch (e) {}
    }, 250);
  }

  stopYtTicker() {
    if (this.ytTicker) {
      clearInterval(this.ytTicker);
      this.ytTicker = null;
    }
  }

  stopYouTube() {
    this.stopYtTicker();
    if (this.ytPlayer && this.isYtReady) {
      try {
        this.ytPlayer.stopVideo();
      } catch (e) {}
    }
  }

  /* --- HTML5 AUDIO ENGINE EVENTS --- */
  initAudioEvents() {
    if (!this.audio) return;

    this.audio.volume = this.volume;

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayStateUI(true);
      this.initWebAudioContext();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayStateUI(false);
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    });

    this.audio.addEventListener('timeupdate', () => {
      if (this.activeEngine !== 'audio') return;
      const current = this.audio.currentTime;
      const duration = this.audio.duration || (this.currentTrack ? this.currentTrack.duration : 0);
      this.updateScrubber(current, duration);

      // Dispatch event for Live Synced Lyrics
      window.dispatchEvent(new CustomEvent('icebeats:timeupdate', {
        detail: { currentTime: current, duration: duration }
      }));
    });

    this.audio.addEventListener('progress', () => {
      if (this.audio.buffered.length > 0) {
        const bufferedEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
        const duration = this.audio.duration || 1;
        const bufferedPercent = (bufferedEnd / duration) * 100;
        const bufBar = document.getElementById('buffered-bar');
        if (bufBar) bufBar.style.width = `${bufferedPercent}%`;
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.activeEngine === 'audio') {
        this.onTrackEnded();
      }
    });

    this.audio.addEventListener('error', (e) => {
      if (this.activeEngine === 'audio') {
        console.warn('Audio stream error, attempting next queue track...', e);
        window.showToast('Gagal memuat stream, mencoba lagu berikutnya...', 'alert-circle');
        setTimeout(() => this.playNextTrack(), 1000);
      }
    });
  }

  /**
   * Load and play a track seamlessly
   */
  async playTrack(track) {
    if (!track) return;
    this.currentTrack = track;

    // 1. Update UI Metadata immediately
    this.updateTrackInfoUI(track);

    // 2. Extract and apply dynamic dominant color
    this.extractDynamicColor(track.thumbnail);

    // 3. Save to History in IndexedDB
    if (window.db) {
      window.db.addToHistory(track);
    }

    // 4. Fetch & Load Lyrics
    window.dispatchEvent(new CustomEvent('icebeats:loadlyrics', { detail: track }));

    window.showToast(`Memutar "${track.title}"`, 'music');

    // Case A: Local file track (blob URL)
    if (track.isLocal && track.audioUrl) {
      this.stopYouTube();
      this.activeEngine = 'audio';
      try {
        this.audio.src = track.audioUrl;
        this.audio.playbackRate = this.playbackRate;
        await this.audio.play();
        this.updateMediaSessionMetadata(track);
      } catch (err) {
        console.error('Local file play failed:', err);
        window.showToast('Gagal memutar file lokal', 'alert-triangle');
      }
      return;
    }

    // Case B: YouTube track with videoId (Default & Guaranteed 100% Reliable Playback)
    const videoId = track.videoId || track.id;
    if (videoId && (!track.audioUrl || track.source === 'youtube')) {
      if (this.audio) this.audio.pause();
      this.activeEngine = 'youtube';

      if (this.ytPlayer && this.isYtReady) {
        try {
          this.ytPlayer.loadVideoById(videoId);
          this.ytPlayer.playVideo();
          this.isPlaying = true;
          this.updatePlayStateUI(true);
          this.startYtTicker();
          this.updateMediaSessionMetadata(track);
          return;
        } catch (e) {
          console.warn('YT loadVideoById failed:', e);
        }
      } else {
        this.pendingYtTrack = track;
        if (window.YT && window.YT.Player) {
          this.initYouTubePlayer();
        }
      }
    }

    // Case C: Track with direct audioUrl (e.g. preview from iTunes)
    if (track.audioUrl) {
      this.stopYouTube();
      this.activeEngine = 'audio';
      try {
        this.audio.src = track.audioUrl;
        this.audio.playbackRate = this.playbackRate;
        await this.audio.play();
        this.updateMediaSessionMetadata(track);
        return;
      } catch (err) {
        console.warn('Audio URL playback failed:', err);
      }
    }

    // Case D: Fallback stream resolution
    try {
      const streamInfo = await window.musicApi.getStreamUrl(videoId);
      if (streamInfo && streamInfo.audioUrl && !streamInfo.isEmbed) {
        this.stopYouTube();
        this.activeEngine = 'audio';
        this.audio.src = streamInfo.audioUrl;
        this.audio.playbackRate = this.playbackRate;
        await this.audio.play();
        this.updateMediaSessionMetadata(track);
        return;
      }
    } catch (err) {
      console.warn('Stream resolution fallback failed:', err);
    }

    // Final fallback: If YouTube is ready, load video ID
    if (videoId && this.ytPlayer && this.isYtReady) {
      this.activeEngine = 'youtube';
      this.ytPlayer.loadVideoById(videoId);
      this.ytPlayer.playVideo();
      this.startYtTicker();
    }

    this.updateMediaSessionMetadata(track);
  }

  togglePlay() {
    if (!this.currentTrack) {
      const first = window.queue.getCurrentTrack();
      if (first) {
        this.playTrack(first);
      }
      return;
    }

    if (this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady) {
      try {
        const state = this.ytPlayer.getPlayerState();
        if (state === (window.YT ? window.YT.PlayerState.PLAYING : 1)) {
          this.ytPlayer.pauseVideo();
        } else {
          this.ytPlayer.playVideo();
        }
      } catch (e) {
        this.ytPlayer.playVideo();
      }
    } else if (this.audio) {
      if (this.audio.paused) {
        this.audio.play().catch(console.error);
      } else {
        this.audio.pause();
      }
    }
  }

  pause() {
    if (this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady) {
      try { this.ytPlayer.pauseVideo(); } catch (e) {}
    } else if (this.audio) {
      this.audio.pause();
    }
  }

  resume() {
    if (this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady) {
      try { this.ytPlayer.playVideo(); } catch (e) {}
    } else if (this.audio) {
      this.audio.play().catch(console.error);
    }
  }

  seek(seconds) {
    if (this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady) {
      try { this.ytPlayer.seekTo(seconds, true); } catch (e) {}
    } else if (this.audio && !isNaN(seconds)) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 9999));
    }
  }

  seekPercent(percent) {
    let duration = 0;
    if (this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady) {
      try {
        duration = this.ytPlayer.getDuration() || (this.currentTrack ? this.currentTrack.duration : 0);
      } catch (e) {}
    } else if (this.audio) {
      duration = this.audio.duration || (this.currentTrack ? this.currentTrack.duration : 0);
    }

    if (duration > 0) {
      const target = (percent / 100) * duration;
      this.seek(target);
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.audio) this.audio.volume = this.volume;
    if (this.ytPlayer && this.isYtReady) {
      try {
        this.ytPlayer.setVolume(this.volume * 100);
      } catch (e) {}
    }
    this.updateVolumeUI();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.audio) this.audio.muted = this.isMuted;
    if (this.ytPlayer && this.isYtReady) {
      try {
        if (this.isMuted) this.ytPlayer.mute();
        else this.ytPlayer.unMute();
      } catch (e) {}
    }
    this.updateVolumeUI();
  }

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    if (this.audio) this.audio.playbackRate = rate;
    if (this.ytPlayer && this.isYtReady) {
      try { this.ytPlayer.setPlaybackRate(rate); } catch (e) {}
    }
    const label = document.getElementById('fp-speed-label');
    if (label) label.textContent = `${rate}x`;
  }

  playNextTrack() {
    const next = window.queue.getNextTrack();
    if (next) {
      this.playTrack(next);
    } else {
      window.showToast('Antrean lagu selesai', 'check');
    }
  }

  playPreviousTrack() {
    let current = 0;
    if (this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady) {
      try { current = this.ytPlayer.getCurrentTime() || 0; } catch (e) {}
    } else if (this.audio) {
      current = this.audio.currentTime;
    }

    if (current > 4) {
      this.seek(0);
      return;
    }
    const prev = window.queue.getPreviousTrack();
    if (prev) {
      this.playTrack(prev);
    }
  }

  onTrackEnded() {
    if (this.sleepEndTime === 'end_of_track') {
      this.cancelSleepTimer();
      this.pause();
      window.showToast('Sleep Timer: Pemutaran dihentikan di akhir lagu', 'moon');
      return;
    }
    this.playNextTrack();
  }

  /* --- MEDIA SESSION API (Lockscreen & Keyboard hotkeys) --- */
  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.playPreviousTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.playNextTrack());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime) this.seek(details.seekTime);
    });
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const cur = this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady
        ? (this.ytPlayer.getCurrentTime() || 0)
        : (this.audio.currentTime || 0);
      this.seek(cur - (details.seekOffset || 5));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const cur = this.activeEngine === 'youtube' && this.ytPlayer && this.isYtReady
        ? (this.ytPlayer.getCurrentTime() || 0)
        : (this.audio.currentTime || 0);
      this.seek(cur + (details.seekOffset || 5));
    });
  }

  updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || 'IceBeats Music',
      artwork: [
        { src: track.thumbnail, sizes: '96x96', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '128x128', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '256x256', type: 'image/jpeg' },
        { src: track.thumbnail, sizes: '512x512', type: 'image/jpeg' }
      ]
    });
  }

  /* --- UI UPDATES --- */
  updateTrackInfoUI(track) {
    // Mini player
    const mpCover = document.getElementById('mp-cover');
    const mpTitle = document.getElementById('mp-title');
    const mpArtist = document.getElementById('mp-artist');

    if (mpCover) mpCover.src = track.thumbnail;
    if (mpTitle) mpTitle.textContent = track.title;
    if (mpArtist) mpArtist.textContent = track.artist;

    // Fullscreen player
    const fpCover = document.getElementById('fp-cover');
    const fpTitle = document.getElementById('fp-title');
    const fpArtist = document.getElementById('fp-artist');
    const fpBackdrop = document.getElementById('fp-backdrop');

    if (fpCover) fpCover.src = track.thumbnail;
    if (fpTitle) fpTitle.textContent = track.title;
    if (fpArtist) fpArtist.textContent = track.artist;
    if (fpBackdrop) fpBackdrop.style.backgroundImage = `url('${track.thumbnail}')`;

    // Sidebar mini widget
    const sbNowPlaying = document.getElementById('sidebar-now-playing');
    const sbCover = document.getElementById('sidebar-np-cover');
    const sbTitle = document.getElementById('sidebar-np-title');
    const sbArtist = document.getElementById('sidebar-np-artist');

    if (sbNowPlaying) sbNowPlaying.style.display = 'flex';
    if (sbCover) sbCover.src = track.thumbnail;
    if (sbTitle) sbTitle.textContent = track.title;
    if (sbArtist) sbArtist.textContent = track.artist;

    // Check favorite status
    this.updateFavoriteButtonState(track.id);
  }

  async updateFavoriteButtonState(trackId) {
    if (!window.db) return;
    const isFav = await window.db.isFavorite(trackId);
    const mpFav = document.getElementById('mp-fav-btn');
    const fpFav = document.getElementById('fp-fav-btn');

    if (mpFav) mpFav.classList.toggle('active', isFav);
    if (fpFav) fpFav.classList.toggle('active', isFav);
  }

  updatePlayStateUI(isPlaying) {
    // Mini player icon
    const playPauseIcon = document.getElementById('play-pause-icon');
    if (playPauseIcon) {
      playPauseIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    }

    // Full player icon
    const fpPlayIcon = document.getElementById('fp-play-icon');
    if (fpPlayIcon) {
      fpPlayIcon.setAttribute('data-lucide', isPlaying ? 'pause' : 'play');
    }

    const fullOverlay = document.getElementById('full-player-overlay');
    if (fullOverlay) {
      fullOverlay.classList.toggle('playing', isPlaying);
    }

    // Re-render lucide icons
    if (window.lucide) window.lucide.createIcons();
  }

  updateScrubber(current, duration) {
    const percent = duration > 0 ? (current / duration) * 100 : 0;

    // Mini progress bar along top
    const miniFill = document.getElementById('mini-progress-fill');
    if (miniFill) miniFill.style.width = `${percent}%`;

    // Mini scrubber
    const seekFill = document.getElementById('seek-fill');
    const seekSlider = document.getElementById('seek-slider');
    const currTimeLabel = document.getElementById('current-time-label');
    const totalTimeLabel = document.getElementById('total-duration-label');

    if (seekFill) seekFill.style.width = `${percent}%`;
    if (seekSlider) seekSlider.value = percent;
    if (currTimeLabel) currTimeLabel.textContent = this.formatTime(current);
    if (totalTimeLabel) totalTimeLabel.textContent = this.formatTime(duration);

    // Fullscreen scrubber
    const fpSeekProgress = document.getElementById('fp-seek-progress');
    const fpSeekSlider = document.getElementById('fp-seek-slider');
    const fpCurrTime = document.getElementById('fp-curr-time');
    const fpTotalTime = document.getElementById('fp-total-time');

    if (fpSeekProgress) fpSeekProgress.style.width = `${percent}%`;
    if (fpSeekSlider) fpSeekSlider.value = percent;
    if (fpCurrTime) fpCurrTime.textContent = this.formatTime(current);
    if (fpTotalTime) fpTotalTime.textContent = this.formatTime(duration);
  }

  updateVolumeUI() {
    const volSlider = document.getElementById('volume-slider');
    const volIcon = document.getElementById('volume-icon');

    if (volSlider) volSlider.value = this.isMuted ? 0 : this.volume;

    if (volIcon) {
      if (this.isMuted || this.volume === 0) {
        volIcon.setAttribute('data-lucide', 'volume-x');
      } else if (this.volume < 0.5) {
        volIcon.setAttribute('data-lucide', 'volume-1');
      } else {
        volIcon.setAttribute('data-lucide', 'volume-2');
      }
      if (window.lucide) window.lucide.createIcons();
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  /* --- DYNAMIC COLOR EXTRACTION --- */
  extractDynamicColor(imgUrl) {
    if (!imgUrl) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imgUrl;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;

        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 30 && data[i + 1] > 30 && data[i + 2] > 30) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }
        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);

          const ambient = document.getElementById('ambient-glow');
          if (ambient) {
            ambient.style.background = `radial-gradient(circle at 30% 20%, rgba(${r}, ${g}, ${b}, 0.55) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(99, 102, 241, 0.3) 0%, transparent 50%)`;
          }
        }
      } catch (e) {
        // Fallback silently if canvas is tainted
      }
    };
  }

  /* --- SLEEP TIMER --- */
  setSleepTimer(minutes) {
    if (this.sleepTimer) clearInterval(this.sleepTimer);

    if (minutes === 'end_of_track') {
      this.sleepEndTime = 'end_of_track';
      window.showToast('Sleep Timer disetel: Berhenti di akhir lagu', 'moon');
      this.updateSleepBadge('Akhir Lagu');
      return;
    }

    const mins = parseInt(minutes, 10);
    if (mins <= 0) {
      this.cancelSleepTimer();
      return;
    }

    const targetMs = Date.now() + mins * 60 * 1000;
    this.sleepEndTime = targetMs;

    window.showToast(`Sleep Timer disetel untuk ${mins} menit`, 'moon');

    this.sleepTimer = setInterval(() => {
      const remainingMs = this.sleepEndTime - Date.now();
      if (remainingMs <= 0) {
        this.cancelSleepTimer();
        this.pause();
        window.showToast('Waktu tidur tercapai. Musik dihentikan.', 'moon');
      } else {
        const remSec = Math.floor(remainingMs / 1000);
        const m = Math.floor(remSec / 60);
        const s = remSec % 60;
        this.updateSleepBadge(`${m}:${s < 10 ? '0' : ''}${s}`);
      }
    }, 1000);
  }

  cancelSleepTimer() {
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepEndTime = null;
    const badge = document.getElementById('timer-active-badge');
    const cancelBtn = document.getElementById('cancel-sleep-timer-btn');
    if (badge) badge.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  updateSleepBadge(text) {
    const badge = document.getElementById('timer-active-badge');
    const countdown = document.getElementById('timer-countdown-text');
    const cancelBtn = document.getElementById('cancel-sleep-timer-btn');
    if (badge && countdown) {
      badge.style.display = 'flex';
      countdown.textContent = text;
    }
    if (cancelBtn) cancelBtn.style.display = 'block';
  }

  /* --- AUDIO VISUALIZER --- */
  initWebAudioContext() {
    if (this.audioCtx && this.sourceNode) return;
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) {
        return;
      }

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;

      if (!this.sourceNode && this.audio) {
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      }

      if (this.canvasCtx) {
        this.renderVisualizerFrame();
      }
    } catch (e) {
      console.warn('Web Audio API restricted or not supported:', e);
    }
  }

  renderVisualizerFrame() {
    if (!this.canvasCtx || !this.isVisualizerActive) return;

    if (!this.isPlaying) {
      const ctx = this.canvasCtx;
      ctx.clearRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
      return;
    }

    requestAnimationFrame(() => this.renderVisualizerFrame());

    const canvas = this.visualizerCanvas;
    if (canvas.width !== window.innerWidth) {
      canvas.width = window.innerWidth;
      canvas.height = 160;
    }

    const ctx = this.canvasCtx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If using HTML5 audio with AnalyserNode
    if (this.activeEngine === 'audio' && this.analyser) {
      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.analyser.getByteFrequencyData(dataArray);

      const barWidth = (canvas.width / bufferLength) * 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.7;
        ctx.fillStyle = `rgba(56, 189, 248, ${0.15 + (dataArray[i] / 255) * 0.4})`;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 3, barHeight);
        x += barWidth;
      }
    } else {
      // Dynamic simulated spectrum for YouTube IFrame Engine
      const bars = 48;
      const barWidth = canvas.width / bars;
      const time = Date.now() / 180;

      for (let i = 0; i < bars; i++) {
        const wave1 = Math.sin(time + i * 0.28);
        const wave2 = Math.cos(time * 0.6 + i * 0.15);
        const wave3 = Math.sin(time * 1.4 + i * 0.5);
        const norm = Math.abs(wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25);
        const barHeight = Math.max(8, norm * canvas.height * 0.65);

        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.7)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.2)');

        ctx.fillStyle = gradient;
        ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth - 3, barHeight);
      }
    }
  }
}

// Global YouTube Iframe API ready callback
window.onYouTubeIframeAPIReady = function() {
  if (window.audioEngine) {
    window.audioEngine.initYouTubePlayer();
  }
};

window.audioEngine = new AudioEngine();
