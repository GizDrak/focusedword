window.ViewManager = class ViewManager {
  constructor(bridge) {
    this.bridge = bridge;
    this.content = document.getElementById('content');
    this.progress = document.getElementById('verse-progress');
  }

  prepare() {
    this.content.style.height = '';
    this.content.classList.remove('swipe-mode', 'spotlight-mode', 'speed-mode',
      'chapter-slide', 'slide-out-left', 'slide-out-right',
      'slide-in-left', 'slide-in-right', 'slide-in');
    const toRemove = [];
    for (let i = 0; i < this.content.children.length; i++) {
      const c = this.content.children[i];
      if (c.id !== 'chapter-header' && c.id !== 'speed-controls') toRemove.push(c);
    }
    for (const c of toRemove) c.remove();
    this.progress.classList.remove('show-references');
  }

  setMode(mode) {
    if (mode) this.content.classList.add(mode + '-mode');
  }

  syncBodyClasses(flags) {
    const anyActive = flags.swipe || flags.spotlight || flags.speed;
    document.body.classList.toggle('scroll-mode', !anyActive);
    document.body.classList.toggle('reading-mode', anyActive);
    document.body.classList.toggle('swipe-mode', !!flags.swipe);
    document.body.classList.toggle('speed-mode', !!flags.speed);
    if (anyActive) window.scrollTo(0, 0);
  }

  scrollToVerse(verseNum) {
    requestAnimationFrame(() => {
      const el = document.querySelector(`.verse-container[data-verse="${verseNum}"], .verse-container.active-verse`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
};
