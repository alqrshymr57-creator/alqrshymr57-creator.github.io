// History panel, comparison, and analytics
const HistoryUI = {
  panel: null,
  list: null,
  selectedForCompare: new Set(),

  init() {
    this.panel = document.getElementById('historyPanel');
    this.list = document.getElementById('historyList');
    this.attachEvents();
  },

  attachEvents() {
    document.getElementById('historyBtn')?.addEventListener('click', () => this.open());
    document.getElementById('historySort')?.addEventListener('change', () => this.render());
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => this.exportCSV());
    document.getElementById('clearHistoryBtn')?.addEventListener('click', () => this.clearAll());
    document.querySelectorAll('[data-close-panel]').forEach(btn => {
      btn.addEventListener('click', () => this.closeAll());
    });
    document.getElementById('panelOverlay')?.addEventListener('click', () => this.closeAll());
    document.getElementById('compareBtn')?.addEventListener('click', () => this.openCompare());
    document.getElementById('analyticsBtn')?.addEventListener('click', () => this.openAnalytics());
  },

  open() {
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    this.panel.classList.add('open');
    this.panel.setAttribute('aria-hidden', 'false');
    document.getElementById('panelOverlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    this.render();
  },

  closeAll() {
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('panelOverlay').style.display = 'none';
    document.body.style.overflow = '';
  },

  getSortedHistory() {
    const history = Storage.getHistory();
    const sort = document.getElementById('historySort')?.value || 'date';
    return [...history].sort((a, b) => {
      if (sort === 'download') return (b.download || 0) - (a.download || 0);
      if (sort === 'ping') return (a.ping || 999) - (b.ping || 999);
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  },

  render() {
    const history = this.getSortedHistory();
    if (!history.length) {
      this.list.innerHTML = `
        <div class="history-empty">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>${t('noHistory')}</p>
        </div>`;
      return;
    }
    this.list.innerHTML = history.map(r => this.renderItem(r)).join('');
    // Attach events
    this.list.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.hi-del')) return;
        if (this.selectedForCompare.size > 0) {
          this.toggleCompare(el.dataset.id);
        } else {
          el.querySelector('.hi-details')?.classList.toggle('open');
        }
      });
      const delBtn = el.querySelector('.hi-del');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Storage.deleteResult(el.dataset.id);
          this.render();
          showToast(t('deleted'));
        });
      }
    });
  },

  renderItem(r) {
    const date = new Date(r.timestamp);
    const dateStr = date.toLocaleString(document.documentElement.lang === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const gradeClass = `grade-${(r.grade || 'C').toLowerCase().replace('+', 'plus')}`;
    const isSelected = this.selectedForCompare.has(r.id);
    return `
      <div class="history-item ${isSelected ? 'selected' : ''}" data-id="${r.id}">
        <div class="hi-main">
          <div class="hi-speeds">
            <div class="hi-speed down">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/></svg>
              <span class="val tabular-nums">${formatNumber(r.download || 0)}</span>
            </div>
            <div class="hi-speed up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 21V9m0 0l-4 4m4-4l4 4"/></svg>
              <span class="val tabular-nums">${formatNumber(r.upload || 0)}</span>
            </div>
            <div class="hi-ping">
              <span class="val tabular-nums">${formatNumber(r.ping || 0, 0)}</span> ms
            </div>
          </div>
          <span class="hi-grade ${gradeClass}">${r.grade || '—'}</span>
        </div>
        <div class="hi-date">${dateStr}${r.isp ? ' · ' + r.isp : ''}${r.connection_type ? ' · ' + r.connection_type : ''}</div>
        <div class="hi-details">
          <div class="hi-detail-row"><span class="hi-detail-label">${t('jitter')}</span><span class="tabular-nums">${formatNumber(r.jitter || 0)} ms</span></div>
          ${r.packetLoss != null ? `<div class="hi-detail-row"><span class="hi-detail-label">${t('packetLoss')}</span><span class="tabular-nums">${formatNumber(r.packetLoss, 1)}%</span></div>` : ''}
          <div class="hi-actions">
            <button class="hi-del">🗑️ ${t('deleted')}</button>
          </div>
        </div>
      </div>`;
  },

  toggleCompare(id) {
    if (this.selectedForCompare.has(id)) {
      this.selectedForCompare.delete(id);
    } else {
      if (this.selectedForCompare.size >= 5) {
        showToast('Max 5 tests');
        return;
      }
      this.selectedForCompare.add(id);
    }
    this.renderComparePanel();
  },

  openCompare() {
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('comparePanel').classList.add('open');
    document.getElementById('comparePanel').setAttribute('aria-hidden', 'false');
    document.getElementById('panelOverlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    this.renderComparePanel();
  },

  renderComparePanel() {
    const history = Storage.getHistory();
    const list = document.getElementById('compareList');
    const results = document.getElementById('compareResults');
    const empty = document.getElementById('compareEmpty');

    list.innerHTML = history.slice(0, 50).map(r => {
      const sel = this.selectedForCompare.has(r.id);
      const date = new Date(r.timestamp).toLocaleDateString();
      return `
        <div class="compare-item ${sel ? 'selected' : ''}" data-id="${r.id}">
          <div class="ci-check">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-weight:600">
              <span style="color:#6366f1">↓${formatNumber(r.download || 0)}</span>
              &nbsp;·&nbsp;
              <span style="color:#8b5cf6">↑${formatNumber(r.upload || 0)}</span>
              &nbsp;·&nbsp;
              <span>${formatNumber(r.ping || 0, 0)}ms</span>
            </div>
            <div style="font-size:.75rem;color:var(--text-muted)">${date}</div>
          </div>
          <span class="hi-grade grade-${(r.grade || 'C').toLowerCase().replace('+', 'plus')}">${r.grade || '—'}</span>
        </div>`;
    }).join('');

    list.querySelectorAll('.compare-item').forEach(el => {
      el.addEventListener('click', () => this.toggleCompare(el.dataset.id));
    });

    const selected = history.filter(r => this.selectedForCompare.has(r.id));
    if (selected.length >= 2) {
      empty.style.display = 'none';
      results.style.display = 'block';
      this.renderCompareResults(selected);
    } else {
      empty.style.display = 'block';
      results.style.display = 'none';
    }
  },

  renderCompareResults(tests) {
    const metrics = [
      { key: 'download', label: t('download'), higher: true, unit: ' Mbps' },
      { key: 'upload', label: t('upload'), higher: true, unit: ' Mbps' },
      { key: 'ping', label: t('ping'), higher: false, unit: ' ms' },
      { key: 'jitter', label: t('jitter'), higher: false, unit: ' ms' },
    ];
    const results = document.getElementById('compareResults');

    let html = '';
    // Determine overall best
    let bestIdx = 0;
    let bestScore = -Infinity;
    tests.forEach((tst, i) => {
      // Score: normalize download, upload (higher), ping, jitter (lower)
      const score = (tst.download || 0) / 100 + (tst.upload || 0) / 20 - (tst.ping || 100) / 50 - (tst.jitter || 50) / 20;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });

    metrics.forEach(m => {
      const values = tests.map(t => t[m.key] || 0);
      const best = m.higher ? Math.max(...values) : Math.min(...values);
      html += `<div class="compare-row">
        <div style="font-size:.8125rem;color:var(--text-muted);margin-bottom:6px;font-weight:600">${m.label}</div>
        <div class="compare-cells" style="grid-template-columns:repeat(${tests.length},1fr);display:grid">`;
      tests.forEach((tst, i) => {
        const val = tst[m.key] || 0;
        const isBest = Math.abs(val - best) < 0.01;
        html += `<div class="compare-cell ${isBest ? 'winner' : ''}">
          <div class="cc-val tabular-nums">${formatNumber(val, m.key === 'ping' || m.key === 'jitter' ? 0 : 1)}${m.unit}</div>
          <div class="cc-label">${new Date(tst.timestamp).toLocaleDateString()}</div>
          ${isBest ? '<div class="winner-badge">' + t('bestOverall') + '</div>' : ''}
        </div>`;
      });
      html += '</div></div>';
    });

    // Download speed bar chart
    const maxDown = Math.max(...tests.map(t => t.download || 0), 10);
    html += `<div class="compare-row">
      <div style="font-size:.8125rem;color:var(--text-muted);margin-bottom:6px;font-weight:600">${t('download')}</div>
      <div style="display:flex;flex-direction:column;gap:8px">`;
    tests.forEach(tst => {
      const pct = ((tst.download || 0) / maxDown * 100);
      html += `<div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:24px;background:rgba(255,255,255,.05);border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:6px;transition:width .5s"></div>
        </div>
        <span class="tabular-nums" style="font-weight:700;min-width:60px;text-align:end">${formatNumber(tst.download || 0)}</span>
      </div>`;
    });
    html += '</div></div>';

    results.innerHTML = html;
  },

  openAnalytics() {
    document.querySelectorAll('.panel').forEach(p => {
      p.classList.remove('open');
      p.setAttribute('aria-hidden', 'true');
    });
    document.getElementById('analyticsPanel').classList.add('open');
    document.getElementById('analyticsPanel').setAttribute('aria-hidden', 'false');
    document.getElementById('panelOverlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    this.renderAnalytics();
  },

  renderAnalytics() {
    const container = document.getElementById('analyticsContent');
    const history = Storage.getHistory();
    if (history.length < 2) {
      container.innerHTML = `<div class="history-empty"><p style="color:var(--text-muted);padding:48px 24px;text-align:center" data-i18n="noHistory">${t('noHistory')}</p></div>`;
      return;
    }

    // By hour of day
    const byHour = Array.from({ length: 24 }, () => ({ down: 0, count: 0 }));
    // By day of week (0=Sun)
    const byDay = Array.from({ length: 7 }, () => ({ down: 0, count: 0 }));
    // By date for last 30 days
    const last30 = {};

    history.forEach(r => {
      const d = new Date(r.timestamp);
      byHour[d.getHours()].down += r.download || 0;
      byHour[d.getHours()].count++;
      byDay[d.getDay()].down += r.download || 0;
      byDay[d.getDay()].count++;
      const dateKey = d.toISOString().slice(0, 10);
      const daysAgo = (Date.now() - d.getTime()) / 86400000;
      if (daysAgo <= 30) {
        if (!last30[dateKey]) last30[dateKey] = { down: 0, count: 0 };
        last30[dateKey].down += r.download || 0;
        last30[dateKey].count++;
      }
    });

    const hourAvgs = byHour.map(h => h.count > 0 ? h.down / h.count : 0);
    const dayAvgs = byDay.map(d => d.count > 0 ? d.down / d.count : 0);
    const maxHour = Math.max(...hourAvgs.filter(v => v > 0), 10);
    const maxDay = Math.max(...dayAvgs.filter(v => v > 0), 10);

    const dayNames = document.documentElement.lang === 'ar'
      ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Insights
    const insights = [];
    const validHours = hourAvgs.map((v, i) => ({ v, i })).filter(h => h.v > 0);
    if (validHours.length >= 4) {
      const best = validHours.reduce((a, b) => a.v > b.v ? a : b);
      const worst = validHours.reduce((a, b) => a.v < b.v ? a : b);
      if (best.v > worst.v * 1.2) {
        const bestHour12 = best.i % 12 || 12;
        const period = best.i < 12 ? (document.documentElement.lang === 'ar' ? 'صباحاً' : 'AM') : (document.documentElement.lang === 'ar' ? 'مساءً' : 'PM');
        const diff = Math.round((best.v - worst.v) / worst.v * 100);
        insights.push(document.documentElement.lang === 'ar'
          ? `سرعة التحميل أسرع بنسبة ${diff}% حوالي الساعة ${bestHour12} ${period}`
          : `Downloads are ${diff}% faster around ${bestHour12}${period}`);
      }
    }
    const validDays = dayAvgs.map((v, i) => ({ v, i })).filter(d => d.v > 0);
    if (validDays.length >= 3) {
      const worstDay = validDays.reduce((a, b) => a.v < b.v ? a : b);
      insights.push(document.documentElement.lang === 'ar'
        ? `أبطأ يوم في الأسبوع هو ${dayNames[worstDay.i]}`
        : `Slowest day is ${dayNames[worstDay.i]}`);
    }

    const hourLabels = document.documentElement.lang === 'ar'
      ? ['١٢','','','٣','','','٦','','','٩','','']
      : ['12','','','3','','','6','','','9','',''];

    container.innerHTML = `
      <div class="analytics-section">
        <h3>${t('analyticsByHour')}</h3>
        <div class="analytics-bars">
          ${hourAvgs.map(v => `<div class="analytics-bar" style="height:${Math.max(4, (v / maxHour) * 100)}%" title="${formatNumber(v)} Mbps"></div>`).join('')}
        </div>
        <div class="analytics-labels">
          ${Array.from({length:12}, (_,i) => `<span>${i%3===0?hourLabels[i]:''}</span>`).join('')}
        </div>
      </div>
      <div class="analytics-section">
        <h3>${t('analyticsByDay')}</h3>
        <div class="analytics-bars">
          ${dayAvgs.map((v, i) => `<div class="analytics-bar" style="height:${Math.max(4, (v / maxDay) * 100)}%;flex:1" title="${dayNames[i]}: ${formatNumber(v)} Mbps"></div>`).join('')}
        </div>
        <div class="analytics-labels">
          ${dayNames.map(n => `<span>${n}</span>`).join('')}
        </div>
      </div>
      ${insights.length ? `
      <div class="analytics-section">
        <h3>${t('analyticsInsights')}</h3>
        <div class="analytics-insights">
          ${insights.map(i => `<div class="insight-item">💡 ${i}</div>`).join('')}
        </div>
      </div>` : ''}
    `;
  },

  exportCSV() {
    const csv = Storage.exportCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speedcheck-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('exported'));
  },

  clearAll() {
    if (confirm(document.documentElement.lang === 'ar' ? 'هل أنت متأكد من مسح جميع الاختبارات؟' : 'Clear all test history?')) {
      Storage.clearHistory();
      this.render();
      showToast(t('cleared'));
    }
  }
};
