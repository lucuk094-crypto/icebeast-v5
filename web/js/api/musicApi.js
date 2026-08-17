/**
 * IceBeats Web — YouTube Music API & Stream Resolver
 * Handles Search, Trending Charts, Metadata, and Direct Audio Streams.
 */

class MusicApiClient {
  constructor() {
    // List of high-reliability Piped & Invidious public API instances for audio stream extraction
    this.pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://api.piped.privacydev.net',
      'https://pipedapi.leptons.xyz',
      'https://pipedapi.r4fo.com'
    ];
    this.currentInstanceIdx = 0;
  }

  getPipedUrl() {
    return this.pipedInstances[this.currentInstanceIdx];
  }

  nextPipedInstance() {
    this.currentInstanceIdx = (this.currentInstanceIdx + 1) % this.pipedInstances.length;
  }

  /**
   * Search songs, artists, albums, or playlists
   */
  async search(query, filter = 'all') {
    if (!query || !query.trim()) return [];

    try {
      const url = `${this.getPipedUrl()}/search?q=${encodeURIComponent(query)}&filter=${filter === 'songs' ? 'music_songs' : 'all'}`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Search failed');
      const data = await response.json();
      
      const items = data.items || [];
      return items.map(item => this.normalizeTrack(item));
    } catch (err) {
      console.warn('Piped search error, fallbacking to YouTube suggestion endpoint...', err);
      return this.fallbackSearch(query);
    }
  }

  /**
   * Quick search suggestions / autocomplete
   */
  async getSuggestions(query) {
    if (!query || query.length < 2) return [];
    try {
      const url = `${this.getPipedUrl()}/suggestions?query=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Fallback
    }
    return [
      query,
      `${query} live`,
      `${query} official audio`,
      `${query} acoustic`
    ];
  }

  /**
   * Resolve Direct Audio Stream URL for a track
   * Returns: { audioUrl, duration, title, artist, thumbnail }
   */
  async getStreamUrl(videoId) {
    if (!videoId) return null;

    // Try through Piped instances
    for (let attempt = 0; attempt < this.pipedInstances.length; attempt++) {
      try {
        const instance = this.getPipedUrl();
        const res = await fetch(`${instance}/streams/${videoId}`);
        if (res.ok) {
          const data = await res.json();
          const audioStreams = data.audioStreams || [];
          
          // Pick best quality audio stream (m4a / opus)
          if (audioStreams.length > 0) {
            // Sort by bitrate descending
            audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            const bestStream = audioStreams[0];

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
        this.nextPipedInstance();
      }
    }

    // Secondary Fallback: YouTube Audio Stream Embed Bridge
    return {
      audioUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`,
      isEmbed: true,
      videoId: videoId,
      source: 'youtube-embed'
    };
  }

  /**
   * Get Trending / Top Charts & Curated Home Feed
   */
  async getTrendingFeed(genre = 'all') {
    try {
      const queryMap = {
        'all': 'Top Hits Indonesia Global 2025',
        'indonesian pop': 'Lagu Pop Indonesia Terbaru Hits',
        'pop hits 2025': 'Billboard Hot 100 Hits 2025',
        'lofi hip hop chill': 'Lofi Hip Hop beats to relax study to',
        'kpop trends': 'K-Pop Top Hits Trending',
        'rock classic hits': 'Best Rock Hits Of All Time',
        'electronic dance edm': 'EDM Festival Party Hits',
        'acoustic relaxing': 'Acoustic Pop Relaxing Songs',
        'gaming music no copyright': 'NoCopyrightSounds Gaming Bass'
      };

      const query = queryMap[genre] || 'Top Music Hits 2025';
      const tracks = await this.search(query, 'songs');
      
      if (tracks.length > 0) return tracks;
    } catch (e) {
      console.warn('Live trending feed unavailable, loading curated seed catalog...', e);
    }

    return this.getCuratedSeedCatalog();
  }

  /**
   * Normalizer to uniform track object structure
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
      views: item.views || 0
    };
  }

  formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '3:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  /**
   * High-quality Seed Catalog when offline or during instant initial load
   */
  getCuratedSeedCatalog() {
    return [
      {
        id: 'kJQP7kiw5Fk',
        videoId: 'kJQP7kiw5Fk',
        title: 'Despacito',
        artist: 'Luis Fonsi ft. Daddy Yankee',
        album: 'Vida',
        duration: 228,
        durationStr: '3:48',
        thumbnail: 'https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg'
      },
      {
        id: 'JGwWNGJdvx8',
        videoId: 'JGwWNGJdvx8',
        title: 'Shape of You',
        artist: 'Ed Sheeran',
        album: '÷ (Divide)',
        duration: 233,
        durationStr: '3:53',
        thumbnail: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg'
      },
      {
        id: 'fJ9rUzIMcZQ',
        videoId: 'fJ9rUzIMcZQ',
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
        duration: 359,
        durationStr: '5:59',
        thumbnail: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg'
      },
      {
        id: '09R8_2nJtjg',
        videoId: '09R8_2nJtjg',
        title: 'Sugar',
        artist: 'Maroon 5',
        album: 'V',
        duration: 235,
        durationStr: '3:55',
        thumbnail: 'https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg'
      },
      {
        id: 'hT_nvWreIhg',
        videoId: 'hT_nvWreIhg',
        title: 'Counting Stars',
        artist: 'OneRepublic',
        album: 'Native',
        duration: 257,
        durationStr: '4:17',
        thumbnail: 'https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg'
      },
      {
        id: 'OPf0YbXqDm0',
        videoId: 'OPf0YbXqDm0',
        title: 'Uptown Funk',
        artist: 'Mark Ronson ft. Bruno Mars',
        album: 'Uptown Special',
        duration: 270,
        durationStr: '4:30',
        thumbnail: 'https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg'
      },
      {
        id: '7PCkvCPvDXk',
        videoId: '7PCkvCPvDXk',
        title: 'Sialan',
        artist: 'Juicy Luicy ft. Adrian Khalif',
        album: 'Nonfiksi',
        duration: 215,
        durationStr: '3:35',
        thumbnail: 'https://i.ytimg.com/vi/7PCkvCPvDXk/hqdefault.jpg'
      },
      {
        id: 'L0MK7qz13bU',
        videoId: 'L0MK7qz13bU',
        title: 'Komang',
        artist: 'Raim Laode',
        album: 'Komang Single',
        duration: 222,
        durationStr: '3:42',
        thumbnail: 'https://i.ytimg.com/vi/L0MK7qz13bU/hqdefault.jpg'
      }
    ];
  }

  fallbackSearch(query) {
    const catalog = this.getCuratedSeedCatalog();
    const q = query.toLowerCase();
    return catalog.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  }
}

window.musicApi = new MusicApiClient();
