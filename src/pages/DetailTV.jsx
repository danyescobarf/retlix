import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import Icon from '../components/Icons.jsx';
import Loader from '../components/Loader.jsx';
import { savePageState } from '../hooks/pageState.js';

export default function DetailTV() {
  var { t } = useI18n();
  var { type, id } = useParams();
  var navigate = useNavigate();

  var [item, setItem] = useState(null);
  var [season, setSeason] = useState(null);
  var [isFav, setIsFav] = useState(false);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    var alive = true;
    setLoading(true);
    api.detail(type, id).then(function(d) {
      if (!alive) return;
      setItem(d);
      if (d.seasons) {
        var keys = Object.keys(d.seasons).sort(function(a, b) { return Number(a) - Number(b); });
        setSeason(keys[0] || null);
      }
      setLoading(false);
    }).catch(function() { setLoading(false); });
    api.isFavorite(type, id).then(function(v) { if (alive) setIsFav(v); });
    return function() { alive = false; };
  }, [type, id]);

  // Focus the play button when content loads
  useEffect(function() {
    if (!item) return;
    setTimeout(function() {
      var btn = document.querySelector('.tv-detail-actions [data-focusable]');
      if (btn) btn.focus();
    }, 200);
  }, [item]);

  // Keyboard handler
  useEffect(function() {
    var onKey = function(e) {
      var code = e.keyCode || e.which;
      if (code === 10009 || code === 27) {
        e.preventDefault();
        e._tvHandled = true;
        navigate(-1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return function() { window.removeEventListener('keydown', onKey); };
  }, []);

  var toggleFav = function() {
    if (isFav) {
      api.removeFavorite(type, id).then(function() { setIsFav(false); });
    } else {
      api.addFavorite(type, id, item ? item.name : '', item ? (item.icon || item.backdrop) : '').then(function() { setIsFav(true); });
    }
  };

  var playMovie = function() {
    savePageState('detail-' + type + '-' + id);
    navigate('/watch/' + type + '/' + id);
  };

  var playEpisode = function(ep, idx) {
    savePageState('detail-' + type + '-' + id);
    navigate('/watch/series/' + id + '?s=' + encodeURIComponent(season) + '&ei=' + idx);
  };

  var prevSeason = function() {
    if (!item || !item.seasons) return;
    var keys = Object.keys(item.seasons).sort(function(a, b) { return Number(a) - Number(b); });
    var idx = keys.indexOf(season);
    if (idx > 0) setSeason(keys[idx - 1]);
  };

  var nextSeason = function() {
    if (!item || !item.seasons) return;
    var keys = Object.keys(item.seasons).sort(function(a, b) { return Number(a) - Number(b); });
    var idx = keys.indexOf(season);
    if (idx < keys.length - 1) setSeason(keys[idx + 1]);
  };

  if (loading || !item) {
    return <div style={{ minHeight: '100vh', background: '#141414' }}><Loader full label={t('Caricamento…')} /></div>;
  }

  var bg = item.backdrop || item.icon || '';
  var seasonKeys = item.seasons ? Object.keys(item.seasons).sort(function(a, b) { return Number(a) - Number(b); }) : [];
  var episodes = (item.seasons && season) ? (item.seasons[season] || []) : [];

  return (
    <div className="tv-detail">
      {/* Hero section with backdrop */}
      <div className="tv-detail-hero" style={bg ? { backgroundImage: 'url("' + bg + '")' } : {}}>
        <div className="tv-detail-hero-overlay" />
        <div className="tv-detail-hero-content">
          <h1 className="tv-detail-title">{item.name}</h1>
          <div className="tv-detail-meta">
            {item.rating > 0 && <span className="tv-detail-rating"><Icon name="star" size={20} /> {Number(item.rating).toFixed(1)}</span>}
            {item.year && <span>{item.year}</span>}
            {item.duration && <span>{item.duration}</span>}
            {item.genre && <span>{item.genre}</span>}
          </div>
          <div className="tv-detail-actions" data-focus-group>
            {type !== 'series' && (
              <button className="btn btn-play tv-detail-btn" data-focusable onClick={playMovie}>
                <Icon name="play" size={28} /> {type === 'live' ? t('Guarda in diretta') : t('Riproduci')}
              </button>
            )}
            {type === 'series' && episodes.length > 0 && (
              <button className="btn btn-play tv-detail-btn" data-focusable onClick={function() { playEpisode(episodes[0], 0); }}>
                <Icon name="play" size={28} /> {t('Riproduci') + ' S' + season + ':E1'}
              </button>
            )}
            <button className="btn btn-info tv-detail-btn" data-focusable onClick={toggleFav}>
              <Icon name={isFav ? 'heartFilled' : 'heart'} size={24} /> {isFav ? t('Nella mia lista') : t('La mia lista')}
            </button>
            {item.trailer && (
              <a className="btn btn-info tv-detail-btn" data-focusable tabIndex={0}
                href={'https://www.youtube.com/watch?v=' + item.trailer} target="_blank" rel="noreferrer">
                <Icon name="play" size={24} /> Trailer
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Body section */}
      <div className="tv-detail-body">
        {item.plot && <p className="tv-detail-plot">{item.plot}</p>}
        <div className="tv-detail-info">
          {item.director && <div><b>{t('Regia:')}</b> {item.director}</div>}
          {item.cast && <div><b>{t('Cast:')}</b> {item.cast}</div>}
        </div>

        {/* Series: season selector + episodes */}
        {type === 'series' && seasonKeys.length > 0 && (
          <div className="tv-detail-episodes">
            <div className="tv-detail-season-nav" data-focus-group>
              <button className="tv-cat-arrow" data-focusable onClick={prevSeason}>
                <Icon name="chevronLeft" size={32} />
              </button>
              <span className="tv-detail-season-label">
                {t('Stagione') + ' ' + season}
              </span>
              <button className="tv-cat-arrow" data-focusable onClick={nextSeason}>
                <Icon name="chevronRight" size={32} />
              </button>
            </div>

            <div className="tv-detail-ep-list">
              {episodes.map(function(ep, idx) {
                return (
                  <div key={ep.id} className="tv-detail-ep" tabIndex={0} data-focusable
                    onClick={function() { playEpisode(ep, idx); }}
                    onKeyDown={function(e) { if ((e.keyCode || e.which) === 13) playEpisode(ep, idx); }}>
                    <div className="tv-detail-ep-num">{ep.episode_num}</div>
                    {ep.still ? <img className="tv-detail-ep-still" src={ep.still} alt="" /> : <div className="tv-detail-ep-still" />}
                    <div className="tv-detail-ep-info">
                      <h4>{ep.title || (t('Episodio') + ' ' + ep.episode_num)}</h4>
                      {ep.plot && <p>{ep.plot}</p>}
                    </div>
                    <div className="tv-detail-ep-play"><Icon name="play" size={28} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
