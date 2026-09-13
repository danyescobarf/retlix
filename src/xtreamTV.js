// Xtream Codes client for Samsung TV — runs entirely in the browser.
// No server proxy needed. Connects directly to the IPTV provider.

var _provider = null;
try {
  var saved = localStorage.getItem('retflix-provider');
  if (saved) _provider = JSON.parse(saved);
} catch(e) {}

export function getProvider() { return _provider; }
export function isConfigured() { return !!(_provider && _provider.url && _provider.username && _provider.password); }

export function saveProvider(url, username, password) {
  var base = (url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) base = 'http://' + base;
  _provider = { url: base, username: username.trim(), password: password.trim() };
  try { localStorage.setItem('retflix-provider', JSON.stringify(_provider)); } catch(e) {}
  return _provider;
}

export function clearProvider() {
  _provider = null;
  try { localStorage.removeItem('retflix-provider'); } catch(e) {}
}

function apiUrl(action) {
  if (!_provider) return '';
  var auth = 'username=' + encodeURIComponent(_provider.username) + '&password=' + encodeURIComponent(_provider.password);
  if (!action) return _provider.url + '/player_api.php?' + auth;
  return _provider.url + '/player_api.php?' + auth + '&action=' + action;
}

function fetchJson(url) {
  return fetch(url).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

// API calls — same as Xtream Codes API
export var xtreamApi = {
  info: function() { return fetchJson(apiUrl()); },
  liveCategories: function() { return fetchJson(apiUrl('get_live_categories')); },
  vodCategories: function() { return fetchJson(apiUrl('get_vod_categories')); },
  seriesCategories: function() { return fetchJson(apiUrl('get_series_categories')); },
  liveStreams: function() { return fetchJson(apiUrl('get_live_streams')); },
  vodStreams: function() { return fetchJson(apiUrl('get_vod_streams')); },
  series: function() { return fetchJson(apiUrl('get_series')); },
  vodInfo: function(id) { return fetchJson(apiUrl('get_vod_info') + '&vod_id=' + id); },
  seriesInfo: function(id) { return fetchJson(apiUrl('get_series_info') + '&series_id=' + id); },
};

// Direct stream URLs — no proxy, TV plays these directly
export function liveUrl(id) {
  if (!_provider) return '';
  return _provider.url + '/live/' + _provider.username + '/' + _provider.password + '/' + id + '.m3u8';
}

export function movieUrl(id, ext) {
  if (!_provider) return '';
  return _provider.url + '/movie/' + _provider.username + '/' + _provider.password + '/' + id + '.' + (ext || 'mp4');
}

export function seriesUrl(id, ext) {
  if (!_provider) return '';
  return _provider.url + '/series/' + _provider.username + '/' + _provider.password + '/' + id + '.' + (ext || 'mp4');
}

// Image proxy — provider images are direct URLs, no caching needed
export function imageUrl(url) {
  return url || '';
}
