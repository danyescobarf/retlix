import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useUI } from '../App.jsx';
import { useI18n } from '../i18n.js';
import { useTV } from '../hooks/useTv.js';
import Card from '../components/Card.jsx';
import Row from '../components/Row.jsx';
import Loader from '../components/Loader.jsx';
import CategoryModal from '../components/CategoryModal.jsx';
import Icon from '../components/Icons.jsx';
import { savePageState, restorePageState, clearPageState, setRestoring } from '../hooks/pageState.js';

const TITLES = { movie: 'Film', series: 'Serie TV', live: 'Live TV' };
const PAGE = 60;

// Persist scroll + category per type so returning from the player restores position
var _savedState = {};

export default function Browse({ type }) {
  const { openDetail } = useUI();
  const { t } = useI18n();
  const { isTV } = useTV();
  const navigate = useNavigate();
  const [cats, setCats] = useState([]);
  const saved = _savedState[type] || {};
  const [category, _setCategory] = useState(saved.category || '');
  const [sort, _setSort] = useState(saved.sort || (type === 'live' ? 'name' : 'added'));
  const pageRef = useRef(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCats, setShowCats] = useState(false);

  // TV: load items per category when showing "All"
  const [catRows, setCatRows] = useState([]);
  const [catRowsLoading, setCatRowsLoading] = useState(false);

  // Wrapped setters that also update _savedState
  function setCategory(val) {
    _setCategory(val);
    _savedState[type] = Object.assign({}, _savedState[type] || {}, { category: val });
  }
  function setSort(val) {
    _setSort(val);
    _savedState[type] = Object.assign({}, _savedState[type] || {}, { sort: val });
  }

  useEffect(() => {
    api.categories(type).then(setCats).catch(() => setCats([]));
  }, [type]);

  const load = useCallback(async (reset) => {
    setLoading(true);
    const offset = reset ? 0 : items.length;
    try {
      const res = await api.content({ type, category, sort, limit: PAGE, offset });
      setTotal(res.total);
      setItems(reset ? res.items : [...items, ...res.items]);
    } catch {
      if (reset) { setItems([]); setTotal(0); }
    } finally {
      setLoading(false);
    }
  }, [type, category, sort, items]);

  // reload on filter change
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, category, sort]);

  // TV "All" mode: load a few items per category to show as rows
  useEffect(() => {
    if (!isTV || category || cats.length === 0) { setCatRows([]); return; }
    setCatRowsLoading(true);
    var promises = cats.slice(0, 12).map(function(c) {
      return api.content({ type: type, category: c.category_id, sort: sort, limit: 20, offset: 0 })
        .then(function(res) { return { cat: c, items: res.items }; })
        .catch(function() { return { cat: c, items: [] }; });
    });
    Promise.all(promises).then(function(rows) {
      setCatRows(rows.filter(function(r) { return r.items.length > 0; }));
      setCatRowsLoading(false);
    });
  }, [isTV, category, cats, type, sort]);

  var stateKey = 'browse-' + type;

  // Save state before navigating
  const onItem = (item) => {
    savePageState(stateKey);
    _savedState[type] = { category: category, sort: sort, showCatPicker: false };
    if (type === 'live') navigate(`/watch/${type}/${item.id}`);
    else openDetail(type, item.id);
  };

  // Restore scroll + focus when items load and we have saved state
  useEffect(() => {
    if (!loading && items.length > 0 && !showCatPicker) {
      restorePageState(stateKey, 300);
    }
  }, [loading, items.length, showCatPicker]);

  // TV: category picker state — persisted in _savedState
  const [showCatPicker, _setShowCatPicker] = useState(
    saved.showCatPicker !== undefined ? saved.showCatPicker : (saved.category ? false : true)
  );
  function setShowCatPicker(val) {
    _setShowCatPicker(val);
    _savedState[type] = Object.assign({}, _savedState[type] || {}, { showCatPicker: val });
  }

  // Adult filter for category names
  var ADULT_RE = /xxx|porn|adult|18\+|erotic|erotico|porno|hentai|sex|for\s*adults|per\s*adulti|mature|milf|lesbian|gay|fetish|bdsm|strip|nude|nud[io]|hard\s*core|hardcore|kamasutra|playboy|brazzers|bang\s*bros|naughty|x\s*rated|xrated/i;

  // TV: Back key handling
  useEffect(function() {
    if (!isTV) return;
    function onBack(e) {
      var code = e.keyCode || e.which;
      if (code === 10009 || code === 27) {
        e.preventDefault();
        e._tvHandled = true;
        if (showCatPicker) {
          _savedState[type] = {};
          clearPageState(stateKey);
          navigate('/');
        } else {
          clearPageState(stateKey);
          setRestoring(true);
          setShowCatPicker(true);
          setCategory('');
          window.scrollTo(0, 0);
          setTimeout(function() { setRestoring(false); }, 500);
        }
      }
    }
    window.addEventListener('keydown', onBack, true);
    return function() { window.removeEventListener('keydown', onBack, true); };
  }, [isTV, showCatPicker, navigate]);

  // Restore focus on the last selected category when returning to picker
  var lastSelectedCat = (_savedState[type] || {}).lastCat || '';
  useEffect(function() {
    if (!isTV || !showCatPicker || !lastSelectedCat) return;
    setTimeout(function() {
      var btn = document.querySelector('[data-cat-id="' + lastSelectedCat + '"]');
      if (btn) { btn.focus(); btn.scrollIntoView && btn.scrollIntoView({block:'center'}); }
    }, 200);
  }, [showCatPicker]);

  // TV layout: Category Picker screen
  if (isTV && showCatPicker) {
    var safeCats = cats.filter(function(c) { return !ADULT_RE.test(c.name); });
    return (
      <div className="page tv-cat-picker">
        <h1 className="tv-cat-picker-title">{t(TITLES[type])}</h1>
        <div className="tv-cat-grid">
          <button
            className="tv-cat-item tv-cat-tutti"
            data-focusable
            data-cat-id="all"
            onClick={function() {
              _savedState[type] = Object.assign({}, _savedState[type] || {}, { lastCat: 'all' });
              setCategory(''); setShowCatPicker(false);
            }}
          >
            {t('TUTTI')} <span className="tv-cat-count">— {t('Mostra tutto')}</span>
          </button>
          {safeCats.map(function(c) {
            return (
              <button
                key={c.category_id}
                className="tv-cat-item"
                data-focusable
                data-cat-id={c.category_id}
                onClick={function() {
                  _savedState[type] = Object.assign({}, _savedState[type] || {}, { lastCat: c.category_id });
                  setCategory(c.category_id); setShowCatPicker(false);
                }}
              >
                {c.name} {c.count > 0 && <span className="tv-cat-count">({c.count})</span>}
              </button>
            );
          })}
        </div>
        {cats.length === 0 && <div style={{padding: 40}}><Loader label={t('Caricamento categorie…')} /></div>}
      </div>
    );
  }

  // TV layout: Content screen (after category selected)
  if (isTV) {
    var catName = category ? (cats.find(function(c) { return c.category_id === category; }) || {}).name || '' : t('Tutti');

    // Live TV: grid of name buttons (like categories — no posters)
    if (type === 'live') {
      return (
        <div className="page tv-cat-picker">
          <div className="tv-browse-head">
            <h1 className="tv-cat-picker-title">{t('Live TV')} <span style={{color:'#888',fontSize:'32px'}}>›</span> {catName}</h1>
            <div className="tv-browse-controls" data-focus-group>
              <button className="tv-sort-btn" data-focusable onClick={function() { setShowCatPicker(true); setCategory(''); }}>
                <Icon name="chevronLeft" size={22} /> {t('Categorie')}
              </button>
            </div>
          </div>
          <div className="tv-cat-grid">
            {items.map(function(it) {
              return (
                <button key={it.id} className="tv-cat-item" data-focusable onClick={function() { onItem(it); }}>
                  {it.icon && <img src={it.icon} alt="" style={{width:'40px',height:'40px',borderRadius:'6px',objectFit:'cover',marginRight:'12px',display:'inline-block',verticalAlign:'middle'}} onError={function(e){e.target.style.display='none';}} />}
                  {it.name}
                </button>
              );
            })}
          </div>
          {loading && <div style={{ padding: 40 }}><Loader label={t('Caricamento…')} /></div>}
          {!loading && items.length < total && (
            <button className="btn btn-info load-more" onClick={() => load(false)} data-focusable>
              {t('Carica altri')} ({items.length}/{total})
            </button>
          )}
        </div>
      );
    }

    // Film / Serie: card grid (flex wrap, navigable up/down/left/right)
    return (
      <div className="page tv-browse">
        <div className="tv-browse-head">
          <h1>{t(TITLES[type])} <span style={{color:'#888',fontSize:'32px'}}>›</span> {catName}</h1>
          <div className="tv-browse-controls" data-focus-group>
            <button className="tv-sort-btn" data-focusable onClick={function() { setShowCatPicker(true); setCategory(''); }}>
              <Icon name="chevronLeft" size={22} /> {t('Categorie')}
            </button>
            <button className="tv-sort-btn" data-focusable onClick={function() {
              var opts = ['added', 'name', 'rating'];
              var idx = opts.indexOf(sort);
              setSort(opts[(idx + 1) % opts.length]);
            }}>
              {sort === 'added' ? t('Aggiunti di recente') : sort === 'name' ? t('A → Z') : t('Più votati')} ▼
            </button>
          </div>
        </div>

        <div className="tv-content-grid">
          {items.map(function(it) {
            return <Card key={it.type + it.id} item={it} poster={true} onClick={onItem} />;
          })}
        </div>

        {loading && <div style={{ padding: 40 }}><Loader label={t('Caricamento…')} /></div>}
        {!loading && items.length === 0 && <div className="empty">{t('Ancora niente qui.')}</div>}
        {!loading && items.length < total && (
          <button className="btn btn-info load-more" onClick={() => load(false)} data-focusable>
            {t('Carica altri')} ({items.length}/{total})
          </button>
        )}
      </div>
    );
  }

  // Desktop/mobile layout (unchanged)
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t(TITLES[type])}</h1>
        {type !== 'live' && (
          <div className="toolbar">
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="added">{t('Aggiunti di recente')}</option>
              <option value="name">{t('A → Z')}</option>
              <option value="rating">{t('Più votati')}</option>
            </select>
          </div>
        )}
      </div>

      <div className="chips" style={{ marginBottom: 22 }}>
        <button className="chip chip-cats" onClick={() => setShowCats(true)} data-focusable>
          <Icon name="search" size={14} /> {category ? (cats.find((c) => c.category_id === category)?.name || t('Categoria')) : t('Categorie')}
        </button>
        <button className={'chip' + (category === '' ? ' active' : '')} onClick={() => setCategory('')} data-focusable>{t('Tutti')}</button>
        {cats.map((c) => (
          <button key={c.category_id} className={'chip' + (category === c.category_id ? ' active' : '')} onClick={() => setCategory(c.category_id)} data-focusable>
            {c.name} <span style={{ opacity: .5 }}>({c.count})</span>
          </button>
        ))}
      </div>

      {items.length === 0 && !loading ? (
        <div className="empty">{t('Ancora niente qui.')}</div>
      ) : (
        <div className={'grid' + (type === 'live' ? ' live' : '')}>
          {items.map((it) => (
            <Card key={it.type + it.id} item={it} poster={type !== 'live'} onClick={onItem} />
          ))}
        </div>
      )}

      {loading && <div style={{ padding: 40 }}><Loader label="Caricamento…" /></div>}
      {!loading && items.length < total && (
        <button className="btn btn-info load-more" onClick={() => load(false)} data-focusable>Carica altri ({items.length}/{total})</button>
      )}

      {showCats && (
        <CategoryModal
          categories={cats}
          current={category}
          onSelect={setCategory}
          onClose={() => setShowCats(false)}
          title={`Categorie · ${TITLES[type]}`}
        />
      )}
    </div>
  );
}
