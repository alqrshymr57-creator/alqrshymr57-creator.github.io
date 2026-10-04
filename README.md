# ⚡ فحص السرعة — SpeedCheck

A production-grade internet speed test web application with Arabic RTL support. Fast, honest, and ad-free.

## Features

- **Real speed measurements** using Cloudflare's public endpoints (no fake numbers)
- **Fast completion** in under 20 seconds (vs 45+ seconds for competitors)
- **No ads, no tracking, no unnecessary permissions**
- **Full PWA support** — installable, offline history viewing
- **Bilingual** — Arabic (RTL) with English toggle
- **Dark mode default** (light mode available)
- **User accounts** (optional) with sync across devices
- **Test history** stored locally (100 tests) or synced (unlimited)
- **Comparison mode** for comparing 2-5 tests
- **Analytics** with time-based insights
- **Share results** as text, image, or via native share
- **Advanced metrics** for network engineers (packet loss, jitter, stability)
- **Responsive** from 280px (Galaxy Fold) to 3840px (4K)

## Tech Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3)
- **Frontend**: Vanilla JavaScript (zero frameworks for maximum performance)
- **Auth**: JWT + bcrypt
- **PWA**: Service Worker with Cache-First strategy

## Quick Start

```bash
npm install
npm start
```

Then open http://localhost:3000

## API Endpoints

- `POST /api/auth/signup` — Create account
- `POST /api/auth/login` — Sign in
- `POST /api/results` — Save test result (auth required)
- `GET /api/results` — Get user history (auth required)
- `GET /api/share/:shareId` — View shared result
- `DELETE /api/results/:id` — Delete a result
- `DELETE /api/auth/account` — Delete account

## Measurement Methodology

- **Ping**: 10 sequential requests to Cloudflare edge, outliers trimmed
- **Download**: 25MB stream, real-time throughput calculation (decimal Mbps)
- **Upload**: 5MB of crypto-random data, chunked for live updates
- All measurements use bits/1,000,000 = Mbps (industry standard, not 1,048,576)

## Grading System

- **A+** (>200/50Mbps, <10ms ping): Excellent for all uses
- **A** (>100/25Mbps, <20ms ping): Excellent for streaming & gaming
- **B** (>50/10Mbps, <40ms ping): Good for general use
- **C** (>25/5Mbps, <70ms ping): Average
- **D** (>10/2Mbps, <150ms ping): Poor, browsing only
- **F**: Very poor

## License

MIT
