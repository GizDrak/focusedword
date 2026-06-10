window.SwipeRenderer = class SwipeRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
    this.currentVerseIndex = 0;
    this._showHeader = true;
    this._animating = false;
  }

  render(verses) {
    this._cleanupAnimation();

    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');

    this.bridge.state.set('swipeMode', true);
    this.animDir = state.get('swipeAnimDir') || 'horizontal';

    const idx = verses.findIndex(v => v.verse === state.get('currentVerse'));
    this._showHeader = idx <= 0;
    this.currentVerseIndex = Math.max(idx, 0);

    this._renderCurrent(verses, bionic, strength);
  }

  _createContainer(verse, bionic, strength, height) {
    const container = document.createElement('div');
    container.className = 'verse-container';
    container.dataset.verse = verse.verse;

    const verseText = document.createElement('span');
    verseText.className = 'verse-text';
    verseText.setAttribute('dir', 'auto');

    const verseNum = document.createElement('sup');
    verseNum.className = 'verse-num';
    verseNum.textContent = verse.verse;

    const useWj = this.bridge.state.get('redLetter') && verse.has_wj && verse.text_wj;

    if (useWj) {
      verseText.innerHTML = bionic
        ? this.base._applyBionicToWj(verse.text_wj, strength)
        : verse.text_wj;
    } else if (bionic) {
      verseText.innerHTML = this.bridge.bionic.parse(verse.text, strength);
    } else {
      verseText.textContent = verse.text;
    }

    verseText.prepend(verseNum);
    container.appendChild(verseText);

    if (height) {
      container.style.height = height + 'px';
      container.style.overflow = 'hidden';
    }

    return container;
  }

  _computeMaxHeight(verses, bionic, strength) {
    const meas = document.createElement('div');
    meas.id = 'content';
    meas.className = 'swipe-mode';
    meas.style.cssText = 'position:fixed;left:-9999px;top:0;width:100vw;visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    const deck = document.createElement('div');
    deck.className = 'verse-deck';
    deck.style.cssText = 'position:relative;width:90%;max-width:680px;margin:0 auto;';
    meas.appendChild(deck);
    document.body.appendChild(meas);

    let max = 0;
    const len = Math.min(verses.length, 500);
    for (let i = 0; i < len; i++) {
      const container = this._createContainer(verses[i], bionic, strength);
      deck.appendChild(container);
      const h = container.offsetHeight;
      if (h > max) max = h;
      deck.removeChild(container);
    }

    document.body.removeChild(meas);
    return Math.min(max, Math.round(window.innerHeight * 0.8));
  }

  _renderCurrent(verses, bionic, strength) {
    const content = this.base.clearContent();
    content.classList.remove('spotlight-mode', 'speed-mode');
    content.classList.add('swipe-mode');

    const header = document.getElementById('chapter-header');

    if (this._showHeader) {
      if (header) header.classList.remove('header-hidden');
      this.base.showSpeedControls(false);
      return;
    }

    if (header) header.classList.add('header-hidden');

    const v = verses[this.currentVerseIndex];
    if (!v) return;
    if (v.verse !== this.bridge.state.get('currentVerse')) {
      this.bridge.state.set('currentVerse', v.verse);
    }

    const maxHeight = this._computeMaxHeight(verses, bionic, strength);
    this._cardHeight = maxHeight;

    const deck = document.createElement('div');
    deck.className = 'verse-deck';
    deck.classList.toggle('swipe-anim-vertical', this.animDir === 'vertical');
    deck.style.height = maxHeight + 'px';

    const current = this._createContainer(v, bionic, strength, maxHeight);
    current.classList.add('card--current');
    deck.appendChild(current);

    if (this.currentVerseIndex < verses.length - 1) {
      const nextV = verses[this.currentVerseIndex + 1];
      const nextCard = this._createContainer(nextV, bionic, strength, maxHeight);
      nextCard.classList.add('card--next');
      deck.appendChild(nextCard);
    }

    content.appendChild(deck);
    this.base.updateFocusedVerse(v.verse);
    this.base.showSpeedControls(false);
  }

  advance(verses, direction) {
    if (this._animating) return;

    const deck = document.querySelector('.verse-deck');
    const currentCard = deck ? deck.querySelector('.card--current') : null;

    if (direction === 'next') {
      if (this._showHeader) {
        this._showHeader = false;
        this.currentVerseIndex = 0;
        this._renderCurrent(verses, this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
      } else if (this.currentVerseIndex < verses.length - 1) {
        this.currentVerseIndex++;
        if (currentCard && deck) {
          this._animatedTransition(verses, currentCard, deck, 'next');
        } else {
          this._renderCurrent(verses, this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
        }
      } else {
        this.bridge.emit('nav:advance-chapter', { direction: 'next' });
      }
    } else {
      if (this.currentVerseIndex > 0) {
        this.currentVerseIndex--;
        if (currentCard && deck) {
          this._animatedTransition(verses, currentCard, deck, 'prev');
        } else {
          this._renderCurrent(verses, this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
        }
      } else if (this.currentVerseIndex === 0 && !this._showHeader) {
        this._showHeader = true;
        this._renderCurrent(verses, this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
      } else {
        this.bridge.emit('nav:advance-chapter', { direction: 'prev' });
      }
    }
  }

  _animatedTransition(verses, currentCard, deck, direction) {
    this._animating = true;
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');
    const h = this._cardHeight;

    const v = verses[this.currentVerseIndex];
    if (!v) { this._animating = false; return; }

    state.set('currentVerse', v.verse);

    if (direction === 'next') {
      const nextCard = deck.querySelector('.card--next');

      if (this.animDir === 'vertical') {
        currentCard.classList.add('card--out-next');
        if (nextCard) {
          nextCard.style.transition = 'none';
          nextCard.style.opacity = '0';
          void nextCard.offsetHeight;
          nextCard.style.transition = '';
          nextCard.style.opacity = '';
          nextCard.classList.remove('card--next');
          nextCard.classList.add('card--enter');
        }
      } else {
        currentCard.classList.add('card--out-next');
        if (nextCard) {
          nextCard.classList.remove('card--next');
          nextCard.classList.add('card--enter');
        }
      }

      this.base.updateFocusedVerse(v.verse);

      if (this.currentVerseIndex < verses.length - 1) {
        const nextV = verses[this.currentVerseIndex + 1];
        const newNext = this._createContainer(nextV, bionic, strength, h);
        newNext.classList.add('card--next');
        deck.appendChild(newNext);
      }

      setTimeout(() => {
        this._finishTransition(deck, currentCard);
      }, 600);
    } else {
      const enteringCard = this._createContainer(v, bionic, strength, h);
      enteringCard.classList.add('card--enter');
      enteringCard.style.transition = 'none';
      if (this.animDir === 'vertical') {
        enteringCard.style.transform = 'translateY(-80vh) scale(0.85)';
        enteringCard.style.opacity = '0';

        deck.insertBefore(enteringCard, deck.firstChild);

        void enteringCard.offsetHeight;

        enteringCard.style.transition = '';
        enteringCard.style.transform = '';
        enteringCard.style.opacity = '';

        currentCard.classList.add('card--out-prev');

        const staleNext = deck.querySelector('.card--next');
        if (staleNext) staleNext.remove();

        this.base.updateFocusedVerse(v.verse);

        setTimeout(() => {
          currentCard.remove();
          enteringCard.classList.remove('card--enter');
          enteringCard.classList.add('card--current');
          if (this.currentVerseIndex < verses.length - 1) {
            const nextV = verses[this.currentVerseIndex + 1];
            const newNext = this._createContainer(nextV, bionic, strength, this._cardHeight);
            newNext.classList.add('card--next');
            deck.appendChild(newNext);
          }
          this._animating = false;
        }, 500);
      } else {
        enteringCard.style.transform = 'rotate(-30deg) translateX(-180vw) translateY(80px) scale(0.7)';
        enteringCard.style.opacity = '0';

        deck.insertBefore(enteringCard, deck.firstChild);

        void enteringCard.offsetHeight;

        enteringCard.style.transition = '';
        enteringCard.style.transform = '';
        enteringCard.style.opacity = '';

        currentCard.classList.add('card--to-peek');

        this.base.updateFocusedVerse(v.verse);

        setTimeout(() => {
          currentCard.classList.remove('card--current', 'card--to-peek');
          currentCard.classList.add('card--next');
          enteringCard.classList.remove('card--enter');
          enteringCard.classList.add('card--current');
          this._animating = false;
        }, 600);
      }
    }
  }

  _finishTransition(deck, outCard) {
    outCard.remove();
    const enter = deck.querySelector('.card--enter');
    if (enter) {
      enter.classList.remove('card--enter');
      enter.classList.add('card--current');
    }
    this._animating = false;
  }

  _cleanupAnimation() {
    const deck = document.querySelector('.verse-deck');
    if (deck) {
      const out = deck.querySelector('.card--out-next, .card--out-prev');
      if (out) out.remove();
      const toPeek = deck.querySelector('.card--to-peek');
      if (toPeek) toPeek.classList.remove('card--to-peek');
      const enter = deck.querySelector('.card--enter');
      if (enter) {
        enter.classList.remove('card--enter');
        enter.classList.add('card--current');
      }
      const current = deck.querySelector('.verse-container');
      if (current) {
        current.classList.remove('card--next');
        current.style.transition = '';
        current.style.transform = '';
        current.style.opacity = '';
      }
      deck.style.height = '';
    }
    this._animating = false;
  }
};
