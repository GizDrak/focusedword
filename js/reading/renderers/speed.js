window.SpeedRenderer = class SpeedRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
    this.wordStream = [];
    this.currentWordIndex = 0;
    this.isPlaying = false;
    this.timer = null;
  }

  buildWordStream(verses) {
    this.wordStream = [];
    for (const v of verses) {
      const text = v.clean_text || '';
      const words = text.split(/\s+/);
      for (const word of words) {
        if (word) this.wordStream.push({ text: word, verseNum: v.verse });
      }
    }
  }

  render(verses) {
    this.bridge.state.set('speedMode', true);
    this.buildWordStream(verses);

    const currentVerse = this.bridge.state.get('currentVerse');
    this.currentWordIndex = this.wordStream.findIndex(w => w.verseNum === currentVerse);
    if (this.currentWordIndex < 0) this.currentWordIndex = 0;

    this._renderWord();
  }

  _renderWord() {
    const content = document.getElementById('content');
    for (let i = content.children.length - 1; i >= 0; i--) {
      const c = content.children[i];
      if (c.id !== 'chapter-header' && c.id !== 'speed-controls') c.remove();
    }
    content.classList.remove('swipe-mode', 'spotlight-mode');
    content.classList.add('speed-mode');

    const wordObj = this.wordStream[this.currentWordIndex];
    if (!wordObj) return;

    const state = this.bridge.state;
    const _rc = (key, def) => {
      const raw = state.get(key);
      if (raw !== 'skin' || !window.UISkins) return raw;
      const skin = UISkins.getActive();
      if (skin && key in (skin.preferences || {})) return skin.preferences[key];
      return UISkins._builtinDefaults[key] !== undefined ? UISkins._builtinDefaults[key] : def;
    };
    const bionic = _rc('bionic', false);
    const strength = _rc('bionicStrength', 0.45);
    const word = wordObj.text;
    const orpIndex = this._getORPIndex(word);

    let html;
    if (bionic) {
      const bionicFix = Math.min(Math.max(Math.ceil(word.length * strength), 1), word.length);
      const chars = word.split('');
      html = chars.map((char, i) => {
        const isOrp = i === orpIndex;
        const isBionic = i < bionicFix;
        if (isOrp && isBionic) return `<span class="orp"><b>${char}</b></span>`;
        if (isOrp) return `<span class="orp">${char}</span>`;
        if (isBionic) return `<b>${char}</b>`;
        return char;
      }).join('');
    } else {
      html = word.slice(0, orpIndex) +
        `<span class="orp">${word[orpIndex]}</span>` +
        word.slice(orpIndex + 1);
    }

    const card = document.createElement('div');
    card.className = 'speed-word focused';

    const wordSpan = document.createElement('span');
    wordSpan.innerHTML = html;
    card.appendChild(wordSpan);

    content.appendChild(card);

    const ctrlToggle = document.getElementById('speed-controls');
    if (ctrlToggle) {
      ctrlToggle.classList.remove('hidden');
      if (!ctrlToggle.classList.contains('speed-controls--collapsed') && !ctrlToggle.classList.contains('speed-controls--expanded')) {
        ctrlToggle.classList.add('speed-controls--collapsed');
      }
      card.insertAdjacentElement('afterend', ctrlToggle);
      if (!ctrlToggle._toggleBound) {
        ctrlToggle._toggleBound = true;
        ctrlToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (e.target.closest('input, label, .toggle-pill')) return;
          ctrlToggle.classList.toggle('speed-controls--collapsed');
          ctrlToggle.classList.toggle('speed-controls--expanded');
        });
      }
      if (!ctrlToggle._presetsBound) {
        ctrlToggle._presetsBound = true;
        const wpmSlider = document.getElementById('speed-wpm');
        if (wpmSlider) {
          ctrlToggle.querySelectorAll('.speed-preset').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const value = parseInt(btn.dataset.wpm, 10);
              wpmSlider.value = value;
              wpmSlider.dispatchEvent(new Event('input', { bubbles: true }));
            });
          });
        }
      }
    }

    this._syncVerse();
  }

  _syncVerse() {
    const wordObj = this.wordStream[this.currentWordIndex];
    if (wordObj && wordObj.verseNum !== this.bridge.state.get('currentVerse')) {
      this.bridge.state.set('currentVerse', wordObj.verseNum);
      this.base.updateProgress(wordObj.verseNum);
    }
  }

  _getORPIndex(word) {
    return Math.floor(word.length * 0.35);
  }

  _getWordDelay() {
    const wpm = this.bridge.state.get('wpm');
    const baseDelay = 60000 / wpm;
    const word = this.wordStream[this.currentWordIndex]?.text || '';
    const lastChar = word[word.length - 1];
    if (',;:'.includes(lastChar)) return baseDelay * (lastChar === ',' ? 1.5 : 2.0);
    if ('?!'.includes(lastChar)) return baseDelay * 2.0;
    return baseDelay;
  }

  togglePlayPause() {
    this.isPlaying = !this.isPlaying;
    if (this.isPlaying) {
      this._scheduleNext();
    } else {
      this._stopTimer();
    }
  }

  advanceWord() {
    this._stopTimer();
    this.isPlaying = false;
    if (this.currentWordIndex < this.wordStream.length - 1) {
      this.currentWordIndex++;
      this._renderWord();
    }
  }

  rewindWord() {
    this._stopTimer();
    this.isPlaying = false;
    if (this.currentWordIndex > 0) {
      this.currentWordIndex--;
      this._renderWord();
    }
  }

  _scheduleNext() {
    if (!this.isPlaying) return;
    const delay = this._getWordDelay();
    this.timer = setTimeout(() => {
      if (this.currentWordIndex < this.wordStream.length - 1) {
        this.currentWordIndex++;
        this._syncVerse();
        this._renderWord();
        const wordObj = this.wordStream[this.currentWordIndex];
        if (wordObj) this.base.updateProgress(wordObj.verseNum);
        this._scheduleNext();
      } else {
        this._stopTimer();
        this.isPlaying = false;
        if (this.bridge.state.get('speedAutoAdvance')) {
          this.bridge.emit('nav:advance-chapter', { direction: 'next', autoAdvance: true });
        }
      }
    }, delay);
  }

  _stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  stop() {
    this._stopTimer();
    this.isPlaying = false;
  }
};