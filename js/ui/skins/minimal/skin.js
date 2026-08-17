(function () {
  'use strict';

  if (!window.UISkins) {
    console.error('[Minimal] UISkins is unavailable. Load skin-system.js first.');
    return;
  }

  UISkins.register('minimal', {
    name: 'Minimal',
    parent: 'classic',

    preferences: {
      theme: 'dark',
      accent: 'gold',
      backgroundTexture: false,
      fontFamily: 'inter',
      fontSize: 1.083,
      margins: 1.0,
      lineSpacing: 1.8,
      letterSpacing: 0.005,
      chapterHeaderAlignment: 'center',
      sectionHeadingAlignment: 'center',
      verseTextAlignment: 'left',
      verseNumberPlacement: 'gutter',
      redLetter: true,
      redLetterColor: '#BC3636',
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
      'verse-number': 'minimal-verse-number',
      'footnote-caller': 'minimal-footnote-caller',
      'crossref-indicator': 'minimal-crossref-indicator',
      'heading-crossref': 'minimal-heading-crossref',

      'chapter-summary-header': 'minimal-chapter-summary-header',
      'chapter-summary-emblem': 'minimal-chapter-summary-emblem',
      'chapter-summary-title': 'minimal-chapter-summary-title',
      'chapter-summary-subtitle': 'minimal-chapter-summary-subtitle',

      'reading-toolbar': 'minimal-reading-toolbar',
      'reading-toolbar-label': 'minimal-reading-toolbar-label',
      'reading-toolbar-crossrefs': 'minimal-reading-toolbar-crossrefs',
      'reading-toolbar-tag-results': 'minimal-reading-toolbar-tag-results',

      'section-heading': 'minimal-section-heading',

      'bottom-navigation': 'minimal-bottom-nav',
      'bottom-navigation-tab': 'minimal-nav-tab',
      'bottom-navigation-tab.active': 'minimal-nav-tab--active',
      'bottom-navigation-tab.primary': 'minimal-nav-tab--primary',

      'passage-navigation': 'minimal-passage-nav',
      'passage-navigation-action': 'minimal-passage-nav-action',
      'passage-navigation-label': 'minimal-passage-nav-label',

      'mode-menu': 'minimal-mode-menu',
      'mode-menu-item': 'minimal-mode-menu-item',
      'mode-menu-item.active': 'minimal-mode-menu-item--active',
      'more-menu-item': 'minimal-more-menu-item',

      'highlight-toolbar': 'minimal-highlight-toolbar',
      'highlight-swatch': 'minimal-highlight-swatch',
      'highlight-action': 'minimal-highlight-action',
      'action-toolbar': 'minimal-action-toolbar',
      'action-button': 'minimal-action-button',

      'speed-controls': 'minimal-speed-controls',
      'speed-control-row': 'minimal-speed-control-row',

      'install-banner': 'minimal-install-banner',
      'install-banner-body': 'minimal-install-banner-body',
      'install-sheet': 'minimal-install-sheet',
      'install-sheet-header': 'minimal-install-sheet-header',
      'install-sheet-body': 'minimal-install-sheet-body',

      'bookmark-set-picker': 'minimal-bookmark-set-picker',
      'dialog': 'minimal-dialog',
      'sync-onboarding': 'minimal-sync-onboarding',
      'scripture-repo-panel': 'minimal-scripture-repo-panel',

      'settings-panel': 'minimal-settings-panel',
      'settings-section-header': 'minimal-settings-section-header',
      'setting-row': 'minimal-setting-row',
      'accent-swatch': 'minimal-accent-swatch',

      'library-panel': 'minimal-library-panel',
      'library-header': 'minimal-library-header',
      'library-tab': 'minimal-library-tab',
      'library-body': 'minimal-library-body',

      'notes-panel': 'minimal-notes-panel',
      'plans-panel': 'minimal-plans-panel',
      'crossref-panel': 'minimal-crossref-panel',
      'crossref-header': 'minimal-crossref-header',
      'crossref-body': 'minimal-crossref-body',
      'crossref-overlay': 'minimal-crossref-overlay',

      'search-panel': 'minimal-search-panel',
      'search-backdrop': 'minimal-search-backdrop',
      'search-header': 'minimal-search-header',
      'search-input': 'minimal-search-input',
      'search-results': 'minimal-search-results',
      'search-result': 'minimal-search-result',
      'search-result-ref': 'minimal-search-result-ref',
      'search-result-text': 'minimal-search-result-text',
      'search-empty': 'minimal-search-empty',

      'reading-plan-card': 'minimal-reading-plan-card',
      'reading-plan-title': 'minimal-reading-plan-title',
      'reading-plan-passages': 'minimal-reading-plan-passages',
      'reading-plan-action': 'minimal-reading-plan-action',
      'reading-plan-dismiss': 'minimal-reading-plan-dismiss',

      'changelog-panel': 'minimal-changelog-panel',
      'debug-log-panel': 'minimal-debug-log-panel',
    },

    components: {
      'section-heading': {
        render(ctx) {
          const el = document.createElement('div');
          el.className = 'minimal-section-heading';
          el.textContent = ctx.text || '';
          return { element: el, lastHeadingEl: el };
        },
      },
    },

    icons: {
      footnote: () => '<span class="minimal-icon minimal-icon--footnote" aria-hidden="true">*</span>',
      crossref: () =>
        '<span class="minimal-icon minimal-icon--crossref" aria-hidden="true">\u00B6</span>',
    },
  });
})();
