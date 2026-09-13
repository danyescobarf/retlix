// Backend base URL: empty when served by Express (same origin), or the Mac's
// LAN address when running as a standalone Tizen/TV app.
let _base = '';
try { _base = localStorage.getItem('retlix-server') || ''; } catch {}
export function getServerUrl() { return _base; }
export function setServerUrl(url) { _base = url; try { localStorage.setItem('retlix-server', url); } catch {} }
function u(path) { return _base + path; }

// ---- Standalone TV mode: route through apiTV when Xtream is configured ----
import { isConfigured as _xtreamConfigured } from './xtreamTV.js';
import { apiTV as _apiTV, streamUrlTV as _streamUrlTV } from './apiTV.js';

function _isDirect() { return _xtreamConfigured(); }

// When running as a standalone TV app with server, API responses contain image URLs like
// /api/image?url=... which are relative to the server. Rewrite them.
function fixUrls(obj) {
  if (!_base || _isDirect()) return obj;
  if (typeof obj === 'string') return obj.startsWith('/api/') ? _base + obj : obj;
  if (Array.isArray(obj)) return obj.map(fixUrls);
  if (obj && typeof obj === 'object') {
    var out = {};
    for (var k in obj) out[k] = fixUrls(obj[k]);
    return out;
  }
  return obj;
}

// Current UI language (set by the i18n layer) → sent to the server so it can
// return localized plot/genre via TMDB.
function lang() {
  try { return localStorage.getItem('retlix-lang') || 'it'; } catch { return 'it'; }
}

async function j(url, opts) {
  const r = await fetch(u(url), opts);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const e = await r.json(); if (e.error) msg = e.error; } catch {}
    throw new Error(msg);
  }
  const data = await r.json();
  return fixUrls(data);
}

// Server-based API
const _serverApi = {
  getProvider: () => j('/api/provider'),
  saveProvider: (body) =>
    j('/api/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  deleteProvider: () => j('/api/provider', { method: 'DELETE' }),

  home: () => j(`/api/home?lang=${lang()}`),
  categories: (type) => j(`/api/categories?type=${type}`),
  content: ({ type, category = '', search = '', sort = 'added', limit = 60, offset = 0 }) =>
    j(`/api/content?type=${type}&category=${encodeURIComponent(category)}&search=${encodeURIComponent(search)}&sort=${sort}&limit=${limit}&offset=${offset}`),
  detail: (type, id) => j(`/api/detail/${type}/${id}?lang=${lang()}`),
  epg: (id) => j(`/api/epg/${id}`),
  suggest: (q) => j(`/api/suggest?q=${encodeURIComponent(q)}`),
  search: ({ q = '', actor = '' }) =>
    j(`/api/search?${actor ? 'actor=' + encodeURIComponent(actor) : 'q=' + encodeURIComponent(q)}`),

  getProgress: () => j('/api/progress'),
  saveProgress: (body) =>
    j('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  clearProgress: (type, id) => j(`/api/progress/${type}/${id}`, { method: 'DELETE' }),
  clearAllProgress: () => j('/api/progress', { method: 'DELETE' }),
  removeContinue: (type, id) => j(`/api/continue/${type}/${id}`, { method: 'DELETE' }),

  getFavorites: () => Promise.resolve([]),
  addFavorite: () => Promise.resolve([]),
  removeFavorite: () => Promise.resolve([]),
  isFavorite: () => Promise.resolve(false),
  getSettings: () => j('/api/settings'),
  saveSettings: (body) =>
    j('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

// Route to apiTV (standalone) or server API — no Proxy (Chrome 47 doesn't support it)
var _apiRouter = {};
var _allKeys = Object.keys(_serverApi);
for (var _k in _apiTV) { if (_allKeys.indexOf(_k) < 0) _allKeys.push(_k); }
_allKeys.forEach(function(key) {
  _apiRouter[key] = function() {
    var fn = _isDirect() && _apiTV[key] ? _apiTV[key] : _serverApi[key];
    return fn.apply(null, arguments);
  };
});
export var api = _apiRouter;

export function streamUrl(type, id, ext) {
  if (_isDirect()) return _streamUrlTV(type, id, ext);
  const q = ext ? `?ext=${encodeURIComponent(ext)}` : '';
  return u(`/api/stream/${type}/${id}${q}`);
}

// On-the-fly HLS transcode (for VOD containers the browser can't demux, e.g. MKV):
// makes them play and exposes multi-audio (language switching).
const hlsVodQ = (ext) => (ext ? `?ext=${encodeURIComponent(ext)}` : '');
export function hlsVodMaster(type, id, ext, ss = 0) {
  const q = hlsVodQ(ext);
  return u(`/api/hls/vod/${type}/${id}/master.m3u8${q}${ss > 0 ? (q ? '&' : '?') + 'ss=' + Math.floor(ss) : ''}`);
}
export function hlsVodFile(type, id, file, ext) { return u(`/api/hls/vod/${type}/${id}/${file}${hlsVodQ(ext)}`); }
export function hlsVodTracks(type, id, ext) { return fetch(u(`/api/hls/vod/${type}/${id}/tracks.json${hlsVodQ(ext)}`)).then((r) => r.json()); }
export function stopHlsVod(type, id) { return fetch(u(`/api/hls/vod/${type}/${id}`), { method: 'DELETE', keepalive: true }).catch(() => {}); }
