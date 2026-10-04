// Settings management
const Settings = {
  defaults: {
    lang: 'ar',
    theme: 'dark',
    numerals: 'western',
    units: 'mbps',
    advanced: false,
    highContrast: false
  },

  init() {
    this.load();
    this.attachEvents();
    this.apply();
  },

  load() {
    const saved = Storage.getSettings();
    this.values = { ...this.defaults, ...saved };
  },

  save() {
    Storage.setSettings(this.values);
  },

  attachEvents() {
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.open());
    document.getElementById('langBtn')?.addEventListener('click', () => {
      this.toggleLang();
    });
    document.getElementById('themeBtn')?.addEventListener('click', () => {
      this.cycleTheme();
    });

    document.getElementById('setLang')?.addEventListener('change', (e) => {
      this.values.lang = e.target.value;
      this.save();
      this.apply();
    });
    document.getElementById('setNumerals')?.addEventListener('change', (e) => {
      this.values.numerals = e.target.value;
      localStorage.setItem('numerals', e.target.value);
      this.save();
      this.apply();
    });
    document.getElementById('setUnits')?.addEventListener('change', (e) => {
      this.values.units = e.target.value;
      this.save();
      this.apply();
    });
    document.getElementById('setAdvanced')?.addEventListener('change', (e) => {
      this.values.advanced = e.target.checked;
      this.save();
      this.apply();
    });
    document.getElementById('setHighContrast')?.addEventListener('change', (e) => {
      this.values.highContrast = e.target.checked;
      this.save();
      this.apply();
    });
    document.querySelectorAll('.theme-option').forEach(opt => {
      opt.addEventListener('click', () => {
        this.values.theme = opt.dataset.theme;
        this.save();
        this.apply();
        this.updateThemeOptions();
      });
    });
  },

  open() {
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('settingsPanel').classList.add('open');
    document.getElementById('settingsPanel').setAttribute('aria-hidden', 'false');
    document.getElementById('panelOverlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    // Sync form values
    document.getElementById('setLang').value = this.values.lang;
    document.getElementById('setNumerals').value = this.values.numerals;
    document.getElementById('setUnits').value = this.values.units;
    document.getElementById('setAdvanced').checked = this.values.advanced;
    document.getElementById('setHighContrast').checked = this.values.highContrast;
    this.updateThemeOptions();
  },

  updateThemeOptions() {
    document.querySelectorAll('.theme-option').forEach(o => {
      o.classList.toggle('active', o.dataset.theme === this.values.theme);
    });
  },

  toggleLang() {
    this.values.lang = this.values.lang === 'ar' ? 'en' : 'ar';
    document.getElementById('setLang').value = this.values.lang;
    this.save();
    this.apply();
  },

  cycleTheme() {
    const order = ['dark', 'light', 'system'];
    const idx = order.indexOf(this.values.theme);
    this.values.theme = order[(idx + 1) % order.length];
    this.save();
    this.apply();
  },

  apply() {
    // Language
    document.documentElement.lang = this.values.lang;
    document.getElementById('langBtn').textContent = this.values.lang === 'ar' ? 'EN' : 'عربي';
    applyTranslations();

    // Theme
    const effectiveTheme = this.values.theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : this.values.theme;
    document.body.classList.toggle('light-mode', effectiveTheme === 'light');

    // Theme icon
    const sun = document.querySelector('.icon-sun');
    const moon = document.querySelector('.icon-moon');
    if (sun && moon) {
      if (effectiveTheme === 'dark') {
        sun.style.display = 'block';
        moon.style.display = 'none';
      } else {
        sun.style.display = 'none';
        moon.style.display = 'block';
      }
    }

    // Update theme color meta
    let themeColor = '#06060c';
    if (effectiveTheme === 'light') themeColor = '#ffffff';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);

    // High contrast
    document.body.classList.toggle('high-contrast', this.values.highContrast);

    // Advanced mode
    const advEl = document.getElementById('advancedMetrics');
    if (advEl) {
      advEl.style.display = this.values.advanced ? '' : 'none';
    }

    // Re-render any visible results with new numerals/language
    if (window.App && App.lastResult) {
      App.displayResults(App.lastResult);
    }

    // Listen for system theme changes if using system
    if (this.values.theme === 'system') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.apply(), { once: true });
    }
  }
};
