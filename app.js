// Main application controller
const App = {
  isRunning: false,
  lastResult: null,
  rafId: null,

  init() {
    Gauge.init();
    SpeedChart.init();
    SpeedTest.init();
    HistoryUI.init();
    Auth.init();
    Settings.init();
    PWA.init();

    this.attachEvents();
    this.loadConnectionInfo();
    this.drawTicks();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (e.target === document.body || e.target.tagName === 'BUTTON' && e.target.id === 'startBtn') {
          if (document.activeElement === document.body) {
            e.preventDefault();
            this.toggleTest();
          }
        }
      }
      if (e.code === 'Escape') {
        if (SpeedTest.running) {
          this.stopTest();
        } else {
          HistoryUI.closeAll();
          document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
        }
      }
    });

    // Announce ready state for screen readers
    this.announce(t('ready'));
  },

  attachEvents() {
    document.getElementById('startBtn').addEventListener('click', () => this.toggleTest());
    document.getElementById('retryBtn')?.addEventListener('click', () => this.toggleTest());
    document.getElementById('shareBtn')?.addEventListener('click', () => this.openShare());
    document.getElementById('shareNativeBtn')?.addEventListener('click', () => this.shareNative());
    document.getElementById('shareCopyBtn')?.addEventListener('click', () => this.shareCopy());
    document.getElementById('shareImageBtn')?.addEventListener('click', () => this.shareImage());
  },

  async loadConnectionInfo() {
    // IP address
    try {
      const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      const data = await res.json();
      document.getElementById('ipText').textContent = data.ip;
    } catch {
      document.getElementById('ipText').textContent = '—';
    }

    // Connection type
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      const typeMap = {
        'cellular': conn.effectiveType ? conn.effectiveType.toUpperCase() : '4G',
        'wifi': 'WiFi',
        'ethernet': 'Ethernet'
      };
      const type = typeMap[conn.type] || conn.effectiveType?.toUpperCase() || '';
      if (type) {
        document.getElementById('connTypeItem').style.display = '';
        document.getElementById('connTypeText').textContent = type.toUpperCase();
      }
    }
  },

  drawTicks() {
    Gauge.drawTicks();
  },

  toggleTest() {
    if (SpeedTest.running) {
      this.stopTest();
    } else {
      if (!navigator.onLine) {
        this.showError(t('offlineTestMsg'));
        return;
      }
      this.startTest();
    }
  },

  startTest() {
    this.isRunning = true;
    this.hideError();
    this.hideResults();
    document.getElementById('chartSection').style.display = 'block';
    SpeedChart.reset();

    // Update button to testing state
    const btn = document.getElementById('startBtn');
    btn.className = 'start-btn testing';
    btn.querySelector('.btn-text').textContent = t('stop');
    btn.querySelector('.play-icon').style.display = 'none';
    btn.querySelector('.stop-icon').style.display = 'block';
    btn.querySelector('.refresh-icon').style.display = 'none';

    // Update status
    this.setStatus('testing', t('measuringPing'));
    this.setSpeedDisplay(0, t('measuringPing'));
    Gauge.reset();
    Gauge.setActive(true);

    // Reset steps
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active', 'complete'));

    // SpeedTest callbacks
    SpeedTest.onPhaseChange = (phase) => this.onPhaseChange(phase);
    SpeedTest.onProgress = (metric, value) => this.onProgress(metric, value);
    SpeedTest.onComplete = (results) => this.onTestComplete(results);
    SpeedTest.onError = (err) => this.onTestError(err);

    // Start measurement within 500ms
    requestAnimationFrame(() => {
      SpeedTest.start();
    });
  },

  stopTest() {
    SpeedTest.cancel();
    const btn = document.getElementById('startBtn');
    btn.querySelector('.btn-text').textContent = t('canceling');
  },

  onPhaseChange(phase) {
    // Update stepper
    const phases = ['ping', 'download', 'upload', 'done'];
    const phaseIdx = phases.indexOf(phase);

    phases.forEach((p, i) => {
      const el = document.querySelector(`.step[data-phase="${p}"]`);
      if (!el) return;
      el.classList.remove('active', 'complete');
      if (i < phaseIdx || phase === 'done' && p === 'done') {
        el.classList.add('complete');
      }
      if (i === phaseIdx) {
        el.classList.add('active');
      }
    });

    // Update status text
    const statusTexts = {
      ping: t('measuringPing'),
      download: t('measuringDown'),
      upload: t('measuringUp'),
      done: t('done')
    };
    const unit = document.querySelector('.speed-unit');
    if (phase === 'ping') {
      this.setSpeedDisplay(0, statusTexts[phase]);
    } else {
      this.setSpeedDisplay(0, statusTexts[phase]);
    }

    // Announce for screen readers
    this.announce(statusTexts[phase]);
  },

  onProgress(metric, value) {
    if (metric === 'download') {
      Gauge.setSpeed(value);
      this.setSpeedDisplay(value, t('measuringDown'));
      this.updateMetricCard('download', value);
    } else if (metric === 'upload') {
      // During upload, show upload speed on gauge too (but scale for visual)
      Gauge.setSpeed(value);
      this.setSpeedDisplay(value, t('measuringUp'));
      this.updateMetricCard('upload', value);
    } else if (metric === 'ping') {
      this.updatePingCard(value);
    } else if (metric === 'jitter') {
      this.updateJitterCard(value);
    }
  },

  onTestComplete(results) {
    this.isRunning = false;
    Gauge.setActive(false);

    // Update button to complete state
    const btn = document.getElementById('startBtn');
    btn.className = 'start-btn complete';
    btn.querySelector('.btn-text').textContent = t('newTest');
    btn.querySelector('.play-icon').style.display = 'none';
    btn.querySelector('.stop-icon').style.display = 'none';
    btn.querySelector('.refresh-icon').style.display = 'block';

    // Mark all steps complete
    document.querySelectorAll('.step').forEach(s => {
      s.classList.remove('active');
      s.classList.add('complete');
    });

    // Set final status
    this.setStatus('done', t('done'));

    // Compute grade
    const grade = this.computeGrade(results);
    results.grade = grade;

    // Get connection info for storage
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    results.connection_type = conn?.effectiveType || conn?.type || '';
    results.ip_address = document.getElementById('ipText').textContent;
    results.device_type = /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

    // Save to history
    Storage.saveResult(results);

    this.lastResult = results;

    // Display results
    this.displayResults(results);

    // Confetti for A+
    if (grade === 'A+') {
      this.launchConfetti();
    }

    this.announce(`${t('done')} — ${grade}`);
  },

  onTestError(err) {
    this.isRunning = false;
    Gauge.setActive(false);

    const btn = document.getElementById('startBtn');
    btn.className = 'start-btn idle';
    btn.querySelector('.btn-text').textContent = t('retry');
    btn.querySelector('.play-icon').style.display = 'block';
    btn.querySelector('.stop-icon').style.display = 'none';
    btn.querySelector('.refresh-icon').style.display = 'none';

    this.setStatus('error', t('error'));
    this.setSpeedDisplay(0, t('error'));

    const errMsgs = {
      offline: t('offlineTestMsg'),
      pingFailed: t('testFailed'),
      downloadFailed: t('testFailed'),
      uploadFailed: t('testFailed'),
      networkError: t('networkError')
    };
    this.showError(errMsgs[err] || t('genericError'));
  },

  setStatus(state, text) {
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    dot.className = 'status-dot ' + (state === 'testing' ? 'testing' : state === 'error' ? 'error' : 'done');
    statusText.textContent = text;
  },

  setSpeedDisplay(value, status) {
    const valEl = document.getElementById('speedValue');
    const statusEl = document.getElementById('speedStatus');
    if (typeof value === 'number') {
      valEl.textContent = formatNumber(value);
    }
    if (status) statusEl.textContent = status;
  },

  updateMetricCard(type, value) {
    const valEl = document.getElementById(`${type}Value`);
    const barEl = document.getElementById(`${type}Bar`);
    const qualEl = document.getElementById(`${type}Quality`);
    if (valEl) valEl.textContent = formatNumber(value);
    if (barEl) {
      const maxSpeed = type === 'download' ? 500 : 200;
      barEl.style.width = Math.min(100, (value / maxSpeed) * 100) + '%';
    }
    if (qualEl) {
      if (type === 'download' || type === 'upload') {
        const good = type === 'download' ? 100 : 50;
        const ok = type === 'download' ? 25 : 10;
        if (value >= good) {
          qualEl.textContent = t('qFast');
          qualEl.className = 'metric-quality quality-good';
        } else if (value >= ok) {
          qualEl.textContent = t('qAverage');
          qualEl.className = 'metric-quality quality-ok';
        } else {
          qualEl.textContent = t('qSlow');
          qualEl.className = 'metric-quality quality-bad';
        }
      }
    }
  },

  updatePingCard(value) {
    const valEl = document.getElementById('pingValue');
    const qualEl = document.getElementById('pingQuality');
    const barEl = document.getElementById('pingBar');
    if (valEl) valEl.textContent = formatNumber(value, 0);
    if (barEl) {
      barEl.style.width = Math.min(100, Math.max(10, 100 - value)) + '%';
      if (value < 20) barEl.style.background = 'var(--success)';
      else if (value < 50) barEl.style.background = 'var(--warning)';
      else barEl.style.background = 'var(--danger)';
    }
    if (qualEl) {
      if (value < 20) {
        qualEl.textContent = t('qExcellent');
        qualEl.className = 'metric-quality quality-good';
      } else if (value < 50) {
        qualEl.textContent = t('qGood');
        qualEl.className = 'metric-quality quality-ok';
      } else {
        qualEl.textContent = t('qPoor');
        qualEl.className = 'metric-quality quality-bad';
      }
    }
  },

  updateJitterCard(value) {
    const valEl = document.getElementById('jitterValue');
    const qualEl = document.getElementById('jitterQuality');
    if (valEl) valEl.textContent = formatNumber(value, 1);
    if (qualEl) {
      if (value < 5) {
        qualEl.textContent = t('qStable');
        qualEl.className = 'metric-quality quality-good';
      } else if (value < 15) {
        qualEl.textContent = t('qMedium');
        qualEl.className = 'metric-quality quality-ok';
      } else {
        qualEl.textContent = t('qUnstable');
        qualEl.className = 'metric-quality quality-bad';
      }
    }
  },

  computeGrade(r) {
    const d = r.download || 0;
    const u = r.upload || 0;
    const p = r.ping || 999;
    const j = r.jitter || 999;
    if (d > 200 && u > 50 && p < 10 && j < 3) return 'A+';
    if (d > 100 && u > 25 && p < 20 && j < 5) return 'A';
    if (d > 50 && u > 10 && p < 40 && j < 10) return 'B';
    if (d > 25 && u > 5 && p < 70 && j < 15) return 'C';
    if (d > 10 && u > 2 && p < 150) return 'D';
    return 'F';
  },

  displayResults(r) {
    this.lastResult = r;
    const section = document.getElementById('resultsSection');
    section.style.display = '';

    // Animate numbers
    this.updateMetricCard('download', r.download);
    this.updateMetricCard('upload', r.upload);
    this.updatePingCard(r.ping);
    this.updateJitterCard(r.jitter);

    // Grade
    const badge = document.getElementById('gradeBadge');
    badge.textContent = r.grade;
    badge.className = 'grade-badge grade-' + r.grade.toLowerCase().replace('+', 'plus');
    document.getElementById('gradeTitle').textContent = t('grade' + r.grade.replace('+', 'Plus'));
    document.getElementById('gradeDesc').textContent = t('desc' + r.grade.replace('+', 'Plus'));

    // Advanced metrics
    if (r.packetLoss != null) document.getElementById('packetLossVal').textContent = formatNumber(r.packetLoss, 1) + '%';
    if (r.pingMin) document.getElementById('minPingVal').textContent = formatNumber(r.pingMin, 1) + ' ms';
    if (r.pingMax) document.getElementById('maxPingVal').textContent = formatNumber(r.pingMax, 1) + ' ms';
    if (r.pingStdDev) document.getElementById('stdDevPingVal').textContent = formatNumber(r.pingStdDev, 1) + ' ms';
    if (r.downStability != null) document.getElementById('downStabVal').textContent = formatNumber(r.downStability, 1) + '%';
    if (r.upStability != null) document.getElementById('upStabVal').textContent = formatNumber(r.upStability, 1) + '%';

    // Recommendations
    this.showRecommendations(r);

    // Final speed display
    this.setSpeedDisplay(r.download, t('done'));
    Gauge.animateTo(r.download, 800);

    // Scroll results into view on mobile
    if (window.innerWidth < 768) {
      setTimeout(() => {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  },

  showRecommendations(r) {
    const recSection = document.getElementById('recommendations');
    const recGrid = document.getElementById('recGrid');
    const suggestions = document.getElementById('suggestions');
    recSection.style.display = '';

    const activities = [
      { label: t('rec4k'), ok: r.download >= 25 },
      { label: t('recVideoCall'), ok: r.upload >= 5 && r.ping < 50 },
      { label: t('recGaming'), ok: r.ping < 30 && r.jitter < 10 },
      { label: t('recUpload'), ok: r.upload >= 10 },
      { label: t('recBrowsing'), ok: r.download >= 3 },
      { label: t('recDownloading'), ok: r.download >= 10 }
    ];

    recGrid.innerHTML = activities.map(a => `
      <div class="rec-item">
        <div class="rec-check ${a.ok ? 'yes' : 'no'}">
          ${a.ok
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          }
        </div>
        <span>${a.label}</span>
      </div>`).join('');

    // Suggestions
    const sugg = [];
    if (r.ping > 50) sugg.push(t('suggestWired'));
    if (r.upload < 5) sugg.push(t('suggestUpload'));
    if (r.jitter > 15) sugg.push(t('suggestJitter'));
    if (r.download < 20) sugg.push(t('suggestDownload'));

    suggestions.innerHTML = sugg.map(s => `
      <div class="suggestion">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>${s}</span>
      </div>`).join('');
  },

  hideResults() {
    document.getElementById('resultsSection').style.display = 'none';
  },

  showError(msg) {
    const box = document.getElementById('errorBox');
    document.getElementById('errorText').textContent = msg;
    box.style.display = 'flex';
  },

  hideError() {
    document.getElementById('errorBox').style.display = 'none';
  },

  // ========== SHARING ==========
  openShare() {
    if (!this.lastResult) return;
    const modal = document.getElementById('shareModal');
    const preview = document.getElementById('sharePreview');
    const r = this.lastResult;
    const isAR = document.documentElement.lang === 'ar';

    preview.innerHTML = `
      <div class="share-preview-title">⚡ ${t('shareTextHeader')}</div>
      <div class="sp-grade">${r.grade}</div>
      <div class="sp-metric"><span>${t('shareTextDown')}</span><span class="tabular-nums">${formatNumber(r.download)} Mbps</span></div>
      <div class="sp-metric"><span>${t('shareTextUp')}</span><span class="tabular-nums">${formatNumber(r.upload)} Mbps</span></div>
      <div class="sp-metric"><span>${t('shareTextPing')}</span><span class="tabular-nums">${formatNumber(r.ping, 0)} ms</span></div>
      <div class="sp-metric"><span>${t('shareTextJitter')}</span><span class="tabular-nums">${formatNumber(r.jitter, 1)} ms</span></div>
      <div class="sp-brand">${t('shareTextFooter')}</div>
    `;
    modal.style.display = 'flex';
  },

  getShareText() {
    if (!this.lastResult) return '';
    const r = this.lastResult;
    const isAR = document.documentElement.lang === 'ar';
    const sep = '─'.repeat(16);
    return `${t('shareTextHeader')}\n${sep}\n${t('shareTextDown')}: ${formatNumber(r.download)} Mbps\n${t('shareTextUp')}: ${formatNumber(r.upload)} Mbps\n${t('shareTextPing')}: ${formatNumber(r.ping, 0)} ms\n${t('shareTextJitter')}: ${formatNumber(r.jitter, 1)} ms\n${t('shareTextGrade')}: ${r.grade}\n${sep}\n${t('shareTextFooter')}`;
  },

  shareNative() {
    const text = this.getShareText();
    if (navigator.share) {
      navigator.share({ title: 'SpeedCheck', text }).catch(() => {});
    } else {
      this.shareCopy();
    }
    document.getElementById('shareModal').style.display = 'none';
  },

  shareCopy() {
    const text = this.getShareText();
    navigator.clipboard.writeText(text).then(() => {
      showToast(t('copied'));
    }).catch(() => {});
    document.getElementById('shareModal').style.display = 'none';
  },

  shareImage() {
    if (!this.lastResult) return;
    const r = this.lastResult;
    const w = 600, h = 400;
    const canvas = document.createElement('canvas');
    canvas.width = w * 2;
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Accent bar
    const accentGrad = ctx.createLinearGradient(0, 0, w, 0);
    accentGrad.addColorStop(0, '#6366f1');
    accentGrad.addColorStop(1, '#8b5cf6');
    ctx.fillStyle = accentGrad;
    ctx.fillRect(0, 0, w, 4);

    // Title
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 28px Tajawal, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚡ SpeedCheck | فحص السرعة', w / 2, 50);

    // Grade badge
    const gradeColors = { 'A+': '#f59e0b', 'A': '#10b981', 'B': '#6366f1', 'C': '#f59e0b', 'D': '#ef4444', 'F': '#ef4444' };
    ctx.fillStyle = gradeColors[r.grade] || '#6366f1';
    ctx.beginPath();
    ctx.arc(w / 2, 120, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText(r.grade, w / 2, 138);

    // Metrics
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillStyle = '#818cf8';
    ctx.fillText(`↓ ${formatNumber(r.download)}`, w / 2 - 100, 230);
    ctx.fillStyle = '#a78bfa';
    ctx.fillText(`↑ ${formatNumber(r.upload)}`, w / 2 + 100, 230);

    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Mbps', w / 2 - 100, 255);
    ctx.fillText('Mbps', w / 2 + 100, 255);

    ctx.font = '20px system-ui, sans-serif';
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(`${formatNumber(r.ping, 0)} ms ping · ${formatNumber(r.jitter, 1)} ms jitter`, w / 2, 300);

    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#64748b';
    const date = new Date().toLocaleString(document.documentElement.lang === 'ar' ? 'ar-SA' : 'en-US');
    ctx.fillText(date, w / 2, 360);
    ctx.fillText('speedcheck.app', w / 2, 380);

    // Download
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `speedcheck-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(t('saved'));
    });
    document.getElementById('shareModal').style.display = 'none';
  },

  // ========== CONFETTI ==========
  launchConfetti() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    const container = document.getElementById('confettiContainer');
    const colors = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#f1f5f9'];
    for (let i = 0; i < 60; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      el.style.right = Math.random() * 100 + '%';
      el.style.animationDelay = Math.random() * 0.5 + 's';
      el.style.animationDuration = (2 + Math.random() * 2) + 's';
      el.style.width = (6 + Math.random() * 6) + 'px';
      el.style.height = (6 + Math.random() * 6) + 'px';
      el.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      container.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }
  },

  announce(text) {
    let live = document.getElementById('sr-announce');
    if (!live) {
      live = document.createElement('div');
      live.id = 'sr-announce';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');
      live.style.position = 'absolute';
      live.style.left = '-10000px';
      live.style.width = '1px';
      live.style.height = '1px';
      live.style.overflow = 'hidden';
      document.body.appendChild(live);
    }
    live.textContent = text;
  }
};

// Toast helper
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

// Close modals on backdrop click
document.querySelectorAll('.modal .modal-backdrop').forEach(b => {
  b.addEventListener('click', (e) => {
    if (e.target === b) {
      b.closest('.modal').style.display = 'none';
    }
  });
});

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
