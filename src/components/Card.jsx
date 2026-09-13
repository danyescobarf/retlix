import React, { useState } from 'react';
import { useI18n } from '../i18n.js';
import Icon from './Icons.jsx';

var SEVEN_DAYS = 7 * 24 * 3600;

export default function Card({ item, poster, progress, onClick, onRemove, number }) {
  const { t } = useI18n();
  const [err, setErr] = useState(false);
  const pct = progress && progress.duration > 0
    ? Math.min(100, (progress.position / progress.duration) * 100)
    : 0;

  const src = poster ? (item.icon || item.backdrop) : (item.backdrop || item.icon);
  var isNew = item.added && (Math.floor(Date.now() / 1000) - Number(item.added)) < SEVEN_DAYS;

  return (
    <div className={'card-wrap' + (number ? ' numbered' : '')}>
      {number && <div className="card-number">{number}</div>}
      <div
        className={'card' + (poster ? ' poster' : '')}
        onClick={() => onClick(item)}
        title={item.name}
        tabIndex={0}
        data-focusable
        onKeyDown={(e) => { if (e.key === 'Enter' || (e.keyCode || e.which) === 13) { e.preventDefault(); onClick(item); } }}
      >
        {item.type === 'live' && <span className="card-badge">{t('Live')}</span>}
        {isNew && item.type !== 'live' && <span className="card-badge card-badge-new">NUOVO</span>}
        {onRemove && (
          <button
            className="card-remove"
            aria-label="Rimuovi da Continua a guardare"
            onClick={(e) => { e.stopPropagation(); onRemove(item); }}
          >
            <Icon name="close" size={16} />
          </button>
        )}
        {!err && src ? (
          <img src={src} alt={item.name} loading="lazy" onError={() => setErr(true)} />
        ) : (
          <div className="card-fallback">{item.name}</div>
        )}
        <div className="card-playhint" aria-hidden><Icon name="play" size={20} /></div>
        <div className="card-hovercap">{item.name}</div>
        {pct > 0 && <div className="card-progress"><i style={{ width: pct + '%' }} /></div>}
        <div className="card-focus-info">
          {item.year && <span>{item.year}</span>}
          {item.rating > 0 && <span>★ {Number(item.rating).toFixed(1)}</span>}
          {item.genre && <span>{item.genre}</span>}
        </div>
      </div>
    </div>
  );
}
