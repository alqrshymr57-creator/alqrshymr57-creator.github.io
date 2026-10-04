// PWA: Service Worker, Install Banner, Offline
const PWA = {
  deferredPrompt: null,
  swRegistered: false,

  init() {
    this.registerSW();
    this.handleInstall();
    this.handleOnline();
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          this.swRegistered = true;
          // Check for updates
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available
                if (confirm(document.documentElement.lang === 'ar' ? 'نسخة جديدة متاحة — إعادة تحميل؟' : 'New version available — reload?')) {
                  window.location.reload();
                }
              }
            });
          });
        }).catch(() => {});
      });
    }
  },

  handleInstall() {
    const banner = document.getElementById('installBanner');
    const installBtn = document.getElementById('installBtn');
    const installNowBtn = document.getElementById('installNowBtn');
    const installClose = document.getElementById('installClose');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      // Show in nav immediately
      if (installBtn) installBtn.style.display = 'flex';
      // Show banner after 10 seconds
      setTimeout(() => {
        if (this.deferredPrompt && !window.matchMedia('(display-mode: standalone)').matches) {
          banner.style.display = 'block';
        }
      }, 10000);
    });

    const install = async () => {
      if (!this.deferredPrompt) {
        // iOS: show instructions
        this.showIOSInstallHelp();
        return;
      }
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        banner.style.display = 'none';
        installBtn.style.display = 'none';
      }
      this.deferredPrompt = null;
    };

    installBtn?.addEventListener('click', install);
    installNowBtn?.addEventListener('click', install);
    installClose?.addEventListener('click', () => {
      banner.style.display = 'none';
    });

    window.addEventListener('appinstalled', () => {
      banner.style.display = 'none';
      installBtn.style.display = 'none';
      this.deferredPrompt = null;
    });

    // Detect iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && !window.matchMedia('(display-mode: standalone)').matches) {
      setTimeout(() => {
        installBtn.style.display = 'flex';
      }, 5000);
    }
  },

  showIOSInstallHelp() {
    const isAR = document.documentElement.lang === 'ar';
    alert(isAR
      ? 'للتثبيت على iOS:\nاضغط على زر المشاركة في Safari ⬆️\nثم "أضف إلى الشاشة الرئيسية"'
      : 'To install on iOS:\nTap the Share button in Safari ⬆️\nthen "Add to Home Screen"');
  },

  handleOnline() {
    const indicator = document.getElementById('offlineIndicator');
    const update = () => {
      if (!navigator.onLine) {
        indicator.style.display = 'flex';
      } else {
        indicator.style.display = 'none';
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }
};
