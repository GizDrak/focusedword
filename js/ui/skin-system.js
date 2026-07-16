window.UISkins = class UISkins {
  static _definitions = new Map();
  static _activeId = 'classic';
  static _decorated = new WeakMap();
  static _dynamicTrees = [];

  static register(id, definition) {
    if (UISkins._definitions.has(id)) {
      console.warn('[UISkins] Overwriting skin:', id);
    }
    UISkins._definitions.set(id, {
      id,
      name: definition.name || id,
      parent: definition.parent || null,
      tokens: definition.tokens || {},
      preferences: definition.preferences || {},
      classes: definition.classes || {},
      components: definition.components || {},
      icons: definition.icons || {},
    });
  }

  static apply(id) {
    const def = UISkins._definitions.get(id);
    if (!def) {
      console.warn('[UISkins] Unknown skin:', id);
      return;
    }
    const oldId = UISkins._activeId;
    UISkins._activeId = id;
    document.documentElement.dataset.uiSkin = id;
    const resolved = UISkins._resolve(def);
    for (const [key, value] of Object.entries(resolved.tokens || {})) {
      document.documentElement.style.setProperty(key, value);
    }
    if (oldId && oldId !== id) {
      const oldDef = UISkins._definitions.get(oldId);
      if (oldDef) {
        const oldResolved = UISkins._resolve(oldDef);
        if (oldResolved.tokens) {
          for (const key of Object.keys(oldResolved.tokens)) {
            if (!(key in (resolved.tokens || {}))) {
              document.documentElement.style.removeProperty(key);
            }
          }
        }
      }
    }
    UISkins._decorateShell();
    UISkins._reapplyDynamicTrees();
    document.dispatchEvent(new CustomEvent('ui:skin-changed', { detail: { id } }));
  }

  static getActive() {
    const def = UISkins._definitions.get(UISkins._activeId);
    return def ? UISkins._resolve(def) : null;
  }

  static get(id) {
    const def = UISkins._definitions.get(id || UISkins._activeId);
    return def ? UISkins._resolve(def) : null;
  }

  static get ids() {
    return Array.from(UISkins._definitions.keys());
  }

  static get definitions() {
    return Array.from(UISkins._definitions.values()).map(d => ({
      id: d.id,
      name: d.name,
    }));
  }

  static cls(component, variant) {
    const def = UISkins.getActive();
    if (!def) return '';
    const key = variant ? `${component}.${variant}` : component;
    return def.classes[key] || def.classes[component] || '';
  }

  static decorate(el, component, variant) {
    if (!el) return el;
    const entry = UISkins._decorated.get(el) || new Map();
    const key = variant ? `${component}.${variant}` : component;
    const prev = entry.get(key);
    if (prev) el.classList.remove(prev);
    const cls = UISkins.cls(component, variant);
    if (cls) el.classList.add(cls);
    entry.set(key, cls);
    UISkins._decorated.set(el, entry);
    el.setAttribute('data-ui-component', key);
    return el;
  }

  static decorateTree(root, map) {
    if (!root) return;
    for (const [component, selector, variant] of map) {
      if (typeof selector === 'string') {
        root.querySelectorAll(selector).forEach(el => UISkins.decorate(el, component, variant));
      } else if (selector instanceof Element) {
        UISkins.decorate(selector, component, variant);
      }
    }
    UISkins._dynamicTrees.push({ root, map, ref: root.dataset?.uiTreeRef || null });
  }

  static icon(name, options) {
    const def = UISkins.getActive();
    if (!def) return '';
    const fn = def.icons[name];
    if (typeof fn === 'function') return fn(options || {});
    return fn || '';
  }

  static renderComponent(component, context) {
    const def = UISkins.getActive();
    if (!def) return null;
    const handler = def.components[component];
    if (typeof handler === 'function') return handler(context);
    if (handler && typeof handler.render === 'function') return handler.render(context);
    return null;
  }

  static resolvePreference(key) {
    const def = UISkins._definitions.get(UISkins._activeId);
    if (!def) return undefined;
    const resolved = UISkins._resolve(def);
    return resolved.preferences ? resolved.preferences[key] : undefined;
  }

  static resolveSetting(key, userValue) {
    if (userValue !== 'skin') return userValue;
    const skinVal = UISkins.resolvePreference(key);
    return skinVal !== undefined ? skinVal : UISkins._builtinDefaults[key];
  }

  static _builtinDefaults = {
    theme: 'dark',
    accent: 'gold',
    fontFamily: 'inter',
    fontSize: 1.083,
    margins: 1.0,
    lineSpacing: 1.8,
    letterSpacing: 0.005,
    bionic: false,
    bionicStrength: 0.45,
    redLetter: true,
    redLetterColor: '#B22222',
    footnotes: true,
    chapterTitle: true,
    sectionHeadings: true,
    poetryFormatting: true,
    paragraphMode: false,
    crossRefs: false,
    backgroundTexture: true,
    chapterHeaderAlignment: 'center',
    sectionHeadingAlignment: 'center',
    verseTextAlignment: 'left',
    verseNumberPlacement: 'inline',
  };

  static _resolve(def) {
    if (!def.parent) return def;
    const parent = UISkins._definitions.get(def.parent);
    if (!parent) return def;
    const resolved = UISkins._resolve(parent);
    return {
      id: def.id,
      name: def.name,
      parent: def.parent,
      tokens: { ...(resolved.tokens || {}), ...(def.tokens || {}) },
      preferences: { ...(resolved.preferences || {}), ...(def.preferences || {}) },
      classes: { ...(resolved.classes || {}), ...(def.classes || {}) },
      components: { ...(resolved.components || {}), ...(def.components || {}) },
      icons: { ...(resolved.icons || {}), ...(def.icons || {}) },
    };
  }

  static _reapplyDynamicTrees() {
    for (const entry of UISkins._dynamicTrees) {
      if (!document.body.contains(entry.root)) continue;
      for (const [component, selector, variant] of entry.map) {
        if (typeof selector === 'string') {
          entry.root.querySelectorAll(selector).forEach(el => UISkins.decorate(el, component, variant));
        } else if (selector instanceof Element) {
          UISkins.decorate(selector, component, variant);
        }
      }
    }
  }

  static _decorateShell() {
    const map = [
      ['reading-toolbar', '#verse-progress'],
      ['reading-toolbar-label', '#verse-progress-label'],
      ['reading-toolbar-crossrefs', '#crossref-bar'],
      ['reading-toolbar-tag-results', '#tag-results-bar'],
      ['chapter-summary-header', '#chapter-header'],
      ['chapter-summary-emblem', '#chapter-emblem'],
      ['chapter-summary-title', '#chapter-title'],
      ['chapter-summary-subtitle', '#chapter-subtitle'],
      ['bottom-navigation', '#bottom-nav'],
      ['highlight-toolbar', '#highlight-toolbar'],
      ['app-surface', '#landscape-layout'],
      ['content-area', '#content'],
      ['translation-dropdown', '#panel-left-translation-dropdown'],
      ['translation-dropdown', '#panel-right-translation-dropdown'],
      ['splash-screen', '#splash-screen'],
      ['error-message', '#error-message'],
      ['mode-popup', '#mode-popup'],
      ['more-popup', '#more-popup'],
      ['search-panel', '#discover-panel'],
      ['search-backdrop', '#discover-backdrop'],
      ['speed-controls', '#speed-controls'],
      ['install-banner', '#install-banner'],
      ['install-sheet', '#install-ios-sheet'],
      ['bookmark-set-picker', '#bookmark-set-picker'],
      ['settings-panel', '#settings-panel'],
      ['plans-panel', '#plans-panel'],
      ['notes-panel', '#notes-panel'],
      ['library-panel', '#library-panel'],
      ['crossref-panel', '#crossref-panel'],
      ['crossref-overlay', '#crossref-overlay'],
    ];
    for (const [component, selector] of map) {
      const el = document.querySelector(selector);
      if (el) UISkins.decorate(el, component);
    }
    document.querySelectorAll('#bottom-nav .tab-item').forEach(el => {
      UISkins.decorate(el, 'bottom-navigation-tab');
      if (el.classList.contains('tab-bible')) {
        UISkins.decorate(el, 'bottom-navigation-tab', 'primary');
      }
      if (el.classList.contains('active')) {
        UISkins.decorate(el, 'bottom-navigation-tab', 'active');
      }
    });
    document.querySelectorAll('.desktop-chapter-bar').forEach(el => {
      UISkins.decorate(el, 'passage-navigation', el.classList.contains('desktop-chapter-bar--prev') ? 'prev' : 'next');
    });
    document.querySelectorAll('.hl-swatch').forEach(el => UISkins.decorate(el, 'highlight-swatch'));
    document.querySelectorAll('.hl-action').forEach(el => UISkins.decorate(el, 'highlight-action'));
    document.querySelectorAll('.mode-item').forEach(el => UISkins.decorate(el, 'mode-menu-item'));
    document.querySelectorAll('.more-item').forEach(el => UISkins.decorate(el, 'more-menu-item'));
    document.querySelectorAll('#mode-popup .mode-grid').forEach(el => UISkins.decorate(el, 'mode-menu'));
    document.querySelectorAll('#more-popup .more-item').forEach(el => UISkins.decorate(el, 'more-menu-item'));
    UISkins.decorate(document.body, 'app-body');
    document.querySelectorAll('#settings-panel .section-header').forEach(el => UISkins.decorate(el, 'settings-section-header'));
    document.querySelectorAll('#settings-panel .setting-row').forEach(el => UISkins.decorate(el, 'setting-row'));
    document.querySelectorAll('#settings-panel .accent-swatch').forEach(el => UISkins.decorate(el, 'accent-swatch'));
    document.querySelectorAll('#library-panel .library-header').forEach(el => UISkins.decorate(el, 'library-header'));
    document.querySelectorAll('#library-panel .library-tab').forEach(el => UISkins.decorate(el, 'library-tab'));
    document.querySelectorAll('#library-panel .library-body').forEach(el => UISkins.decorate(el, 'library-body'));
    document.querySelectorAll('#crossref-panel .crossref-header').forEach(el => UISkins.decorate(el, 'crossref-header'));
    document.querySelectorAll('#crossref-panel .crossref-body').forEach(el => UISkins.decorate(el, 'crossref-body'));
    document.querySelectorAll('#discover-panel .discover-header').forEach(el => UISkins.decorate(el, 'search-header'));
    document.querySelectorAll('#discover-panel #discover-input').forEach(el => UISkins.decorate(el, 'search-input'));
    document.querySelectorAll('#discover-panel #discover-results').forEach(el => UISkins.decorate(el, 'search-results'));
    document.querySelectorAll('#changelog-panel').forEach(el => UISkins.decorate(el, 'changelog-panel'));
    document.querySelectorAll('#debug-log-panel').forEach(el => UISkins.decorate(el, 'debug-log-panel'));
    document.querySelectorAll('#install-banner .install-banner-body').forEach(el => UISkins.decorate(el, 'install-banner-body'));
    document.querySelectorAll('#install-ios-sheet .install-ios-header').forEach(el => UISkins.decorate(el, 'install-sheet-header'));
    document.querySelectorAll('#install-ios-sheet .install-ios-body').forEach(el => UISkins.decorate(el, 'install-sheet-body'));
    document.querySelectorAll('#speed-controls .speed-control-row').forEach(el => UISkins.decorate(el, 'speed-control-row'));
    document.querySelectorAll('#mode-popup .mode-item').forEach(el => {
      UISkins.decorate(el, 'mode-menu-item');
      if (el.classList.contains('active')) UISkins.decorate(el, 'mode-menu-item', 'active');
    });
    document.querySelectorAll('#sync-section-body .setting-row').forEach(el => UISkins.decorate(el, 'setting-row'));
  }

  static _registerDefaults() {
    UISkins.register('classic', {
      name: 'Classic',
      tokens: {
        '--ui-texture': 'var(--paper-texture)',
        '--ui-accent': 'var(--accent-color)',
        '--ui-accent-dim': 'var(--accent-color-dim)',
        '--ui-accent-glow': 'var(--accent-color-glow)',
        '--ui-accent-glow-strong': 'var(--accent-color-glow-strong)',
        '--ui-accent-contrast': 'var(--progress-text)',
        '--skin-chapter-header-align': 'center',
        '--skin-section-heading-align': 'center',
        '--skin-verse-align': 'left',
      },
      preferences: {
        theme: 'dark',
        accent: 'gold',
        backgroundTexture: true,
        fontFamily: 'inter',
        fontSize: 1.083,
        margins: 1.0,
        lineSpacing: 1.8,
        letterSpacing: 0.005,
        chapterHeaderAlignment: 'center',
        sectionHeadingAlignment: 'center',
        verseTextAlignment: 'left',
        verseNumberPlacement: 'inline',
        redLetter: true,
        redLetterColor: '#B22222',
        footnotes: true,
        chapterTitle: true,
        sectionHeadings: true,
        poetryFormatting: true,
        paragraphMode: false,
        crossRefs: false,
        bionic: false,
        bionicStrength: 0.45,
      },
      classes: {
        'verse-number': 'verse-num',
        'footnote-caller': 'footnote-caller',
        'crossref-indicator': 'crossref-indicator',
        'heading-crossref': 'token-section-heading-ref',
        'chapter-header': 'chapter-header',
        'chapter-title': 'chapter-title',
        'section-heading': 'token-section-heading',

        'app-surface': '',
        'app-body': '',
        'content-area': '',
        'splash-screen': '',
        'error-message': '',
        'translation-dropdown': '',
        'search-panel': '',
        'search-backdrop': '',
        'speed-controls': '',
        'install-banner': '',
        'install-sheet': '',
        'bookmark-set-picker': '',
        'settings-panel': '',
        'library-panel': '',
        'crossref-panel': '',
        'crossref-overlay': '',
        'notes-panel': '',
        'plans-panel': '',

        'settings-section-header': '',
        'setting-row': '',
        'accent-swatch': '',

        'library-body': '',
        'library-tab': '',

        'crossref-header': '',
        'crossref-body': '',

        'search-header': '',
        'search-input': '',
        'search-results': '',
        'search-result': '',
        'search-result-ref': '',
        'search-result-text': '',
        'search-empty': '',
        'search-result': '',

        'install-banner-body': '',
        'install-sheet-header': '',
        'install-sheet-body': '',

        'speed-control-row': '',

        'footnote-popup': '',
        'selection-card': '',
        'bookmark-indicator': '',
        'verse-selection': '',

        'chapter-summary-header': '',
        'chapter-summary-emblem': '',
        'chapter-summary-title': '',
        'chapter-summary-subtitle': '',

        'reading-toolbar': '',
        'reading-toolbar-label': '',
        'reading-toolbar-crossrefs': '',
        'reading-toolbar-tag-results': '',

        'bottom-navigation': '',
        'bottom-navigation-tab': '',
        'bottom-navigation-tab.active': '',
        'bottom-navigation-tab.primary': '',

        'passage-navigation': '',
        'passage-navigation-action': '',
        'passage-navigation-label': '',

        'reading-plan-card': '',
        'reading-plan-title': '',
        'reading-plan-passages': '',
        'reading-plan-action': '',
        'reading-plan-dismiss': '',

        'mode-menu': '',
        'mode-menu-item': '',
        'mode-menu-item.active': '',
        'more-menu': '',
        'more-menu-item': '',
        'action-toolbar': '',
        'action-button': '',
        'highlight-toolbar': '',
        'highlight-swatch': '',
        'highlight-action': '',

        'background-texture': '',
        'background-texture-image': '',

        'bookmark-set-picker': '',
        'dialog': '',
        'sync-onboarding': '',
        'scripture-repo-panel': '',
      },
      components: {
        'section-heading': {
          render(ctx) {
            const el = document.createElement('div');
            el.className = 'token-section-heading';
            el.textContent = ctx.text;
            return { element: el, lastHeadingEl: el };
          },
        },
      },
      icons: {
        footnote: () => '<span class="footnote-marker">*</span>',
        footnoteCaller: () => {
          const el = document.createElement('span');
          el.className = 'footnote-caller';
          return el;
        },
      },
    });
  }
};

UISkins._registerDefaults();
