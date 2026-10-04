// Local storage and history management
const Storage = {
  KEY: 'speedcheck_history',
  SETTINGS_KEY: 'speedcheck_settings',
  AUTH_KEY: 'speedcheck_auth',

  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(this.SETTINGS_KEY)) || {};
    } catch { return {}; }
  },

  setSettings(s) {
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(s));
  },

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch { return []; }
  },

  saveResult(result) {
    const history = this.getHistory();
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      ...result
    };
    history.unshift(entry);
    // Keep last 100 for guests, more for logged-in users
    const max = this.getAuth() ? 1000 : 100;
    if (history.length > max) history.length = max;
    localStorage.setItem(this.KEY, JSON.stringify(history));
    // If logged in, also sync to server
    const auth = this.getAuth();
    if (auth?.token) {
      fetch('/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.token}`
        },
        body: JSON.stringify(result)
      }).catch(() => {});
    }
    return entry;
  },

  deleteResult(id) {
    const history = this.getHistory().filter(r => r.id !== id);
    localStorage.setItem(this.KEY, JSON.stringify(history));
  },

  clearHistory() {
    localStorage.removeItem(this.KEY);
  },

  getAuth() {
    try {
      return JSON.parse(localStorage.getItem(this.AUTH_KEY));
    } catch { return null; }
  },

  setAuth(auth) {
    if (auth) {
      localStorage.setItem(this.AUTH_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(this.AUTH_KEY);
    }
  },

  // Export history as CSV
  exportCSV() {
    const history = this.getHistory();
    if (!history.length) return null;
    const BOM = '\uFEFF'; // UTF-8 BOM for Arabic
    const headers = ['Date', 'Download (Mbps)', 'Upload (Mbps)', 'Ping (ms)', 'Jitter (ms)', 'Grade', 'ISP', 'Connection'];
    const rows = history.map(r => [
      new Date(r.timestamp).toLocaleString(),
      r.download?.toFixed(1) || '',
      r.upload?.toFixed(1) || '',
      r.ping?.toFixed(0) || '',
      r.jitter?.toFixed(1) || '',
      r.grade || '',
      r.isp || '',
      r.connection_type || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return BOM + headers.join(',') + '\n' + rows.join('\n');
  }
};
