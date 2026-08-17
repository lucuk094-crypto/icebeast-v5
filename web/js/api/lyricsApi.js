/**
 * IceBeats Web — Live Karaoke Lyrics API Client (LRCLIB Integration)
 * Fetches time-synced lyrics with millisecond precision.
 */

class LyricsApiClient {
  constructor() {
    this.baseUrl = 'https://lrclib.net/api';
  }

  /**
   * Fetch synced lyrics for a song
   * @param {string} title Song title
   * @param {string} artist Artist name
   * @param {number} duration Duration in seconds
   * @param {string} album Album name (optional)
   */
  async getLyrics(title, artist, duration = 0, album = '') {
    try {
      // Clean query strings (remove "(Official Music Video)", "ft.", etc. for better search accuracy)
      const cleanTitle = this.cleanSongTitle(title);
      const cleanArtist = this.cleanArtistName(artist);

      // 1. Try exact match
      const params = new URLSearchParams({
        track_name: cleanTitle,
        artist_name: cleanArtist,
      });
      if (album) params.append('album_name', album);
      if (duration > 0) params.append('duration', Math.round(duration).toString());

      try {
        const exactRes = await fetch(`${this.baseUrl}/get?${params.toString()}`);
        if (exactRes.ok) {
          const data = await exactRes.json();
          if (data.syncedLyrics) {
            return {
              synced: true,
              lines: this.parseLRC(data.syncedLyrics),
              raw: data.syncedLyrics,
              provider: 'LRCLIB (Exact Match)'
            };
          } else if (data.plainLyrics) {
            return {
              synced: false,
              plain: data.plainLyrics,
              provider: 'LRCLIB (Plain Text)'
            };
          }
        }
      } catch (e) {
        console.warn('LRCLIB exact lookup failed, attempting search...', e);
      }

      // 2. Fallback to search query
      const searchParams = new URLSearchParams({
        q: `${cleanTitle} ${cleanArtist}`
      });

      const searchRes = await fetch(`${this.baseUrl}/search?${searchParams.toString()}`);
      if (searchRes.ok) {
        const results = await searchRes.json();
        if (Array.isArray(results) && results.length > 0) {
          // Find best candidate with synced lyrics
          const syncedItem = results.find(r => r.syncedLyrics) || results[0];
          if (syncedItem && syncedItem.syncedLyrics) {
            return {
              synced: true,
              lines: this.parseLRC(syncedItem.syncedLyrics),
              raw: syncedItem.syncedLyrics,
              provider: 'LRCLIB Synced'
            };
          } else if (syncedItem && syncedItem.plainLyrics) {
            return {
              synced: false,
              plain: syncedItem.plainLyrics,
              provider: 'LRCLIB Plain'
            };
          }
        }
      }

      return {
        synced: false,
        plain: 'Lirik belum tersedia untuk lagu ini.',
        provider: 'IceBeats Fallback'
      };
    } catch (err) {
      console.error('Error fetching lyrics:', err);
      return {
        synced: false,
        plain: 'Gagal memuat lirik secara online.',
        provider: 'Error'
      };
    }
  }

  /**
   * Parse standard LRC format string into timestamped array
   * Example: [01:23.45] Hello world -> { time: 83.45, text: "Hello world" }
   */
  parseLRC(lrcText) {
    if (!lrcText) return [];
    const lines = lrcText.split('\n');
    const result = [];
    const timeExp = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\]/g;

    for (const line of lines) {
      const match = timeExp.exec(line);
      if (match) {
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const msStr = match[3] || '0';
        const ms = msStr.length === 2 ? parseInt(msStr, 10) / 100 : parseInt(msStr, 10) / 1000;
        const totalSeconds = min * 60 + sec + ms;
        const text = line.replace(/\[\d{2}:\d{2}\.?\d{0,3}?\]/g, '').trim();

        if (text) {
          result.push({
            time: totalSeconds,
            text: text
          });
        }
      }
      timeExp.lastIndex = 0;
    }

    return result.sort((a, b) => a.time - b.time);
  }

  cleanSongTitle(title) {
    if (!title) return '';
    return title
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/official\s*(music)?\s*video/gi, '')
      .replace(/lyrics\s*video/gi, '')
      .replace(/audio/gi, '')
      .replace(/ft\..*|feat\..*/gi, '')
      .replace(/\|\s*.*$/g, '')
      .trim();
  }

  cleanArtistName(artist) {
    if (!artist) return '';
    return artist
      .replace(/ - Topic/gi, '')
      .replace(/VEVO/gi, '')
      .trim();
  }
}

window.lyricsApi = new LyricsApiClient();
