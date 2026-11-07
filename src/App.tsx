import React, { useState, useEffect } from 'react';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  });

  const [route, setRoute] = useState<string>('home');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace(/^#/, '');
      if (h) setRoute(h);
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const toggleTheme = () => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  };

  const routes = [
    'home',
    'plan',
    'tasks',
    'notes',
    'focus',
    'insights',
    'settings',
  ];

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--bg)',
        color: 'var(--text)',
        transition: 'background 0.2s ease, color 0.2s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card, 20px)',
          padding: '2rem',
          boxShadow: 'var(--shadow-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
              Personal OS
            </h1>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-2)',
                margin: '4px 0 0',
              }}
            >
              Scaffold initialized & verified
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              padding: '8px 16px',
              borderRadius: '999px',
              background: 'var(--text)',
              color: 'var(--bg)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Toggle {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </header>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '1rem',
            borderRadius: '12px',
            background: 'var(--surface-2)',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
            CURRENT ROUTE: <span className="mono">#{route}</span>
          </div>
          <nav
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            {routes.map((r) => (
              <a
                key={r}
                href={`#${r}`}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  background:
                    route === r ? 'var(--text)' : 'var(--surface)',
                  color: route === r ? 'var(--bg)' : 'var(--text)',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                }}
              >
                #{r}
              </a>
            ))}
          </nav>
        </section>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
            color: 'var(--text-2)',
            borderTop: '1px solid var(--border)',
            paddingTop: '1rem',
          }}
        >
          <span>Theme tokens active: {theme}</span>
          <span className="mono">Schema v2 · React 18</span>
        </footer>
      </div>
    </main>
  );
};

