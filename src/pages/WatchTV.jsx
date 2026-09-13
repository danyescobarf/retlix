import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, streamUrl, hlsVodMaster, hlsVodTracks, getServerUrl } from '../api.js';
import { isConfigured as xtreamConfigured, liveUrl as xtreamLive, movieUrl as xtreamMovie, seriesUrl as xtreamSeries } from '../xtreamTV.js';
import { useI18n } from '../i18n.js';
import Icon from '../components/Icons.jsx';

function fmt(t) {
  if (!t || isNaN(t) || !isFinite(t)) return '0:00';
  t = Math.floor(t);
  var h = Math.floor(t / 3600);
  var m = Math.floor((t % 3600) / 60);
  var s = t % 60;
  return h > 0
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
    : m + ':' + String(s).padStart(2, '0');
}

export default function WatchTV() {
  var { t } = useI18n();
  var { type, id } = useParams();
  var [params] = useSearchParams();
  var navigate = useNavigate();

  var videoRef = useRef(null);
  var containerRef = useRef(null);
  var hideTimer = useRef(null);
  var layerRef = useRef('center');
  var baseOffsetRef = useRef(0); // which player layer has focus: 'top' | 'center' | 'bottom'

  var [detail, setDetail] = useState(null);
  var [seasons, setSeasons] = useState(null);
  var [flat, setFlat] = useState([]);
  var [current, setCurrent] = useState(0);

  var [playing, setPlaying] = useState(false);
  var [time, setTime] = useState(0);
  var [duration, setDuration] = useState(0);
  var [showUI, setShowUI] = useState(true);
  var [status, setStatus] = useState('Caricamento…');
  var [error, setError] = useState('');

  var isSeries = type === 'series';
  var isLive = type === 'live';

  // Load content details
  useEffect(function() {
    var alive = true;
    api.detail(isSeries ? 'series' : type, id).then(function(d) {
      if (!alive) return;
      setDetail(d);
      if (d.seasons) {
        setSeasons(d.seasons);
        var keys = Object.keys(d.seasons).sort(function(a, b) { return Number(a) - Number(b); });
        var list = [];
        keys.forEach(function(k) {
          (d.seasons[k] || []).forEach(function(ep, idx) {
            list.push({ season: k, idxInSeason: idx, ep: ep });
          });
        });
        setFlat(list);
        var qs = params.get('s');
        var qei = parseInt(params.get('ei'), 10);
        var start = 0;
        if (qs != null && !isNaN(qei)) {
          var found = -1;
          for (var i = 0; i < list.length; i++) {
            if (list[i].season === qs && list[i].idxInSeason === qei) { found = i; break; }
          }
          if (found >= 0) start = found;
        }
        setCurrent(start);
      }
    }).catch(function() { setError('Impossibile caricare questo titolo.'); });
    return function() { alive = false; };
  }, [type, id]);

  // Resolve source
  var source = useMemo(function() {
    if (isLive) return { streamType: 'live', streamId: id, ext: 'ts', title: (detail && detail.name) || '' };
    if (type === 'movie') {
      if (!detail) return null;
      return { streamType: 'movie', streamId: id, ext: detail.container_extension || 'mp4', title: detail.name };
    }
    if (!flat.length) return null;
    var node = flat[current];
    if (!node) return null;
    var ep = node.ep;
    return {
      streamType: 'series', streamId: ep.id,
      ext: ep.container_extension || 'mp4',
      title: (detail && detail.name || '') + '  ·  S' + node.season + ':E' + ep.episode_num,
      seriesId: id, season: node.season, epIndex: node.idxInSeason,
    };
  }, [isLive, type, id, detail, flat, current]);

  var sourceKey = source ? source.streamType + ':' + source.streamId : null;

  // Play video — always use HLS transcode for VOD on Samsung TV (seek works reliably)
  useEffect(function() {
    var video = videoRef.current;
    if (!video || !source) return;
    setError('');
    setStatus('Caricamento…');

    function startPlayback(resumePos) {
      var url;
      var directMode = xtreamConfigured();

      if (isLive) {
        url = directMode ? xtreamLive(source.streamId) : (getServerUrl() + '/api/hls/live/' + source.streamId);
        baseOffsetRef.current = 0;
      } else if (directMode) {
        // Direct from provider — TV plays MP4/HLS natively, seek works
        if (source.streamType === 'movie') {
          url = xtreamMovie(source.streamId, source.ext);
        } else {
          url = xtreamSeries(source.streamId, source.ext);
        }
        baseOffsetRef.current = 0;
      } else {
        // Via server HLS transcode
        baseOffsetRef.current = resumePos || 0;
        url = hlsVodMaster(source.streamType, source.streamId, source.ext, resumePos || 0);
      }

      video.src = url;
      video.load();

      // Direct mode: seek to saved position after metadata loads
      if (directMode && !isLive && resumePos > 5) {
        var onMeta = function() {
          video.removeEventListener('loadedmetadata', onMeta);
          video.currentTime = resumePos;
        };
        video.addEventListener('loadedmetadata', onMeta);
      }
    }

    var onCanPlay = function() {
      setStatus('');
      video.play().catch(function() {});
    };
    var onError = function() {
      setError('Impossibile riprodurre questo contenuto.');
    };

    // Load saved position then start
    if (!isLive) {
      api.getProgress().then(function(rows) {
        var resumePos = 0;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].key === source.streamType + ':' + source.streamId) {
            if (rows[i].position > 5) resumePos = Math.floor(rows[i].position);
            break;
          }
        }
        startPlayback(resumePos);
      }).catch(function() { startPlayback(0); });
    } else {
      startPlayback(0);
    }

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    // Stall watchdog
    var stallTime = 0;
    var stallTicks = 0;
    var retries = 0;
    var maxRetries = isLive ? 9999 : 10;
    var watchdog = setInterval(function() {
      if (video.paused || video.ended) { stallTime = video.currentTime; stallTicks = 0; return; }
      if (video.currentTime > stallTime + 0.05) { stallTime = video.currentTime; stallTicks = 0; retries = 0; return; }
      stallTicks++;
      if (stallTicks < 6) return;
      stallTicks = 0;
      if (retries >= maxRetries) { setError('Connessione persa.'); return; }
      retries++;
      setStatus('Riconnessione…');
      var pos = video.currentTime || 0;
      video.src = url;
      video.load();
      if (pos > 5) {
        var onSeek = function() { video.removeEventListener('loadedmetadata', onSeek); video.currentTime = pos; video.play().catch(function(){}); };
        video.addEventListener('loadedmetadata', onSeek);
      }
    }, 1000);

    // Save progress every 10s
    var saver = setInterval(function() {
      if (isLive || !video.duration || isNaN(video.duration)) return;
      api.saveProgress({
        type: source.streamType, id: source.streamId,
        position: baseOffsetRef.current + video.currentTime, duration: video.duration,
        parent: source.seriesId, season: source.season, ep_index: source.epIndex,
      }).catch(function() {});
    }, 10000);

    // Save progress on exit
    function saveNow() {
      if (isLive || !video.duration || isNaN(video.duration)) return;
      api.saveProgress({
        type: source.streamType, id: source.streamId,
        position: baseOffsetRef.current + video.currentTime, duration: video.duration,
        parent: source.seriesId, season: source.season, ep_index: source.epIndex,
      }).catch(function() {});
    }

    return function() {
      saveNow();
      clearInterval(saver);
      clearInterval(watchdog);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      try { video.load(); } catch(e) {}
    };
  }, [sourceKey]);

  // Media events
  useEffect(function() {
    var v = videoRef.current;
    if (!v) return;
    var onTime = function() { setTime(baseOffsetRef.current + v.currentTime); };
    var onDur = function() { setDuration(v.duration || 0); }; // HLS duration grows, but OK for progress bar
    var onPlay = function() { setPlaying(true); setStatus(''); };
    var onPause = function() { setPlaying(false); };
    var onEnded = function() {
      if (isSeries && current < flat.length - 1) setCurrent(function(c) { return c + 1; });
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return function() {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
    };
  }, [isSeries, current, flat.length]);

  // Controls
  var togglePlay = useCallback(function() {
    var v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(function() {}); else v.pause();
  }, []);

  var skip = useCallback(function(s) {
    var v = videoRef.current;
    if (!v || !source) return;
    if (isLive) return;

    if (xtreamConfigured()) {
      // Direct mode: native seek works on MP4 from provider
      var newTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + s));
      v.currentTime = newTime;
      setTime(newTime);
    } else {
      // HLS transcode: restart from new absolute position
      var absTime = baseOffsetRef.current + (v.currentTime || 0) + s;
      absTime = Math.max(0, absTime);
      setStatus('Caricamento…');
      setTime(absTime);
      baseOffsetRef.current = Math.floor(absTime);
      var newUrl = hlsVodMaster(source.streamType, source.streamId, source.ext, Math.floor(absTime));
      v.src = newUrl;
      v.load();
    }
  }, [source, isLive]);

  var goBack = function() { navigate(-1); };
  var nextEp = function() { if (isSeries && current < flat.length - 1) setCurrent(current + 1); };
  var prevEp = function() { if (isSeries && current > 0) setCurrent(current - 1); };

  // Auto-hide UI
  var poke = useCallback(function() {
    setShowUI(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(function() {
      var v = videoRef.current;
      if (v && !v.paused) setShowUI(false);
    }, 5000);
  }, []);

  // Helper: focus a button within a player layer
  function focusLayer(layerName) {
    layerRef.current = layerName;
    var container = containerRef.current;
    if (!container) return;
    var layer = container.querySelector('[data-player-layer="' + layerName + '"]');
    if (!layer) return;
    var btns = layer.querySelectorAll('[data-focusable]');
    if (!btns.length) return;
    // Prefer the play button in center, first button otherwise
    var target = null;
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].className && btns[i].className.indexOf('play') >= 0) { target = btns[i]; break; }
    }
    if (!target) target = btns[0];
    if (target) target.focus();
  }

  // Helper: find next/prev focusable within a layer
  function moveFocusInLayer(dir) {
    var container = containerRef.current;
    if (!container) return false;
    var layer = container.querySelector('[data-player-layer="' + layerRef.current + '"]');
    if (!layer) return false;
    var btns = [];
    var els = layer.querySelectorAll('[data-focusable]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].offsetParent !== null && !els[i].disabled) btns.push(els[i]);
    }
    if (btns.length < 2) return false;
    var cur = document.activeElement;
    var idx = -1;
    for (var j = 0; j < btns.length; j++) {
      if (btns[j] === cur) { idx = j; break; }
    }
    if (idx < 0) return false;
    var next = dir === 'right' ? idx + 1 : idx - 1;
    if (next < 0 || next >= btns.length) return false;
    btns[next].focus();
    return true;
  }

  // Layer order for Up/Down navigation
  var layers = ['top', 'center', 'bottom'];

  // Keyboard/remote control — layer-based D-pad navigation
  useEffect(function() {
    var onKey = function(e) {
      var code = e.keyCode || e.which;
      poke();

      // Back — exit player
      if (code === 10009 || code === 27) {
        e.preventDefault();
        e._tvHandled = true;
        goBack();
        return;
      }

      // Enter/OK — if a player button is focused, click it; otherwise toggle play
      if (code === 13) {
        e.preventDefault();
        var focused = document.activeElement;
        if (focused && focused.hasAttribute && focused.hasAttribute('data-focusable') && focused.closest && focused.closest('.watch')) {
          focused.click();
        } else {
          togglePlay();
        }
        return;
      }

      // Media keys
      if (code === 415 || code === 19 || code === 10252) { e.preventDefault(); togglePlay(); return; } // Play/Pause
      if (code === 412) { e.preventDefault(); skip(-10); return; } // Rewind
      if (code === 417) { e.preventDefault(); skip(10); return; } // FastForward

      // Space — toggle play
      if (code === 32) { e.preventDefault(); togglePlay(); return; }

      // D-pad navigation between player layers
      if (code === 38) { // Up
        e.preventDefault();
        var curLayer = layerRef.current;
        var li = layers.indexOf(curLayer);
        if (li > 0) {
          focusLayer(layers[li - 1]);
        }
        return;
      }
      if (code === 40) { // Down
        e.preventDefault();
        var curLayer2 = layerRef.current;
        var li2 = layers.indexOf(curLayer2);
        if (li2 < layers.length - 1) {
          focusLayer(layers[li2 + 1]);
        }
        return;
      }
      if (code === 37) { // Left — always skip back
        e.preventDefault();
        skip(-10);
        return;
      }
      if (code === 39) { // Right — always skip forward
        e.preventDefault();
        skip(10);
        return;
      }
    };

    window.addEventListener('keydown', onKey, true);
    return function() { window.removeEventListener('keydown', onKey, true); };
  }, [poke, togglePlay, skip, current, flat.length]);

  // Focus the center play button on mount
  useEffect(function() {
    poke();
    setTimeout(function() { focusLayer('center'); }, 500);
  }, []);

  return (
    <div className="watch" ref={containerRef} style={{cursor: showUI ? 'default' : 'none'}}>
      <video ref={videoRef} playsInline autoPlay style={{width:'100%',height:'100%',background:'#000',objectFit:'contain'}} />

      {status && !error && <div className="watch-status"><div className="spinner" /></div>}

      {/* Top bar */}
      <div className={'pl-top' + (showUI ? '' : ' hidden')} data-player-layer="top">
        <button className="pl-iconbtn" data-focusable onClick={goBack}><Icon name="back" size={26} /></button>
        <div className="pl-title">{source ? source.title : ''}</div>
      </div>

      {/* Center controls */}
      {!error && (
        <div className={'pl-center' + (showUI ? '' : ' hidden')} data-player-layer="center">
          {isSeries && <button className="pl-bigbtn" data-focusable onClick={prevEp} disabled={current === 0}><Icon name="prev" size={26} /></button>}
          <button className="pl-bigbtn" data-focusable onClick={function() { skip(-10); }}><Icon name="back10" size={28} /><span>10</span></button>
          <button className="pl-bigbtn play" data-focusable onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={34} /></button>
          <button className="pl-bigbtn" data-focusable onClick={function() { skip(10); }}><Icon name="forward10" size={28} /><span>10</span></button>
          {isSeries && <button className="pl-bigbtn" data-focusable onClick={nextEp} disabled={current >= flat.length - 1}><Icon name="next" size={26} /></button>}
        </div>
      )}

      {/* Bottom controls */}
      {!isLive && (
        <div className={'pl-bottom' + (showUI ? '' : ' hidden')} data-player-layer="bottom">
          <div className="pl-seek">
            <div className="pl-seek-rail" />
            <div className="pl-seek-played" style={{width: duration ? (time / duration) * 100 + '%' : 0}} />
            <input
              type="range" min={0} max={duration || 0} step="0.1" value={time}
              onChange={function(e) { var v = videoRef.current; if (v) { v.currentTime = parseFloat(e.target.value); setTime(v.currentTime); } }}
              data-focusable
            />
          </div>
          <div className="pl-controls">
            <button className="pl-iconbtn" data-focusable onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
            <span className="pl-time">{fmt(time)} / {fmt(duration)}</span>
            <div className="pl-spacer" />
            {isSeries && <button className="pl-iconbtn" data-focusable onClick={nextEp} disabled={current >= flat.length - 1}><Icon name="next" size={20} /></button>}
          </div>
        </div>
      )}

      {isLive && (
        <div className={'pl-bottom live' + (showUI ? '' : ' hidden')} data-player-layer="bottom">
          <div className="pl-controls">
            <button className="pl-iconbtn" data-focusable onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
            <span className="pl-live-badge"><i className="live-dot" /> LIVE</span>
            <div className="pl-spacer" />
          </div>
        </div>
      )}

      {error && (
        <div className="watch-error">
          <div className="box">
            <h3 style={{marginTop: 0}}>Problema di riproduzione</h3>
            <p style={{color: '#bbb'}}>{error}</p>
            <button className="btn btn-red" data-focusable onClick={goBack}>Torna indietro</button>
          </div>
        </div>
      )}
    </div>
  );
}
