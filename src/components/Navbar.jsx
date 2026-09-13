import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n.js';
import Icon from './Icons.jsx';

export default function Navbar() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false); // mobile menu
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // close the mobile menu whenever the route changes
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <header className={'nav' + (scrolled ? ' scrolled' : '') + (open ? ' menu-open' : '')} data-focus-group>
      <button
        className="nav-burger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
      >
        <span /><span /><span />
      </button>

      <Link to="/" className="logo" data-focusable tabIndex={0}>RETFLIX</Link>

      <nav className="nav-links">
        <NavLink to="/" end data-focusable tabIndex={0}>{t('Home')}</NavLink>
        <NavLink to="/movies" data-focusable tabIndex={0}>{t('Film')}</NavLink>
        <NavLink to="/series" data-focusable tabIndex={0}>{t('Serie TV')}</NavLink>
        <NavLink to="/live" data-focusable tabIndex={0}>{t('Live TV')}</NavLink>
      </nav>

      <div className="nav-right">
        <button className="nav-icon" onClick={() => navigate('/search')} title={t('Cerca')} aria-label={t('Cerca')} data-focusable>
          <Icon name="search" size={22} />
        </button>
        <Link to="/settings" className="nav-icon" title={t('Impostazioni')} aria-label={t('Impostazioni')} data-focusable><Icon name="settings" size={20} /></Link>
        <div className="avatar">U</div>
      </div>
    </header>
  );
}
