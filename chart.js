// Real-time smooth line chart for speed measurements
const SpeedChart = {
  canvas: null,
  ctx: null,
  downData: [],
  upData: [],
  maxPoints: 60, // ~12 seconds at 200ms per point
  animId: null,

  init() {
    this.canvas = document.getElementById('speedChart');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.draw();
  },

  reset() {
    this.downData = [];
    this.upData = [];
    this.draw();
  },

  addPoint(downVal, upVal) {
    this.downData.push(downVal || 0);
    this.upData.push(upVal || 0);
    if (this.downData.length > this.maxPoints) this.downData.shift();
    if (this.upData.length > this.maxPoints) this.upData.shift();
    this.draw();
  },

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 10, right: 10, bottom: 20, left: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Find max value for scaling (at least 100 Mbps)
    const allVals = [...this.downData, ...this.upData, 50];
    const rawMax = Math.max(...allVals);
    const maxVal = Math.max(100, Math.ceil(rawMax / 50) * 50);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Draw zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    ctx.lineTo(w - pad.right, pad.top + plotH);
    ctx.stroke();

    // Helper to draw line + gradient fill
    const drawLine = (data, color1, color2) => {
      if (data.length < 1) return;
      const pts = data.map((v, i) => {
        const x = pad.left + (i / (this.maxPoints - 1)) * plotW;
        const y = pad.top + plotH - (Math.min(v, maxVal) / maxVal) * plotH;
        return { x, y };
      });

      // Smooth curve (catmull-rom to bezier)
      if (pts.length >= 2) {
        // Gradient fill
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, color1 + '40');
        grad.addColorStop(1, color1 + '00');
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pad.top + plotH);
        ctx.lineTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] || pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] || p2;
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        ctx.lineTo(pts[pts.length - 1].x, pad.top + plotH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Stroke line
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i - 1] || pts[i];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          const p3 = pts[i + 2] || p2;
          const cp1x = p1.x + (p2.x - p0.x) / 6;
          const cp1y = p1.y + (p2.y - p0.y) / 6;
          const cp2x = p2.x - (p3.x - p1.x) / 6;
          const cp2y = p2.y - (p3.y - p1.y) / 6;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        ctx.strokeStyle = color2;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Glow effect on last point
        const last = pts[pts.length - 1];
        ctx.beginPath();
        ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color2;
        ctx.shadowColor = color2;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    drawLine(this.upData, '#8b5cf6', '#a78bfa');
    drawLine(this.downData, '#6366f1', '#818cf8');

    // Y-axis label (max)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal) + ' Mbps', w - 2, pad.top + 10);
  }
};
