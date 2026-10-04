// Real speed test engine using Cloudflare's public endpoints
// All measurements are honest — no fake numbers.
const SpeedTest = {
  running: false,
  cancelled: false,
  state: 'idle', // idle | ping | download | upload | done | error
  results: null,
  onProgress: null,
  onPhaseChange: null,
  onComplete: null,
  onError: null,
  controller: null,

  DOWNLOAD_BYTES: 25000000, // 25 MB
  UPLOAD_BYTES: 5000000,    // 5 MB
  PING_SAMPLES: 10,
  PING_TIMEOUT: 3000,
  PHASE_DURATIONS: { ping: 2000, download: 6000, upload: 6000 },

  init() {
    this.results = this.emptyResults();
  },

  emptyResults() {
    return {
      download: 0,
      upload: 0,
      ping: 0,
      jitter: 0,
      packetLoss: 0,
      pingSamples: [],
      downSpeeds: [],
      upSpeeds: [],
      pingMin: 0,
      pingMax: 0,
      pingStdDev: 0,
      downStability: 0,
      upStability: 0,
      partial: false,
      error: null
    };
  },

  async start() {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    this.results = this.emptyResults();
    this.controller = new AbortController();

    try {
      // Check online status
      if (!navigator.onLine) {
        throw new Error('offline');
      }

      // Phase 1: Ping
      this.setPhase('ping');
      await this.measurePing();
      if (this.cancelled) return this.cancelCleanup();

      // Phase 2: Download
      this.setPhase('download');
      await this.measureDownload();
      if (this.cancelled) return this.cancelCleanup();

      // Phase 3: Upload
      this.setPhase('upload');
      await this.measureUpload();
      if (this.cancelled) return this.cancelCleanup();

      // Done
      this.setPhase('done');
      this.computeAdvancedMetrics();
      this.running = false;
      if (this.onComplete) this.onComplete({ ...this.results });
    } catch (err) {
      if (this.cancelled) return this.cancelCleanup();
      this.running = false;
      this.state = 'error';
      this.results.error = err.message;
      if (this.onError) this.onError(err.message);
    }
  },

  cancel() {
    if (!this.running) return;
    this.cancelled = true;
    if (this.controller) this.controller.abort();
  },

  cancelCleanup() {
    this.running = false;
    this.results.partial = true;
    this.state = 'cancelled';
    this.setPhase('done');
    this.computeAdvancedMetrics();
    if (this.onComplete) this.onComplete({ ...this.results });
  },

  setPhase(phase) {
    this.state = phase;
    if (this.onPhaseChange) this.onPhaseChange(phase);
  },

  emitProgress(metric, value) {
    if (this.onProgress) this.onProgress(metric, value);
  },

  // ========== PING MEASUREMENT ==========
  async measurePing() {
    const samples = [];
    let failures = 0;
    const startAll = performance.now();
    const timeoutMs = this.PING_TIMEOUT;
    const totalDuration = this.PHASE_DURATIONS.ping;

    for (let i = 0; i < this.PING_SAMPLES; i++) {
      if (this.cancelled) return;

      // Don't exceed phase duration
      if (performance.now() - startAll > totalDuration) break;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const t0 = performance.now();
        // Use __down?bytes=1 for quick ping measurement
        await fetch('https://speed.cloudflare.com/__down?bytes=1', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
          mode: 'cors'
        });
        const elapsed = performance.now() - t0;
        clearTimeout(timer);
        samples.push(elapsed);
        this.results.pingSamples = [...samples];

        // Live ping: running average
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        this.results.ping = avg;
        // Jitter: mean deviation from previous sample
        if (samples.length > 1) {
          const diffs = samples.slice(1).map((v, j) => Math.abs(v - samples[j]));
          this.results.jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        }
        this.emitProgress('ping', avg);
        this.emitProgress('jitter', this.results.jitter);

        // Small delay between pings to avoid overwhelming
        await this.sleep(Math.max(0, (totalDuration / this.PING_SAMPLES) - elapsed));
      } catch (e) {
        failures++;
        if (e.name === 'AbortError') {
          // Timeout
        }
      }
    }

    if (samples.length === 0) {
      throw new Error('pingFailed');
    }

    this.results.packetLoss = (failures / this.PING_SAMPLES) * 100;
    // Final ping = average of all samples after trimming outliers
    const sorted = [...samples].sort((a, b) => a - b);
    // Trim 10% from each end
    const trim = Math.floor(sorted.length * 0.1);
    const trimmed = trim > 0 ? sorted.slice(trim, -trim) : sorted;
    this.results.ping = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  },

  // ========== DOWNLOAD MEASUREMENT ==========
  async measureDownload() {
    return new Promise(async (resolve, reject) => {
      try {
        const url = `https://speed.cloudflare.com/__down?bytes=${this.DOWN_BYTES}`;
        const response = await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          signal: this.controller.signal,
          mode: 'cors'
        });

        if (!response.ok || !response.body) {
          reject(new Error('downloadFailed'));
          return;
        }

        const reader = response.body.getReader();
        const startTime = performance.now();
        let totalBytes = 0;
        let lastReportTime = startTime;
        let lastReportBytes = 0;
        const samples = [];
        let chunkCount = 0;
        let totalChunksForStability = 0;
        const phaseStart = performance.now();
        const maxPhaseDuration = this.PHASE_DURATIONS.download;

        // Read chunks and measure throughput
        const processChunk = async () => {
          if (this.cancelled) {
            reader.cancel();
            resolve();
            return;
          }
          try {
            const { done, value } = await reader.read();
            if (done) {
              // Final calculation (entire transfer)
              const totalDuration = (performance.now() - startTime) / 1000;
              if (totalDuration > 0 && totalBytes > 0) {
                // bits per second / 1,000,000 = Mbps (decimal, per industry standard)
                const finalMbps = (totalBytes * 8) / totalDuration / 1000000;
                samples.push(finalMbps);
                this.results.download = this.calculateWeightedAverage(samples);
                this.results.downSpeeds = samples;
                this.emitProgress('download', this.results.download);
              }
              resolve();
              return;
            }

            totalBytes += value.length;
            chunkCount++;
            totalChunksForStability++;
            const now = performance.now();
            const elapsed = (now - startTime) / 1000;
            const chunkTime = now - lastReportTime;

            // Report every 100ms for smooth updates
            if (chunkTime >= 100) {
              const chunkBytes = totalBytes - lastReportBytes;
              const instantMbps = (chunkBytes * 8) / (chunkTime / 1000) / 1000000;
              const overallMbps = (totalBytes * 8) / elapsed / 1000000;

              // Use a smoothed version for display
              const smoothMbps = this.smooth(samples.length > 0 ? samples[samples.length - 1] : overallMbps, overallMbps, 0.3);
              samples.push(smoothMbps);
              this.results.downSpeeds = samples.slice(-20);

              // Use weighted average favoring more recent (steady-state)
              this.results.download = this.calculateWeightedAverage(samples);
              this.emitProgress('download', this.results.download);
              SpeedChart.addPoint(this.results.download, this.results.upload);

              lastReportTime = now;
              lastReportBytes = totalBytes;
            }

            // Check phase timeout (max duration)
            if (now - phaseStart > maxPhaseDuration) {
              // Enough data, finalize
              reader.cancel();
              const totalDuration = (now - startTime) / 1000;
              const finalMbps = (totalBytes * 8) / totalDuration / 1000000;
              samples.push(finalMbps);
              this.results.download = this.calculateWeightedAverage(samples);
              this.results.downSpeeds = samples;
              this.emitProgress('download', this.results.download);
              resolve();
              return;
            }

            processChunk();
          } catch (e) {
            if (e.name === 'AbortError' || this.cancelled) {
              resolve();
            } else {
              reject(e);
            }
          }
        };

        processChunk();
      } catch (e) {
        if (e.name === 'AbortError' && this.cancelled) {
          resolve();
        } else {
          reject(new Error('downloadFailed'));
        }
      }
    });
  },

  // ========== UPLOAD MEASUREMENT ==========
  async measureUpload() {
    return new Promise(async (resolve, reject) => {
      try {
        // Create non-compressible random data blob for upload
        // Use crypto.getRandomValues for proper entropy (prevents compression skewing results)
        const data = new Uint8Array(this.UPLOAD_BYTES);
        if (window.crypto?.getRandomValues) {
          // Fill in chunks of 65536 (max for crypto.getRandomValues)
          for (let offset = 0; offset < data.length; offset += 65536) {
            const chunkSize = Math.min(65536, data.length - offset);
            crypto.getRandomValues(data.subarray(offset, offset + chunkSize));
          }
        } else {
          for (let i = 0; i < data.length; i++) {
            data[i] = Math.floor(Math.random() * 256);
          }
        }
        const blob = new Blob([data], { type: 'application/octet-stream' });

        const startTime = performance.now();
        const samples = [];
        const phaseStart = performance.now();
        const maxPhaseDuration = this.PHASE_DURATIONS.upload;

        // We do multiple sequential uploads of smaller chunks to get real-time updates
        const chunkSize = 250000; // 250KB chunks for live updates
        let totalUploaded = 0;
        let lastReportTime = startTime;
        let lastReportBytes = 0;

        const uploadChunk = async () => {
          if (this.cancelled) {
            resolve();
            return;
          }
          const now = performance.now();
          if (now - phaseStart > maxPhaseDuration) {
            // Time to finalize
            if (totalUploaded > 0) {
              const totalDur = (now - startTime) / 1000;
              const finalMbps = (totalUploaded * 8) / totalDur / 1000000;
              samples.push(finalMbps);
              this.results.upload = this.calculateWeightedAverage(samples);
              this.results.upSpeeds = samples;
              this.emitProgress('upload', this.results.upload);
            }
            resolve();
            return;
          }

          const remaining = this.UPLOAD_BYTES - totalUploaded;
          if (remaining <= 0) {
            const totalDur = (now - startTime) / 1000;
            const finalMbps = (totalUploaded * 8) / totalDur / 1000000;
            samples.push(finalMbps);
            this.results.upload = this.calculateWeightedAverage(samples);
            this.results.upSpeeds = samples;
            this.emitProgress('upload', this.results.upload);
            resolve();
            return;
          }

          const sendSize = Math.min(chunkSize, remaining);
          const chunk = blob.slice(totalUploaded, totalUploaded + sendSize);

          try {
            const chunkStart = performance.now();
            await fetch('https://speed.cloudflare.com/__up', {
              method: 'POST',
              body: chunk,
              cache: 'no-store',
              signal: this.controller.signal,
              mode: 'cors',
              headers: { 'Content-Type': 'application/octet-stream' }
            });
            const chunkEnd = performance.now();
            totalUploaded += sendSize;

            const elapsed = (chunkEnd - startTime) / 1000;
            const chunkTime = chunkEnd - lastReportTime;

            if (chunkTime >= 100) {
              const instantMbps = (sendSize * 8) / ((chunkEnd - chunkStart) / 1000) / 1000000;
              const overallMbps = (totalUploaded * 8) / elapsed / 1000000;
              const smoothMbps = this.smooth(samples.length > 0 ? samples[samples.length - 1] : overallMbps, overallMbps, 0.3);
              samples.push(smoothMbps);
              this.results.upSpeeds = samples.slice(-20);
              this.results.upload = this.calculateWeightedAverage(samples);
              this.emitProgress('upload', this.results.upload);
              SpeedChart.addPoint(this.results.download, this.results.upload);
              lastReportTime = chunkEnd;
              lastReportBytes = totalUploaded;
            }

            uploadChunk();
          } catch (e) {
            if (e.name === 'AbortError' || this.cancelled) {
              resolve();
            } else if (totalUploaded > 0) {
              // Partial upload — use what we have
              const totalDur = (performance.now() - startTime) / 1000;
              const finalMbps = (totalUploaded * 8) / totalDur / 1000000;
              this.results.upload = finalMbps;
              resolve();
            } else {
              reject(new Error('uploadFailed'));
            }
          }
        };

        uploadChunk();
      } catch (e) {
        if (e.name === 'AbortError' && this.cancelled) {
          resolve();
        } else {
          reject(new Error('uploadFailed'));
        }
      }
    });
  },

  // ========== HELPERS ==========
  calculateWeightedAverage(samples) {
    if (!samples.length) return 0;
    // Use the last 60% of samples (steady state) with higher weight
    const steadyStart = Math.floor(samples.length * 0.4);
    const steady = samples.slice(steadyStart);
    // Remove top and bottom 10% outliers from steady state
    const sorted = [...steady].sort((a, b) => a - b);
    const trim = Math.max(1, Math.floor(sorted.length * 0.1));
    const trimmed = sorted.length > trim * 2 ? sorted.slice(trim, -trim) : sorted;
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  },

  smooth(prev, curr, factor) {
    return prev * factor + curr * (1 - factor);
  },

  computeAdvancedMetrics() {
    const pings = this.results.pingSamples;
    if (pings.length > 0) {
      this.results.pingMin = Math.min(...pings);
      this.results.pingMax = Math.max(...pings);
      const mean = this.results.ping;
      const variance = pings.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / pings.length;
      this.results.pingStdDev = Math.sqrt(variance);
    }
    // Stability = coefficient of variation (lower = more stable)
    if (this.results.downSpeeds.length > 1) {
      const mean = this.results.downSpeeds.reduce((a, b) => a + b, 0) / this.results.downSpeeds.length;
      const std = Math.sqrt(this.results.downSpeeds.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / this.results.downSpeeds.length);
      this.results.downStability = mean > 0 ? (std / mean) * 100 : 0;
    }
    if (this.results.upSpeeds.length > 1) {
      const mean = this.results.upSpeeds.reduce((a, b) => a + b, 0) / this.results.upSpeeds.length;
      const std = Math.sqrt(this.results.upSpeeds.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / this.results.upSpeeds.length);
      this.results.upStability = mean > 0 ? (std / mean) * 100 : 0;
    }
  },

  sleep(ms) {
    return new Promise(r => setTimeout(r, Math.max(0, ms)));
  }
};
