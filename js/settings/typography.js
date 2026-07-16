window.TypographyModule = class TypographyModule {
  constructor(bridge) {
    this.bridge = bridge;
  }

  initialize() {
    this.applyVisualSettings();
    this._bind();
  }

  _bind() {
    const modeKeys = ['swipeMode', 'spotlightMode', 'speedMode'];
    this.bridge.state.onChange(modeKeys, () => {
      this.applyVisualSettings();
    });
  }

  applyVisualSettings() {
    const s = this.bridge.state;
    const root = document.documentElement;

    const resolve = (key, raw) => {
      if (raw !== 'skin' || !window.UISkins) return raw;
      return window.UISkins.resolveSetting(key, raw);
    };

    const fontFamily = resolve('fontFamily', s.get('fontFamily'));
    const fontSize = resolve('fontSize', s.get('fontSize'));
    const lineSpacing = resolve('lineSpacing', s.get('lineSpacing'));
    const letterSpacing = resolve('letterSpacing', s.get('letterSpacing'));
    const margins = resolve('margins', s.get('margins'));
    const mode = this._activeMode();
    const constraints = this._modeConstraints(mode);

    root.style.setProperty('--verse-font-family', this._fontCss(fontFamily));
    root.style.setProperty('--verse-font-size', fontSize + 'rem');
    root.style.setProperty('--verse-line-height', String(lineSpacing));
    root.style.setProperty('--verse-letter-spacing', letterSpacing + 'em');
    root.style.setProperty('--verse-padding-x', margins + 'rem');

    root.style.setProperty('--verse-measure', constraints.measure);

    const headingBefore = fontSize * lineSpacing * 0.6;
    const headingAfter = fontSize * lineSpacing * 0.3;
    const paraGap = fontSize * lineSpacing * 0.4;
    root.style.setProperty('--heading-margin-before', headingBefore + 'rem');
    root.style.setProperty('--heading-margin-after', headingAfter + 'rem');
    root.style.setProperty('--paragraph-gap', paraGap + 'rem');

    const poetryLineHeight = Math.max(lineSpacing * 0.92, 1.4);
    const poetryIndentUnit = fontSize * 1.5;
    root.style.setProperty('--poetry-line-height', String(poetryLineHeight));
    root.style.setProperty('--poetry-indent-unit', poetryIndentUnit + 'rem');
    root.style.setProperty('--poetry-stanza-gap', (fontSize * lineSpacing * 0.75) + 'rem');

    const activeSkin = window.UISkins && UISkins.getActive();
    const skinTokens = activeSkin ? activeSkin.tokens : {};
    this._applyAlignmentSettings(s, root, skinTokens);
    root.style.setProperty('--marker-font-size', '0.65em');
    root.style.setProperty('--marker-line-height', '0');
    root.style.setProperty('--marker-color', 'var(--text-muted)');
  }

  _applyAlignmentSettings(s, root, skinTokens) {
    const defaults = {
      chapterHeader: 'center',
      sectionHeading: 'center',
      verse: 'left'
    };

    const resolve = (key, token, fallback) => {
      const raw = s.get(key);
      if (raw !== 'skin') return raw;
      return skinTokens[token] || fallback;
    };

    const ch = resolve('chapterHeaderAlignment', '--skin-chapter-header-align', defaults.chapterHeader);
    root.style.setProperty('--text-chapter-header-align', ch);
    root.style.setProperty('--text-chapter-header-emblem-margin-x', 'auto');
    root.dataset.chapterHeaderAlign = ch;

    const sh = resolve('sectionHeadingAlignment', '--skin-section-heading-align', defaults.sectionHeading);
    root.style.setProperty('--text-section-heading-align', sh);
    root.style.setProperty('--text-section-heading-margin-x', 'auto');
    root.style.setProperty('--text-section-heading-spacer-display',
      sh === 'left' ? 'inline-block' : 'none');
    const justifyMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
    root.style.setProperty('--text-section-heading-justify', justifyMap[sh] || 'flex-start');
    root.dataset.sectionHeadingAlign = sh;

    const vt = resolve('verseTextAlignment', '--skin-verse-align', defaults.verse);
    root.style.setProperty('--text-verse-align', vt);

    const vnpRaw = s.get('verseNumberPlacement');
    const vnp = window.UISkins ? window.UISkins.resolveSetting('verseNumberPlacement', vnpRaw) : (vnpRaw === 'skin' ? 'inline' : vnpRaw);
    root.dataset.verseNumberPlacement = vnp;
  }

  formatTextNode(rawText, context) {
    if (!rawText) return rawText;
    context = context || {};
    let text = rawText;
    text = this.fixOpeningQuoteSpacing(text, context);
    text = this.applyWidowProtection(text, context);
    return text;
  }

  fixOpeningQuoteSpacing(text, context) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/(^|[\s([{])"\s+([A-Za-z])/g, '$1"$2')
               .replace(/(^|[\s([{])\u201c\s+([A-Za-z])/g, '$1\u201c$2')
               .replace(/(^|[\s([{])\u2018\s+([A-Za-z])/g, '$1\u2018$2');
  }

  applyWidowProtection(text, context) {
    if (!text || typeof text !== 'string') return text;
    const trimmed = text.trimEnd();
    if (!trimmed) return text;
    const trailing = text.slice(trimmed.length);

    const words = trimmed.split(/\s+/);
    if (words.length < 2) return text;

    const shortWords = new Set(['God', 'Lord', 'LORD', 'it', 'he', 'He', 'me', 'us', 'you']);
    const isPoetry = context?.tokenType === 'poetry';

    if (isPoetry && words.length >= 3 && shortWords.has(words[words.length - 1])) {
      const bound = words.splice(-3);
      words.push(bound.join('\u00A0'));
    } else {
      const bound = words.splice(-2);
      words.push(bound.join('\u00A0'));
    }

    const leading = text.match(/^\s*/)?.[0] || '';
    return leading + words.join(' ') + trailing;
  }

  applyBionicToHtml(html, context) {
    if (!html || !context?.bionic || !context?.bionicStrength) return html;
    const strength = context.bionicStrength;
    return html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, before, text) => {
      return before + text.replace(/[^\s\u00A0]+/g, w => {
        const n = Math.max(1, Math.ceil(w.length * strength));
        return '<b>' + w.slice(0, n) + '</b>' + w.slice(n);
      });
    });
  }

  _activeMode() {
    const s = this.bridge.state;
    if (s.get('speedMode')) return 'speed';
    if (s.get('swipeMode')) return 'swipe';
    if (s.get('spotlightMode')) return 'spotlight';
    return 'scroll';
  }

  _modeConstraints(mode) {
    switch (mode) {
      case 'swipe':
        return { measure: 'min(58ch, 100%)' };
      case 'spotlight':
        return { measure: 'min(68ch, 100%)' };
      case 'speed':
        return { measure: '100%' };
      default:
        return { measure: 'min(72ch, 100%)' };
    }
  }

  _fontCss(key) {
    const MAP = {
      inter: "'Inter', system-ui, -apple-system, sans-serif",
      roboto: "'Roboto', system-ui, -apple-system, sans-serif",
      atkinson: "'Atkinson Hyperlegible', system-ui, -apple-system, sans-serif",
      merriweather: "'Merriweather', Georgia, 'Times New Roman', serif",
      lora: "'Lora', Georgia, 'Times New Roman', serif",
      'crimson-pro': "'Crimson Pro', Georgia, 'Times New Roman', serif",
      'ibm-plex-mono': "'IBM Plex Mono', 'Courier New', monospace",
      caveat: "'Caveat', 'Comic Sans MS', cursive",
      lexend: "'Lexend', system-ui, -apple-system, sans-serif",
      'comic-neue': "'Comic Neue', 'Comic Sans MS', cursive"
    };
    return MAP[key] || MAP.inter;
  }
};
