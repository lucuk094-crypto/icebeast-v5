/**
 * IceBeats Web — Multi-Source Music API & Stream Resolver
 * Powered by YouTube Music, iTunes Search Engine, Google Suggest, and Curated Seed Catalogs.
 */

class MusicApiClient {
  constructor() {
    // List of public Piped instances for stream extraction
    this.pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.leptons.xyz',
      'https://pipedapi.r4fo.com',
      'https://api.piped.privacydev.net'
    ];
    this.currentInstanceIdx = 0;
    this.fetchTimeout = 6000;
  }

  getPipedUrl() {
    return this.pipedInstances[this.currentInstanceIdx];
  }

  nextPipedInstance() {
    this.currentInstanceIdx = (this.currentInstanceIdx + 1) % this.pipedInstances.length;
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = this.fetchTimeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  /**
   * Universal Search:
   * Combines iTunes Music Database (lightning fast, millions of songs, CORS open),
   * Curated Seed Matching, and Piped API fallback.
   */
  async search(query, filter = 'all') {
    if (!query || !query.trim()) return [];
    const qClean = query.trim().toLowerCase();

    const results = [];
    const seenTitles = new Set();

    // 1. First, check curated catalog for high-precision matches
    const seedMatches = this.fallbackSearch(qClean);
    for (const track of seedMatches) {
      const key = `${track.title.toLowerCase()}-${track.artist.toLowerCase()}`;
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        results.push(track);
      }
    }

    // 2. Fetch from iTunes Search API (extremely fast, global coverage, rich metadata)
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25`;
      const itunesRes = await this.fetchWithTimeout(itunesUrl, {}, 5000);
      if (itunesRes.ok) {
        const data = await itunesRes.json();
        const items = data.results || [];
        for (const item of items) {
          const key = `${item.trackName?.toLowerCase()}-${item.artistName?.toLowerCase()}`;
          if (!seenTitles.has(key)) {
            seenTitles.add(key);
            results.push(this.normalizeItunesTrack(item));
          }
        }
      }
    } catch (e) {
      console.warn('iTunes search failed or timed out:', e.message);
    }

    // 3. If iTunes returned results, return them
    if (results.length > 0) {
      return results;
    }

    // 4. Try Piped search instances
    for (let attempt = 0; attempt < this.pipedInstances.length; attempt++) {
      try {
        const url = `${this.getPipedUrl()}/search?q=${encodeURIComponent(query)}&filter=${filter === 'songs' ? 'music_songs' : 'all'}`;
        const response = await this.fetchWithTimeout(url, {}, 4000);
        if (response.ok) {
          const data = await response.json();
          const items = data.items || [];
          if (items.length > 0) {
            return items.map(item => this.normalizeTrack(item));
          }
        }
      } catch (err) {
        this.nextPipedInstance();
      }
    }

    // 5. Ultimate fallback: filter seed catalog
    return this.fallbackSearch(query);
  }

  /**
   * Fast autocomplete suggestions from Google/YouTube Suggest API
   */
  async getSuggestions(query) {
    if (!query || query.length < 2) return [];
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
      const res = await this.fetchWithTimeout(url, {}, 3000);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[1])) {
          return data[1].slice(0, 8);
        }
      }
    } catch (e) {
      // Fallback suggestions
    }

    return [
      query,
      `${query} official audio`,
      `${query} live`,
      `${query} acoustic`
    ];
  }

  /**
   * Resolve Direct Audio Stream URL for a track if possible
   */
  async getStreamUrl(videoId) {
    if (!videoId) return null;

    const startIdx = this.currentInstanceIdx;
    for (let attempt = 0; attempt < this.pipedInstances.length; attempt++) {
      const instanceIdx = (startIdx + attempt) % this.pipedInstances.length;
      const instance = this.pipedInstances[instanceIdx];
      try {
        const res = await this.fetchWithTimeout(`${instance}/streams/${videoId}`, {}, 4000);
        if (res.ok) {
          const data = await res.json();
          const audioStreams = data.audioStreams || [];
          if (audioStreams.length > 0) {
            audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            const bestStream = audioStreams.find(s => s.mimeType && s.mimeType.includes('audio')) || audioStreams[0];
            this.currentInstanceIdx = instanceIdx;
            return {
              audioUrl: bestStream.url,
              duration: data.duration || bestStream.duration || 0,
              title: data.title,
              artist: data.uploader,
              thumbnail: data.thumbnailUrl,
              source: 'piped-stream'
            };
          }
        }
      } catch (e) {
        // try next
      }
    }

    return {
      audioUrl: null,
      isEmbed: true,
      videoId: videoId,
      source: 'youtube'
    };
  }

  /**
   * Get Curated Home & Explore Feed per genre
   */
  async getTrendingFeed(genre = 'all') {
    const catalog = this.getCuratedSeedCatalog();
    const g = genre.toLowerCase();

    if (g === 'all') {
      return catalog;
    }

    if (g.includes('indonesian') || g.includes('pop indo')) {
      return catalog.filter(t => t.category === 'indonesian-pop' || t.genre === 'Indonesian Pop');
    }

    if (g.includes('pop hits') || g.includes('global')) {
      return catalog.filter(t => t.category === 'global-pop' || t.genre === 'Pop');
    }

    if (g.includes('lofi') || g.includes('chill')) {
      return catalog.filter(t => t.category === 'lofi' || t.genre === 'Lo-Fi');
    }

    if (g.includes('kpop')) {
      return catalog.filter(t => t.category === 'kpop' || t.genre === 'K-Pop');
    }

    if (g.includes('rock')) {
      return catalog.filter(t => t.category === 'rock' || t.genre === 'Rock');
    }

    if (g.includes('electronic') || g.includes('edm')) {
      return catalog.filter(t => t.category === 'edm' || t.genre === 'EDM');
    }

    if (g.includes('acoustic')) {
      return catalog.filter(t => t.category === 'acoustic' || t.genre === 'Acoustic');
    }

    // Default: try search or return catalog
    try {
      const results = await this.search(genre);
      if (results.length > 0) return results;
    } catch (e) {}

    return catalog;
  }

  /**
   * Normalizer for YouTube / Piped items
   */
  normalizeTrack(item) {
    const videoId = item.url ? item.url.replace('/watch?v=', '') : (item.id || item.videoId);
    return {
      id: videoId,
      videoId: videoId,
      title: item.title || 'Unknown Title',
      artist: item.uploaderName || item.artist || 'Various Artists',
      album: item.album || 'IceBeats Music',
      duration: item.duration || 180,
      durationStr: this.formatDuration(item.duration || 180),
      thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      source: 'youtube'
    };
  }

  /**
   * Normalizer for iTunes items
   */
  normalizeItunesTrack(item) {
    const id = `itunes-${item.trackId}`;
    const durationSec = Math.round((item.trackTimeMillis || 180000) / 1000);
    const hiResArt = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb') ||
      'https://raw.githubusercontent.com/B7ByteMe/IceBeats/refs/heads/main/icon2.png';

    return {
      id: id,
      itunesId: item.trackId,
      title: item.trackName || 'Unknown Title',
      artist: item.artistName || 'Various Artists',
      album: item.collectionName || 'Single',
      duration: durationSec,
      durationStr: this.formatDuration(durationSec),
      thumbnail: hiResArt,
      audioUrl: item.previewUrl,
      source: 'itunes'
    };
  }

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '3:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  /**
   * Rich Curated Seed Catalog with verified YouTube Video IDs
   */
  getCuratedSeedCatalog() {
    return [
      // Indonesian Pop & Trending
      {
        id: 'L0MK7qz13bU',
        videoId: 'L0MK7qz13bU',
        title: 'Komang',
        artist: 'Raim Laode',
        album: 'Komang - Single',
        category: 'indonesian-pop',
        genre: 'Indonesian Pop',
        duration: 222,
        durationStr: '3:42',
        thumbnail: 'https://i.ytimg.com/vi/L0MK7qz13bU/hqdefault.jpg'
      },
      {
        id: '7PCkvCPvDXk',
        videoId: '7PCkvCPvDXk',
        title: 'Sialan',
        artist: 'Juicy Luicy ft. Adrian Khalif',
        album: 'Nonfiksi',
        category: 'indonesian-pop',
        genre: 'Indonesian Pop',
        duration: 215,
        durationStr: '3:35',
        thumbnail: 'https://i.ytimg.com/vi/7PCkvCPvDXk/hqdefault.jpg'
      },
      {
        id: 'sCskK74vWvM',
        videoId: 'sCskK74vWvM',
        title: 'Tak Segampang Itu',
        artist: 'Anggi Marito',
        album: 'Tak Segampang Itu - Single',
        category: 'indonesian-pop',
        genre: 'Indonesian Pop',
        duration: 236,
        durationStr: '3:56',
        thumbnail: 'https://i.ytimg.com/vi/sCskK74vWvM/hqdefault.jpg'
      },
      {
        id: 'T1c11n0kLqA',
        videoId: 'T1c11n0kLqA',
        title: 'Gala Bunga Matahari',
        artist: 'Sal Priadi',
        album: 'Markers and Such Pens Flashdisks',
        category: 'indonesian-pop',
        genre: 'Indonesian Pop',
        duration: 238,
        durationStr: '3:58',
        thumbnail: 'https://i.ytimg.com/vi/T1c11n0kLqA/hqdefault.jpg'
      },
      {
        id: '87Uv3_37VfU',
        videoId: '87Uv3_37VfU',
        title: 'Penjaga Hati',
        artist: 'Nadhif Basalamah',
        album: 'Penjaga Hati - Single',
        category: 'indonesian-pop',
        genre: 'Indonesian Pop',
        duration: 260,
        durationStr: '4:20',
        thumbnail: 'https://i.ytimg.com/vi/87Uv3_37VfU/hqdefault.jpg'
      },
      {
        id: 'a7x9f5wDq9g',
        videoId: 'a7x9f5wDq9g',
        title: 'Nanti Kita Seperti Ini',
        artist: 'Batas Senja',
        album: 'Nanti Kita Seperti Ini',
        category: 'indonesian-pop',
        genre: 'Indonesian Pop',
        duration: 233,
        durationStr: '3:53',
        thumbnail: 'https://i.ytimg.com/vi/a7x9f5wDq9g/hqdefault.jpg'
      },
      {
        id: 'Q6Z0X3XQ70g',
        videoId: 'Q6Z0X3XQ70g',
        title: 'Rayuan Perempuan Gila',
        artist: 'Nadin Amizah',
        album: 'Untuk Dunia, Cinta, dan Kotornya',
        category: 'indonesian-pop',
        genre: 'Indonesian Pop',
        duration: 320,
        durationStr: '5:20',
        thumbnail: 'https://i.ytimg.com/vi/Q6Z0X3XQ70g/hqdefault.jpg'
      },

      // Global Pop Hits
      {
        id: 'kPa7bsKwL-c',
        videoId: 'kPa7bsKwL-c',
        title: 'Die With A Smile',
        artist: 'Lady Gaga & Bruno Mars',
        album: 'Die With A Smile - Single',
        category: 'global-pop',
        genre: 'Pop',
        duration: 251,
        durationStr: '4:11',
        thumbnail: 'https://i.ytimg.com/vi/kPa7bsKwL-c/hqdefault.jpg'
      },
      {
        id: 'JGwWNGJdvx8',
        videoId: 'JGwWNGJdvx8',
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        album: '÷ (Divide)',
        category: 'global-pop',
        genre: 'Pop',
        duration: 233,
        durationStr: '3:53',
        thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg'
      },
      {
        id: 'kJQP7kiw5Fk',
        videoId: 'kJQP7kiw5Fk',
        title: 'Despacito',
        artist: 'Luis Fonsi ft. Daddy Yankee',
        album: 'Vida',
        category: 'global-pop',
        genre: 'Pop',
        duration: 228,
        durationStr: '3:48',
        thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg'
      },
      {
        id: '4NRXx6U8ABQ',
        videoId: '4NRXx6U8ABQ',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        category: 'global-pop',
        genre: 'Pop',
        duration: 200,
        durationStr: '3:20',
        thumbnail: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg'
      },
      {
        id: 'H5v3kku4y6Q',
        videoId: 'H5v3kku4y6Q',
        title: 'As It Was',
        artist: 'Harry Styles',
        album: "Harry's House",
        category: 'global-pop',
        genre: 'Pop',
        duration: 167,
        durationStr: '2:47',
        thumbnail: 'https://i.ytimg.com/vi/H5v3kku4y6Q/hqdefault.jpg'
      },
      {
        id: 'G7KNmW9a75Y',
        videoId: 'G7KNmW9a75Y',
        title: 'Flowers',
        artist: 'Miley Cyrus',
        album: 'Endless Summer Vacation',
        category: 'global-pop',
        genre: 'Pop',
        duration: 200,
        durationStr: '3:20',
        thumbnail: 'https://i.ytimg.com/vi/G7KNmW9a75Y/hqdefault.jpg'
      },
      {
        id: 'kTJczUoc56U',
        videoId: 'kTJczUoc56U',
        title: 'Stay',
        artist: 'The Kid LAROI & Justin Bieber',
        album: 'F*CK LOVE 3: OVERKILL',
        category: 'global-pop',
        genre: 'Pop',
        duration: 141,
        durationStr: '2:21',
        thumbnail: 'https://i.ytimg.com/vi/kTJczUoc56U/hqdefault.jpg'
      },
      {
        id: '09R8_2nJtjg',
        videoId: '09R8_2nJtjg',
        title: 'Sugar',
        artist: 'Maroon 5',
        album: 'V',
        category: 'global-pop',
        genre: 'Pop',
        duration: 235,
        durationStr: '3:55',
        thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg'
      },
      {
        id: 'OPf0YbXqDm0',
        videoId: 'OPf0YbXqDm0',
        title: 'Uptown Funk',
        artist: 'Mark Ronson ft. Bruno Mars',
        album: 'Uptown Special',
        category: 'global-pop',
        genre: 'Pop',
        duration: 270,
        durationStr: '4:30',
        thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg'
      },

      // K-Pop Trends
      {
        id: 'ekr2nIex040',
        videoId: 'ekr2nIex040',
        title: 'APT.',
        artist: 'ROSE & Bruno Mars',
        album: 'rosie',
        category: 'kpop',
        genre: 'K-Pop',
        duration: 173,
        durationStr: '2:53',
        thumbnail: 'https://i.ytimg.com/vi/ekr2nIex040/hqdefault.jpg'
      },
      {
        id: 'QU9c0053UAU',
        videoId: 'QU9c0053UAU',
        title: 'Seven',
        artist: 'Jung Kook ft. Latto',
        album: 'Golden',
        category: 'kpop',
        genre: 'K-Pop',
        duration: 184,
        durationStr: '3:04',
        thumbnail: 'https://i.ytimg.com/vi/QU9c0053UAU/hqdefault.jpg'
      },
      {
        id: 'Vk5-c_v4gMU',
        videoId: 'Vk5-c_v4gMU',
        title: 'Magnetic',
        artist: 'ILLIT',
        album: 'SUPER REAL ME',
        category: 'kpop',
        genre: 'K-Pop',
        duration: 160,
        durationStr: '2:40',
        thumbnail: 'https://i.ytimg.com/vi/Vk5-c_v4gMU/hqdefault.jpg'
      },

      // Lo-Fi & Chill Vibes
      {
        id: 'jfKfPfyJRdk',
        videoId: 'jfKfPfyJRdk',
        title: 'Lofi Hip Hop Radio - Beats to Relax/Study to',
        artist: 'Lofi Girl',
        album: 'Chill Beats 24/7',
        category: 'lofi',
        genre: 'Lo-Fi',
        duration: 240,
        durationStr: '4:00',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg'
      },
      {
        id: '5yx6BWlEVcY',
        videoId: '5yx6BWlEVcY',
        title: 'Chillhop Essentials - Autumn Beats',
        artist: 'Chillhop Music',
        album: 'Chillhop Essentials',
        category: 'lofi',
        genre: 'Lo-Fi',
        duration: 260,
        durationStr: '4:20',
        thumbnail: 'https://i.ytimg.com/vi/5yx6BWlEVcY/hqdefault.jpg'
      },

      // Rock & Legendary Classics
      {
        id: 'fJ9rUzIMcZQ',
        videoId: 'fJ9rUzIMcZQ',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
        category: 'rock',
        genre: 'Rock',
        duration: 359,
        durationStr: '5:59',
        thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg'
      },
      {
        id: 'eVTXPUF4Oz4',
        videoId: 'eVTXPUF4Oz4',
        title: 'In The End',
        artist: 'Linkin Park',
        album: 'Hybrid Theory',
        category: 'rock',
        genre: 'Rock',
        duration: 216,
        durationStr: '3:36',
        thumbnail: 'https://i.ytimg.com/vi/eVTXPUF4Oz4/hqdefault.jpg'
      },
      {
        id: '1w7OgIMMRc4',
        videoId: '1w7OgIMMRc4',
        title: "Sweet Child O' Mine",
        artist: "Guns N' Roses",
        album: 'Appetite For Destruction',
        category: 'rock',
        genre: 'Rock',
        duration: 302,
        durationStr: '5:02',
        thumbnail: 'https://i.ytimg.com/vi/1w7OgIMMRc4/hqdefault.jpg'
      },

      // EDM & Party Beats
      {
        id: 'YykjpeuMNEk',
        videoId: 'YykjpeuMNEk',
        title: 'Faded',
        artist: 'Alan Walker',
        album: 'Different World',
        category: 'edm',
        genre: 'EDM',
        duration: 212,
        durationStr: '3:32',
        thumbnail: 'https://i.ytimg.com/vi/YykjpeuMNEk/hqdefault.jpg'
      },
      {
        id: '2zToEPp4ghI',
        videoId: '2zToEPp4ghI',
        title: 'Wake Me Up',
        artist: 'Avicii',
        album: 'True',
        category: 'edm',
        genre: 'EDM',
        duration: 247,
        durationStr: '4:07',
        thumbnail: 'https://i.ytimg.com/vi/2zToEPp4ghI/hqdefault.jpg'
      }
    ];
  }

  fallbackSearch(query) {
    const catalog = this.getCuratedSeedCatalog();
    const q = (query || '').toLowerCase().trim();
    if (!q) return catalog;
    return catalog.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      (t.album && t.album.toLowerCase().includes(q)) ||
      (t.genre && t.genre.toLowerCase().includes(q))
    );
  }
}

window.musicApi = new MusicApiClient();
