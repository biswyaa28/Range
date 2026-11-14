/* Paint the saved theme before the app bundle runs. Plain ES5, no inline
   script, so the Tauri CSP (script-src 'self') stays intact. */
(function () {
  try {
    var root = document.documentElement;
    var theme = null;

    try {
      var raw = window.localStorage.getItem('personalOS_settings_v1');
      if (raw) {
        var parsed = JSON.parse(raw);
        var data = parsed && parsed.data ? parsed.data : parsed;
        if (data && typeof data.theme === 'string') theme = data.theme;
      }
    } catch (error) {
      theme = null;
    }

    if (theme === null) {
      try {
        var legacy = JSON.parse(window.localStorage.getItem('personalOS_v1') || 'null');
        if (legacy) {
          var settings = legacy.settings ? legacy.settings : legacy;
          if (settings && typeof settings.theme === 'string') theme = settings.theme;
        }
      } catch (error) {
        theme = null;
      }
    }

    var prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = theme === 'dark' || ((theme === null || theme === 'system') && prefersDark);

    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.style.colorScheme = dark ? 'dark' : 'light';
    root.style.backgroundColor = dark ? '#0A0A0B' : '#FFFFFF';
  } catch (error) {
    /* Default to the system scheme; the app applies settings again on mount. */
  }
})();
