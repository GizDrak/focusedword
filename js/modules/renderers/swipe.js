window.SwipeRenderer = class SwipeRenderer {
  constructor(bridge, base) {
    this.bridge = bridge;
    this.base = base;
    this._cards = [];
    this.currentCardIndex = 0;
    this._showHeader = true;
    this._animating = false;
    this._bulkRefs = {};
  }

  _getCardVerse(card) {
    if (card.type === 'verse') return card.verse;
    if (card.type === 'paragraph') return card.verses[0].verse;
    return null;
  }

  _buildCardSequence(verses) {
    const state = this.bridge.state;
    const showHeadings = state.get('sectionHeadings');
    if (state.get('paragraphBreaks')) {
      return this._buildParagraphSequence(verses, showHeadings);
    }
    const cards = [];
    for (const v of verses) {
      if (!v.tokens) {
        cards.push({ type: 'verse', verse: v.verse, tokens: null, raw: v });
        continue;
      }
      if (showHeadings && this.base._isHeadingOnly(v)) continue;

      const headingGroups = [];
      const textTokens = [];
      let currentHeading = null;

      for (const t of v.tokens) {
        if (t.type === 'section_heading' && showHeadings) {
          if (currentHeading !== null) {
            headingGroups.push(currentHeading);
          }
          currentHeading = [t];
        } else if (t.type === 'cross_ref' && currentHeading !== null) {
          currentHeading.push(t);
        } else {
          if (currentHeading !== null) {
            headingGroups.push(currentHeading);
            currentHeading = null;
          }
          textTokens.push(t);
        }
      }
      if (currentHeading !== null) {
        headingGroups.push(currentHeading);
      }

      for (const group of headingGroups) {
        cards.push({ type: 'heading', verse: v.verse, tokens: group, raw: v });
      }
      if (textTokens.length > 0) {
        cards.push({ type: 'verse', verse: v.verse, tokens: textTokens, raw: v });
      }
    }
    return cards;
  }

  _buildParagraphSequence(verses, showHeadings) {
    const cards = [];
    let currentGroup = null;

    const flushGroup = () => {
      if (!currentGroup) return;
      if (currentGroup.length === 1) {
        const v = currentGroup[0];
        cards.push({ type: 'verse', verse: v.verse, tokens: v.tokens, raw: v.raw });
      } else {
        cards.push({ type: 'paragraph', verses: currentGroup.map(item => ({ verse: item.verse, tokens: item.tokens, raw: item.raw })) });
      }
      currentGroup = null;
    };

    for (const v of verses) {
      if (!v.tokens) {
        flushGroup();
        cards.push({ type: 'verse', verse: v.verse, tokens: null, raw: v });
        continue;
      }
      if (showHeadings && this.base._isHeadingOnly(v)) continue;

      const headingGroups = [];
      const textTokens = [];
      let currentHeading = null;

      for (const t of v.tokens) {
        if (t.type === 'section_heading' && showHeadings) {
          if (currentHeading !== null) headingGroups.push(currentHeading);
          currentHeading = [t];
        } else if (t.type === 'cross_ref' && currentHeading !== null) {
          currentHeading.push(t);
        } else {
          if (currentHeading !== null) {
            headingGroups.push(currentHeading);
            currentHeading = null;
          }
          textTokens.push(t);
        }
      }
      if (currentHeading !== null) headingGroups.push(currentHeading);

      for (const group of headingGroups) {
        flushGroup();
        cards.push({ type: 'heading', verse: v.verse, tokens: group, raw: v });
      }

      if (textTokens.length > 0) {
        if (!currentGroup || textTokens[0].type === 'paragraph_start') {
          flushGroup();
          currentGroup = [{ verse: v.verse, tokens: textTokens, raw: v }];
        } else {
          const maxVerses = this.bridge.state.get('swipeMaxVerses') || 4;
          if (currentGroup.length >= maxVerses) {
            flushGroup();
            currentGroup = [{ verse: v.verse, tokens: textTokens, raw: v }];
          } else {
            currentGroup.push({ verse: v.verse, tokens: textTokens, raw: v });
          }
        }
      }
    }

    flushGroup();
    return cards;
  }

  render(verses) {
    this._cleanupAnimation();

    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');
    const bookId = state.get('currentBook');
    const chapter = state.get('currentChapter');

    this.bridge.state.set('swipeMode', true);
    this.animDir = state.get('swipeAnimDir') || 'vertical';

    if (state.get('crossRefs')) {
      this.base._currentBookId = bookId;
      this.base._currentChapter = chapter;
      const cr = this.bridge.get('cross-references');
      this._bulkRefs = cr && cr.enabled ? (cr.getRefsBulk(bookId, chapter) || {}) : {};
    } else {
      this._bulkRefs = {};
    }

    const currentVerse = state.get('currentVerse');
    this._cards = this._buildCardSequence(verses);
    const cardIdx = this._cards.findIndex(c => (c.type === 'verse' && c.verse === currentVerse) || (c.type === 'paragraph' && c.verses.some(v => v.verse === currentVerse)));
    this.currentCardIndex = cardIdx >= 0 ? cardIdx : 0;
    this._showHeader = false;

    this._renderCurrent(bionic, strength);
  }

  _createContainer(card, bionic, strength, height, settings) {
    if (card.type === 'heading') {
      const el = document.createElement('div');
      el.className = 'verse-container heading-card';
      el.dataset.verse = card.verse;
      for (const t of card.tokens) {
        if (t.type === 'section_heading') {
          const hEl = document.createElement('div');
          hEl.className = 'token-section-heading heading-card-text';
          hEl.textContent = t.text || '';
          el.appendChild(hEl);
        } else if (t.type === 'cross_ref') {
          const refEl = document.createElement('span');
          refEl.className = 'token-section-heading-ref';
          refEl.textContent = new window.TokenRenderer(this.bridge)._limitCrossRefText(t.text, 3);
          const refs = new window.TokenRenderer(this.bridge)._parseCrossRefRefs(t.text);
          if (refs && refs.length) {
            refEl.dataset.refs = JSON.stringify(refs);
          }
          refEl.addEventListener('click', (e) => {
            const im = this.bridge.get('interaction-manager');
            if (im && im.selectionMode) return;
            e.stopPropagation();
            try {
              const refs = JSON.parse(refEl.dataset.refs);
              if (refs && refs.length) {
                const verseNum = parseInt(el.dataset.verse);
                this.base._showInlineCrossRefs(refs, verseNum);
              }
            } catch (e) {
              console.error('[swipe] heading cross-ref parse:', e);
            }
          });
          el.appendChild(refEl);
        }
      }
      if (height) {
        el.style.height = height + 'px';
        el.style.overflow = 'hidden';
      }
      return el;
    }

    if (card.type === 'paragraph') {
      const el = document.createElement('div');
      el.className = 'verse-container paragraph-card';
      el.dataset.verse = card.verses[0].verse;
      for (const vData of card.verses) {
          if (vData.tokens) {
          const verseEl = new window.TokenRenderer(this.bridge)._renderVerseTokens(vData.verse, vData.tokens, bionic, strength, settings || this.base._getSettings());
          if (verseEl) {
            while (verseEl.firstChild) {
              el.appendChild(verseEl.firstChild);
            }
          }
        } else {
          const verseNum = document.createElement('sup');
          verseNum.className = 'verse-num';
          verseNum.textContent = vData.verse;
          const verseText = document.createElement('span');
          verseText.className = 'verse-text';
          verseText.textContent = vData.raw && vData.raw.clean_text || '';
          verseText.prepend(verseNum);
          el.appendChild(verseText);
        }
      }
      if (this.bridge.state.get('crossRefs') && this._bulkRefs && this._bulkRefs[card.verses[0].verse] && this._bulkRefs[card.verses[0].verse].length) {
        this.base._addCrossRefIndicator(el, card.verses[0].verse);
      }
      return el;
    }

    let el;
    if (card.tokens) {
      el = new window.TokenRenderer(this.bridge)._renderVerseTokens(card.verse, card.tokens, bionic, strength, settings || this.base._getSettings());
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'verse-container';
      el.dataset.verse = card.verse;
      const verseNum = document.createElement('sup');
      verseNum.className = 'verse-num';
      verseNum.textContent = card.verse;
      const verseText = document.createElement('span');
      verseText.className = 'verse-text';
      verseText.textContent = card.raw && card.raw.clean_text || '';
      verseText.prepend(verseNum);
      el.appendChild(verseText);
    }
    el.dataset.verse = card.verse;
    if (this.bridge.state.get('crossRefs') && this._bulkRefs && this._bulkRefs[card.verse] && this._bulkRefs[card.verse].length) {
      this.base._addCrossRefIndicator(el, card.verse);
    }
    if (height) {
      el.style.height = height + 'px';
      el.style.overflow = 'hidden';
    }
    return el;
  }

  _computeMaxHeight(bionic, strength) {
    const state = this.bridge.state;
    const cacheKey = `${state.get('currentBook')}_${state.get('currentChapter')}_${bionic}_${strength}`;
    if (this._maxHeightCache?.key === cacheKey) {
      return this._maxHeightCache.value;
    }

    const measureCards = this._cards.filter(c => c.type === 'verse' || c.type === 'paragraph');
    if (!measureCards.length) {
      const result = Math.round(window.innerHeight * 0.5);
      this._maxHeightCache = { key: cacheKey, value: result };
      return result;
    }

    const settings = this.base._getSettings();
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
    const len = Math.min(measureCards.length, AppConfig.SWIPE_MAX_VERSE_MEASURE);
    const step = len > 100 ? 5 : 1;
    for (let i = 0; i < len; i += step) {
      const container = this._createContainer(measureCards[i], bionic, strength, null, settings);
      deck.appendChild(container);
      const h = container.offsetHeight;
      if (h > max) max = h;
      deck.removeChild(container);
    }

    document.body.removeChild(meas);
    const hasParagraphCards = this._cards.some(c => c.type === 'paragraph');
    const cap = hasParagraphCards ? 0.95 : 0.8;
    const result = Math.min(max, Math.round(window.innerHeight * cap));
    this._maxHeightCache = { key: cacheKey, value: result };
    return result;
  }

  _renderCurrent(bionic, strength) {
    const settings = this.base._getSettings();
    const content = document.getElementById('content');
    for (let i = content.children.length - 1; i >= 0; i--) {
      const c = content.children[i];
      if (c.id !== 'chapter-header' && c.id !== 'speed-controls') c.remove();
    }
    content.classList.remove('spotlight-mode', 'speed-mode');
    content.classList.add('swipe-mode');

    const header = document.getElementById('chapter-header');

    if (this._showHeader) {
      if (header) header.classList.remove('header-hidden');
      this.base.showSpeedControls(false);
      return;
    }

    if (header) header.classList.add('header-hidden');

    const card = this._cards[this.currentCardIndex];
    if (!card) return;
    if ((card.type === 'verse' || card.type === 'paragraph') && this._getCardVerse(card) !== this.bridge.state.get('currentVerse')) {
      window.verseManager.setPassive(this._getCardVerse(card));
    }

    const maxHeight = this._computeMaxHeight(bionic, strength);
    this._cardHeight = maxHeight;

    const deck = document.createElement('div');
    deck.className = 'verse-deck';
    deck.classList.toggle('swipe-anim-vertical', this.animDir === 'vertical');
    deck.style.height = maxHeight + 'px';

    const current = this._createContainer(card, bionic, strength, maxHeight, settings);
    current.classList.add('card--current');
    deck.appendChild(current);

    if (this.currentCardIndex < this._cards.length - 1) {
      const nextCard = this._createContainer(this._cards[this.currentCardIndex + 1], bionic, strength, maxHeight, settings);
      nextCard.classList.add('card--next');
      deck.appendChild(nextCard);
    }

    content.appendChild(deck);
    if (card.type === 'verse' || card.type === 'paragraph') {
      this.base.updateProgress(this._getCardVerse(card));
    }
  }

  advance(verses, direction) {
    if (this._animating) return;

    const deck = document.querySelector('.verse-deck');
    const currentCard = deck ? deck.querySelector('.card--current') : null;

    if (direction === 'next') {
      if (this._showHeader) {
        this._showHeader = false;
        this.currentCardIndex = 0;
        this._renderCurrent(this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
      } else if (this.currentCardIndex < this._cards.length - 1) {
        this.currentCardIndex++;
        if (currentCard && deck) {
          this._animatedTransition(currentCard, deck, 'next');
        } else {
          this._renderCurrent(this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
        }
      } else {
        this.bridge.emit('nav:advance-chapter', { direction: 'next' });
      }
    } else {
      if (this.currentCardIndex > 0) {
        this.currentCardIndex--;
        if (currentCard && deck) {
          this._animatedTransition(currentCard, deck, 'prev');
        } else {
          this._renderCurrent(this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
        }
      } else if (this.currentCardIndex === 0 && !this._showHeader) {
        this._showHeader = true;
        this._renderCurrent(this.bridge.state.get('bionic'), this.bridge.state.get('bionicStrength'));
      } else {
        this.bridge.emit('nav:advance-chapter', { direction: 'prev' });
      }
    }
  }

  _animatedTransition(currentCard, deck, direction) {
    this._animating = true;
    const state = this.bridge.state;
    const bionic = state.get('bionic');
    const strength = state.get('bionicStrength');
    const settings = this.base._getSettings();
    const h = this._cardHeight;

    const card = this._cards[this.currentCardIndex];
    if (!card) { this._animating = false; return; }

    if (card.type === 'verse' || card.type === 'paragraph') {
      window.verseManager.setPassive(this._getCardVerse(card));
    }

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

      if (card.type === 'verse' || card.type === 'paragraph') {
        this.base.updateProgress(this._getCardVerse(card));
      }

      if (this.currentCardIndex < this._cards.length - 1) {
        const newNext = this._createContainer(this._cards[this.currentCardIndex + 1], bionic, strength, h, settings);
        newNext.classList.add('card--next');
        deck.appendChild(newNext);
      }

      setTimeout(() => {
        this._finishTransition(deck, currentCard);
      }, 600);
    } else {
      const enteringCard = this._createContainer(card, bionic, strength, h, settings);
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

        if (card.type === 'verse' || card.type === 'paragraph') {
          this.base.updateProgress(this._getCardVerse(card));
        }

        setTimeout(() => {
          currentCard.remove();
          enteringCard.classList.remove('card--enter');
          enteringCard.classList.add('card--current');
          if (this.currentCardIndex < this._cards.length - 1) {
            const newNext = this._createContainer(this._cards[this.currentCardIndex + 1], bionic, strength, this._cardHeight, settings);
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

        if (card.type === 'verse' || card.type === 'paragraph') {
          this.base.updateProgress(this._getCardVerse(card));
        }

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
      const current = deck.querySelectorAll('.verse-container, .heading-card');
      current.forEach(el => {
        el.classList.remove('card--next');
        el.style.transition = '';
        el.style.transform = '';
        el.style.opacity = '';
      });
      deck.style.height = '';
    }
    this._animating = false;
  }
};
