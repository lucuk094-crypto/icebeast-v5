/**
 * IceBeats Web — Queue & Playback List Manager
 * Handles Track Sequencing, Shuffle, Repeat One/All, and Dynamic Queue Reordering.
 */

class QueueManager {
  constructor() {
    this.queue = [];
    this.originalQueue = [];
    this.currentIndex = -1;
    this.isShuffle = false;
    this.repeatMode = 'all'; // 'none' | 'all' | 'one'
    this.listeners = [];
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      cb({
        queue: this.queue,
        currentTrack: this.getCurrentTrack(),
        currentIndex: this.currentIndex,
        isShuffle: this.isShuffle,
        repeatMode: this.repeatMode
      });
    }
  }

  getCurrentTrack() {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  setQueue(tracks, startIndex = 0) {
    this.originalQueue = [...tracks];
    if (this.isShuffle) {
      const selected = tracks[startIndex];
      const rest = tracks.filter((_, i) => i !== startIndex);
      this.shuffleArray(rest);
      this.queue = [selected, ...rest];
      this.currentIndex = 0;
    } else {
      this.queue = [...tracks];
      this.currentIndex = Math.max(0, Math.min(startIndex, this.queue.length - 1));
    }
    this.notify();
    return this.getCurrentTrack();
  }

  addToQueue(track) {
    this.queue.push(track);
    this.originalQueue.push(track);
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
    }
    this.notify();
  }

  playNext(track) {
    if (this.currentIndex === -1) {
      this.queue = [track];
      this.currentIndex = 0;
    } else {
      this.queue.splice(this.currentIndex + 1, 0, track);
    }
    this.notify();
  }

  removeAt(index) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex && index >= this.queue.length) {
      this.currentIndex = this.queue.length - 1;
    }
    this.notify();
  }

  clearQueue() {
    const current = this.getCurrentTrack();
    this.queue = current ? [current] : [];
    this.originalQueue = current ? [current] : [];
    this.currentIndex = current ? 0 : -1;
    this.notify();
  }

  getNextTrack() {
    if (this.queue.length === 0) return null;

    if (this.repeatMode === 'one') {
      return this.getCurrentTrack();
    }

    if (this.currentIndex + 1 < this.queue.length) {
      this.currentIndex++;
      this.notify();
      return this.getCurrentTrack();
    }

    if (this.repeatMode === 'all') {
      this.currentIndex = 0;
      this.notify();
      return this.getCurrentTrack();
    }

    return null;
  }

  getPreviousTrack() {
    if (this.queue.length === 0) return null;

    if (this.currentIndex - 1 >= 0) {
      this.currentIndex--;
      this.notify();
      return this.getCurrentTrack();
    }

    if (this.repeatMode === 'all') {
      this.currentIndex = this.queue.length - 1;
      this.notify();
      return this.getCurrentTrack();
    }

    return this.getCurrentTrack();
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    const current = this.getCurrentTrack();

    if (this.isShuffle) {
      const rest = this.queue.filter((_, i) => i !== this.currentIndex);
      this.shuffleArray(rest);
      this.queue = current ? [current, ...rest] : rest;
      this.currentIndex = 0;
    } else {
      this.queue = [...this.originalQueue];
      if (current) {
        this.currentIndex = this.queue.findIndex(t => t.id === current.id);
        if (this.currentIndex === -1) this.currentIndex = 0;
      }
    }
    this.notify();
    return this.isShuffle;
  }

  toggleRepeat() {
    if (this.repeatMode === 'all') {
      this.repeatMode = 'one';
    } else if (this.repeatMode === 'one') {
      this.repeatMode = 'none';
    } else {
      this.repeatMode = 'all';
    }
    this.notify();
    return this.repeatMode;
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }
}

window.queue = new QueueManager();
