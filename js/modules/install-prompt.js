window.InstallPrompt = class InstallPrompt {
  constructor(bridge) {
    this.bridge = bridge;
    this._deferredPrompt = null;
    this._isInstalled = false;
    this._dismissedBanner = localStorage.getItem('fw-install-dismissed');
    this._init();
  }

  _init() {
    this._detectInstalled();
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._deferredPrompt = e;
      this._showBanner();
    });
    window.addEventListener('appinstalled', () => {
      this._isInstalled = true;
      this._deferredPrompt = null;
      this._hideBanner();
    });
  }

  isInstallable() {
    if (this._isInstalled) return false;
    if (!!this._deferredPrompt) return true;
    return this._isIOSWeb();
  }

  install() {
    if (this._deferredPrompt) {
      this._deferredPrompt.prompt();
      this._deferredPrompt.userChoice.then((result) => {
        if (result.outcome === 'accepted') {
          this._isInstalled = true;
          this._hideBanner();
        }
        this._deferredPrompt = null;
      });
    } else if (this._isIOSWeb()) {
      this._showIOSSheet();
    }
  }

  dismiss() {
    localStorage.setItem('fw-install-dismissed', '1');
    this._dismissedBanner = true;
    this._hideBanner();
  }

  _detectInstalled() {
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      this._isInstalled = true;
    }
  }

  _isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  _isIOSWeb() {
    return this._isIOS() && !window.navigator.standalone;
  }

  _showBanner() {
    if (this._isInstalled || this._dismissedBanner) return;
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    requestAnimationFrame(() => banner.classList.add('open'));
  }

  _hideBanner() {
    const banner = document.getElementById('install-banner');
    if (!banner) return;
    banner.classList.remove('open');
    banner.classList.add('hidden');
  }

  _showIOSSheet() {
    const sheet = document.getElementById('install-ios-sheet');
    const backdrop = document.getElementById('install-ios-backdrop');
    if (!sheet || !backdrop) return;
    backdrop.classList.remove('hidden');
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      sheet.classList.add('open');
    });
  }

  _hideIOSSheet() {
    const sheet = document.getElementById('install-ios-sheet');
    const backdrop = document.getElementById('install-ios-backdrop');
    if (!sheet || !backdrop) return;
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => {
      backdrop.classList.add('hidden');
      sheet.classList.add('hidden');
    }, 300);
  }

  _onInstallBtn() {
    this.dismiss();
    this.install();
  }
};
