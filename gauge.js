// SVG Gauge with logarithmic scale
const Gauge = {
  el: null,
  arc: null,
  pulse: null,
  ticks: null,
  value: 0,
  animating: false,

  // Ticks at 0, 25, 50, 100, 250, 500, 1000 Mbps
  TICK_VALUES: [0, 25, 50, 100, 250, 500, 1000],

  init() {
    this.el = document.getElementById('gauge');
    this.arc = document.getElementById('gaugeArc');
    this.pulse = document.getElementById('gaugePulse');
    this.ticks = document.getElementById('gaugeTicks');
    this.drawTicks();
  },

  // Convert Mbps to log scale ratio (0 to 1)
  mbpsToRatio(mbps) {
    if (mbps <= 0) return 0;
    if (mbps >= 1000) return 1;
    // Log scale: ln(1+x)/ln(1001) maps 0-1000 to 0-1
    return Math.log10(1 + mbps) / Math.log10(1 + 1000);
  },

  drawTicks() {
    if (!this.ticks) return;
    const cx = 150, cy = 150, r = 125;
    const totalAngle = 270; // 270 degree arc (from 135deg to 405deg)
    const startAngle = 135;
    let html = '';
    this.TICK_VALUES.forEach((val, i) => {
      const ratio = this.mbpsToRatio(val);
      const angleDeg = startAngle + ratio * totalAngle;
      const angle = (angleDeg * Math.PI) / 180;
      const x1 = cx + (r - 8) * Math.cos(angle);
      const y1 = cy + (r - 8) * Math.sin(angle);
      const x2 = cx + (r + 4) * Math.cos(angle);
      const y2 = cy + (r + 4) * Math.sin(angle);
      const bigTick = i === 0 || i === this.TICK_VALUES.length - 1 || val % 100 === 0 || val === 25 || val === 50 || val === 250 || val === 500;
      const sw = bigTick ? 2.5 : 1;
      const len = bigTick ? 12 : 6;
      const tx1 = cx + (r - len - 4) * Math.cos(angle);
      const ty1 = cy + (r - len - 4) * Math.sin(angle);
      const tx2 = cx + (r + 6) * Math.cos(angle);
      const ty2 = cy + (r + 6) * Math.sin(angle);
      html += `<line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" stroke-width="${sw}" stroke="${bigTick ? 'rgba(241,245,249,.3)' : 'rgba(241,245,249,.15)'}"/>`;
    });
    this.ticks.innerHTML = html;
  },

  // Set gauge value directly in Mbps
  setSpeed(mbps) {
    const ratio = this.mbpsToRatio(mbps);
    // Circumference of circle r=125 is 2*pi*125 ≈ 785.4
    const circumference = 2 * Math.PI * 125;
    // We use 270 degrees (75% of circle) for the arc
    const arcLen = ratio * circumference * 0.75;
    this.arc.style.strokeDasharray = `${arcLen} ${circumference}`;
  },

  setActive(active) {
    if (this.pulse) {
      this.pulse.style.opacity = active ? '1' : '0';
    }
    if (active) {
      this.arc.setAttribute('filter', 'url(#glow)');
    } else {
      this.arc.removeAttribute('filter');
    }
  },

  reset() {
    this.setSpeed(0);
    this.value = 0;
  },

  // Animate to target value
  animateTo(targetMbs, duration = 300) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.setSpeed(targetMbs);
      return;
    }
    const start = this.value;
    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = start + (targetMbs - start) * eased;
      this.setSpeed(current);
      this.value = current;
      if (t < 1) requestAnimationFrame(step);
      else {
        this.value = targetMbs;
        this.setSpeed(targetMbs);
      }
    };
    requestAnimationFrame(step);
  }
};
