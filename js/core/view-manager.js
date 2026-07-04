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
    document.body.classList.toggle('split-mode', !!flags.split);
    document.body.classList.toggle('split-portrait', !!flags.split && !!flags.splitPortrait);
    if (anyActive) window.scrollTo(0, 0);
  }

  scrollToReadingBand(verseNum) {
    const el = document.querySelector(`.verse-container[data-verse="${verseNum}"]`);
    if (!el) return;

    const content = document.getElementById('content');
    const overflowY = content && getComputedStyle(content).overflowY;
    const scroller = (overflowY === 'auto' || overflowY === 'scroll') ? content : window;

    const saved = content.style.scrollBehavior;
    content.style.scrollBehavior = 'auto';

    el.scrollIntoView({ block: 'start' });

    const curScroll = scroller === window ? window.scrollY : scroller.scrollTop;
    const targetY = Math.max(0, curScroll - window.innerHeight * 0.25);
    if (scroller === window) {
      window.scrollTo(0, targetY);
    } else {
      scroller.scrollTop = targetY;
    }

    content.style.scrollBehavior = saved;
    this._instantScroll = false;
  }

  scrollToVerse(verseNum) {
    if (this._scrollRaf) {
      cancelAnimationFrame(this._scrollRaf);
      this._scrollRaf = null;
    }

    const el = document.querySelector(`.verse-container[data-verse="${verseNum}"], .verse-container.active-verse`);
    if (!el) { this._instantScroll = false; return; }

    const content = document.getElementById('content');
    const overflowY = content && getComputedStyle(content).overflowY;
    const scroller = (overflowY === 'auto' || overflowY === 'scroll') ? content : window;

    if (this._instantScroll) {
      el.scrollIntoView({ block: 'center' });
      this._instantScroll = false;
      return;
    }

    const rect = el.getBoundingClientRect();
    const conRect = scroller === window ? { top: 0, height: window.innerHeight } : scroller.getBoundingClientRect();
    const viewH = conRect.height;
    const curScroll = scroller === window ? window.scrollY : scroller.scrollTop;
    const targetY = curScroll + rect.top - conRect.top - (viewH / 2) + (rect.height / 2);
    const dist = targetY - curScroll;

    if (Math.abs(dist) < 2) {
      this._instantScroll = false;
      return;
    }

    const duration = 250;
    const startTime = performance.now();

    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const pos = curScroll + dist * ease;
      if (scroller === window) {
        window.scrollTo(0, pos);
      } else {
        scroller.scrollTop = pos;
      }
      if (t < 1) {
        this._scrollRaf = requestAnimationFrame(tick);
      } else {
        this._scrollRaf = null;
      }
    };

    this._scrollRaf = requestAnimationFrame(tick);
  }
};
