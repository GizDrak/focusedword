// client/js/ui/skins/luminous/skin.js
(() => {
  'use strict';

  if (!window.UISkins) {
    console.error('[Luminous] UISkins is unavailable. Load skin-system.js first.');
    return;
  }

  UISkins.register('luminous', {
    name: 'Luminous',
    parent: 'classic',

    tokens: {
      '--luminous-bg': 'color-mix(in srgb, var(--accent-color) 4%, var(--luminous-bg-base))',
      '--luminous-bg-elevated': 'color-mix(in srgb, var(--accent-color) 6%, var(--luminous-bg-elevated-base))',
      '--luminous-surface': 'color-mix(in srgb, var(--accent-color) 12%, var(--luminous-surface-base))',
      '--luminous-surface-strong': 'color-mix(in srgb, var(--accent-color) 14%, var(--luminous-surface-strong-base))',
      '--luminous-surface-hover': 'color-mix(in srgb, var(--accent-color) 20%, var(--luminous-surface-hover-base))',
      '--luminous-border': 'color-mix(in srgb, var(--ui-accent) 18%, transparent)',
      '--luminous-border-strong': 'color-mix(in srgb, var(--ui-accent) 56%, transparent)',
      '--luminous-text': 'var(--luminous-text-color)',
      '--luminous-text-soft': 'var(--luminous-text-soft-color)',
      '--luminous-text-muted': 'var(--luminous-text-muted-color)',
      '--luminous-accent': 'var(--ui-accent)',
      '--luminous-accent-bright': 'color-mix(in srgb, var(--ui-accent) 85%, white)',
      '--luminous-accent-soft': 'color-mix(in srgb, var(--ui-accent) 15%, transparent)',
      '--luminous-glow': '0 0 30px var(--ui-accent-glow)',
      '--luminous-radius-sm': '10px',
      '--luminous-radius-md': '16px',
      '--luminous-radius-lg': '24px',
      '--luminous-shadow': 'var(--luminous-shadow-value)',
      '--skin-chapter-header-align': 'left',
      '--skin-section-heading-align': 'left',
      '--skin-verse-align': 'left'
    },

    preferences: {
      theme: 'galaxy',
      accent: 'purple',
      backgroundTexture: false,
      fontFamily: 'lora',
      fontSize: 1.12,
      margins: 1.15,
      lineSpacing: 1.78,
      letterSpacing: 0.004,
      chapterHeaderAlignment: 'left',
      sectionHeadingAlignment: 'left',
      verseTextAlignment: 'left',
      verseNumberPlacement: 'gutter',
      redLetter: true,
      redLetterColor: '#D06A7A',
      footnotes: true,
      chapterTitle: true,
      sectionHeadings: true,
      poetryFormatting: true,
      paragraphMode: false,
      crossRefs: false,
      bionic: false,
      bionicStrength: 0.45
    },

    classes: {
      "verse-number": "luminous-verse-number",
      "footnote-caller": "luminous-footnote-caller",
      "crossref-indicator": "luminous-crossref-indicator",
      "heading-crossref": "luminous-heading-crossref",
      "chapter-summary-header": "luminous-chapter-summary-header",
      "chapter-summary-emblem": "luminous-chapter-summary-emblem",
      "chapter-summary-title": "luminous-chapter-summary-title",
      "chapter-summary-subtitle": "luminous-chapter-summary-subtitle",
      "reading-toolbar": "luminous-reading-toolbar",
      "reading-toolbar-label": "luminous-reading-toolbar-label",
      "reading-toolbar-crossrefs": "luminous-reading-toolbar-crossrefs",
      "reading-toolbar-tag-results": "luminous-reading-toolbar-tag-results",
      "section-heading": "luminous-section-heading",
      "bottom-navigation": "luminous-bottom-navigation",
      "bottom-navigation-tab": "luminous-bottom-navigation-tab",
      "bottom-navigation-tab.active": "luminous-bottom-navigation-tab--active",
      "bottom-navigation-tab.primary": "luminous-bottom-navigation-tab--primary",
      "passage-navigation": "luminous-passage-navigation",
      "passage-navigation-action": "luminous-passage-navigation-action",
      "passage-navigation-label": "luminous-passage-navigation-label",
      "mode-menu": "luminous-mode-menu",
      "mode-menu-item": "luminous-mode-menu-item",
      "mode-menu-item.active": "luminous-mode-menu-item--active",
      "more-menu": "luminous-more-menu",
      "more-menu-item": "luminous-more-menu-item",
      "desktop-passage-nav": "luminous-desktop-passage-nav",
      "reading-plan-card": "luminous-reading-plan-card",
      "reading-plan-title": "luminous-reading-plan-title",
      "reading-plan-passages": "luminous-reading-plan-passages",
      "reading-plan-action": "luminous-reading-plan-action",
      "reading-plan-dismiss": "luminous-reading-plan-dismiss",
      "highlight-toolbar": "luminous-highlight-toolbar",
      "highlight-swatch": "luminous-highlight-swatch",
      "highlight-action": "luminous-highlight-action",
      "action-toolbar": "luminous-action-toolbar",
      "action-button": "luminous-action-button",
      "app-surface": "luminous-app-surface",
      "app-body": "luminous-app-body",
      "content-area": "luminous-content-area",
      "splash-screen": "luminous-splash-screen",
      "error-message": "luminous-error-message",
      "translation-dropdown": "luminous-translation-dropdown",
      "search-panel": "luminous-search-panel",
      "search-backdrop": "luminous-search-backdrop",
      "search-header": "luminous-search-header",
      "search-input": "luminous-search-input",
      "search-results": "luminous-search-results",
      "search-result": "luminous-search-result",
      "search-result-ref": "luminous-search-result-ref",
      "search-result-text": "luminous-search-result-text",
      "search-empty": "luminous-search-empty",
      "speed-controls": "luminous-speed-controls",
      "speed-control-row": "luminous-speed-control-row",
      "install-banner": "luminous-install-banner",
      "install-banner-body": "luminous-install-banner-body",
      "install-sheet": "luminous-install-sheet",
      "install-sheet-header": "luminous-install-sheet-header",
      "install-sheet-body": "luminous-install-sheet-body",
      "bookmark-set-picker": "luminous-bookmark-set-picker",
      "mode-popup": "luminous-mode-popup",
      "more-popup": "luminous-more-popup",
      "settings-panel": "luminous-settings-panel",
      "settings-section-header": "luminous-settings-section-header",
      "setting-row": "luminous-setting-row",
      "accent-swatch": "luminous-accent-swatch",
      "library-panel": "luminous-library-panel",
      "library-body": "luminous-library-body",
      "library-tab": "luminous-library-tab",
      "library-header": "luminous-library-header",
      "notes-panel": "luminous-notes-panel",
      "plans-panel": "luminous-plans-panel",
      "crossref-panel": "luminous-crossref-panel",
      "crossref-overlay": "luminous-crossref-overlay",
      "crossref-header": "luminous-crossref-header",
      "crossref-body": "luminous-crossref-body",
    },

    components: {
      'section-heading': {
        render(ctx) {
          const wrapper = document.createElement('div');
          wrapper.className = 'luminous-section-heading';

          const text = document.createElement('span');
          text.className = 'luminous-section-heading__text';
          text.textContent = ctx.text || '';

          wrapper.append(text);
          return { element: wrapper, lastHeadingEl: text };
        }
      }
    },

    icons: {
      footnote: () =>
        '<span class="luminous-inline-icon luminous-inline-icon--footnote" aria-hidden="true">+</span>',
      crossref: () => `
        <span class="luminous-inline-icon luminous-inline-icon--crossref" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
            <path d="M5.25 10.75 10.75 5.25M6.5 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9.5M9.5 2h4.5v4.5"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>`
    }
  });
})();
