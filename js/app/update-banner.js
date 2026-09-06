window.UpdateBanner = class UpdateBanner {
  constructor(bridge) {
    this.bridge = bridge;
    this._seenKey = 'focused-word:last-seen-whats-new';
    this._version = (window.AppConfig && window.AppConfig.APP_VERSION) || '';
  }

  init() {
    if (!this._version) return;
    if (localStorage.getItem(this._seenKey) === this._version) return;

    const banner = document.getElementById('update-banner');
    if (!banner) return;
    const versionEl = document.getElementById('update-banner-version');
    if (versionEl) versionEl.textContent = this._version;

    banner.classList.remove('hidden');
    requestAnimationFrame(() => banner.classList.add('open'));
  }

  dismiss() {
    localStorage.setItem(this._seenKey, this._version);
    this._hide();
  }

  openWhatsNew() {
    localStorage.setItem(this._seenKey, this._version);
    this._hide();
    const settings = this.bridge && this.bridge.get('settings');
    if (settings && typeof settings.openChangelog === 'function') {
      settings.openChangelog();
    }
  }

  _hide() {
    const banner = document.getElementById('update-banner');
    if (!banner) return;
    banner.classList.remove('open');
    banner.classList.add('hidden');
  }
};
