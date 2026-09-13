import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.js';
import Loader from './Loader.jsx';
import Icon from './Icons.jsx';
import Avatar from './Avatar.jsx';

export default function DetailModal({ type, id, onClose }) {
  const { t } = useI18n();
  const [item, setItem] = useState(null);
  const [season, setSeason] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    api.detail(type, id).then((d) => {
      if (!alive) return;
      setItem(d);
      if (d.seasons) {
        const keys = Object.keys(d.seasons).sort((a, b) => Number(a) - Number(b));
        setSeason(keys[0] || null);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [type, id]);

  useEffect(() => {
    const onKey = (e) => {
      var code = e.keyCode || e.which;
      if (e.key === 'Escape' || code === 27 || code === 10009) { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    // Focus handled by item effect below
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = ''; };
  }, [onClose]);

  // Focus the Play/Watch button when modal content loads
  useEffect(() => {
    if (!item) return;
    setTimeout(function() {
      var btn = document.querySelector('.modal .btn-play[data-focusable]');
      if (!btn) btn = document.querySelector('.modal [data-focusable]');
      if (btn) btn.focus();
    }, 100);
  }, [item]);

  const bg = item?.backdrop || item?.icon || '';

  const playMovie = () => {
    onClose();
    navigate(`/watch/${type}/${id}`);
  };
  const playEpisode = (ep, idx) => {
    onClose();
    // Series play through the playlist-aware watch route: series id + season + episode index
    navigate(`/watch/series/${id}?s=${encodeURIComponent(season)}&ei=${idx}`);
  };

  const seasonKeys = item?.seasons ? Object.keys(item.seasons).sort((a, b) => Number(a) - Number(b)) : [];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <button className="modal-close" onClick={onClose} aria-label="Chiudi" data-focusable><Icon name="close" size={20} /></button>
        {!item ? (
          <div style={{ padding: 60 }}><Loader label="Caricamento…" /></div>
        ) : (
          <>
            <div className="modal-hero" style={{ backgroundImage: bg ? `url("${bg}")` : 'linear-gradient(135deg,#3a0c10,#141414)' }}>
              <div className="modal-hero-content">
                <h2>{item.name}</h2>
                <div className="hero-actions">
                  {type === 'movie' && <button className="btn btn-play" onClick={playMovie} data-focusable><Icon name="play" size={18} /> {t('Riproduci')}</button>}
                  {type === 'live' && <button className="btn btn-play" onClick={playMovie} data-focusable><Icon name="play" size={18} /> {t('Guarda in diretta')}</button>}
                  {item.trailer && (
                    <a className="btn btn-info" href={`https://www.youtube.com/watch?v=${item.trailer}`} target="_blank" rel="noreferrer" data-focusable tabIndex={0}><Icon name="play" size={18} /> Trailer</a>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-body">
              <div className="modal-meta">
                {item.rating > 0 && <span className="hero-badge"><Icon name="star" size={13} /> {Number(item.rating).toFixed(1)}</span>}
                {item.year && <span>{item.year}</span>}
                {item.duration && <span>{item.duration}</span>}
                {item.genre && <span>{item.genre}</span>}
              </div>
              {item.plot && <p className="modal-plot">{item.plot}</p>}
              <div className="modal-facts">
                {item.director && <div><b>{t('Regia:')}</b> {item.director}</div>}
                {!item.castList?.length && item.cast && <div><b>{t('Cast:')}</b> {item.cast}</div>}
              </div>

              {item.castList?.length > 0 && (
                <div className="cast-row">
                  <h3>{t('Cast')}</h3>
                  <div className="cast-track">
                    {item.castList.map((c, i) => (
                      <button
                        className="cast-card"
                        key={i}
                        title={t('Cerca') + ' ' + c.name}
                        onClick={() => { onClose(); navigate('/search?actor=' + encodeURIComponent(c.name)); }}
                      >
                        <Avatar src={c.image} name={c.name} phClass="cast-ph" />
                        <div className="cast-name">{c.name}</div>
                        {c.character && <div className="cast-char">{c.character}</div>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {type === 'series' && seasonKeys.length > 0 && (
                <>
                  <div className="season-head">
                    <h3>{t('Episodi')}</h3>
                    <select className="select" value={season || ''} onChange={(e) => setSeason(e.target.value)} data-focusable>
                      {seasonKeys.map((s) => <option key={s} value={s}>{t('Stagione {n}', { n: s })}</option>)}
                    </select>
                  </div>
                  <div>
                    {(item.seasons[season] || []).map((ep, idx) => (
                      <div className="episode" key={ep.id} onClick={() => playEpisode(ep, idx)} tabIndex={0} data-focusable onKeyDown={(e) => { if ((e.keyCode || e.which) === 13 || e.key === 'Enter') playEpisode(ep, idx); }}>
                        <div className="episode-num">{ep.episode_num}</div>
                        {ep.still
                          ? <img className="episode-still" src={ep.still} alt="" loading="lazy" />
                          : <div className="episode-still" />}
                        <div className="episode-info">
                          <h4>{ep.title}</h4>
                          {ep.plot && <p>{ep.plot}</p>}
                        </div>
                        <div className="episode-play"><Icon name="play" size={20} /></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
