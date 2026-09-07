UISkins.register('modern', {
  name: 'Modern',
  parent: 'classic',
  tokens: {
    '--skin-chapter-header-align': 'center',
    '--skin-section-heading-align': 'center',
    '--skin-verse-align': 'left',
    '--text-secondary': 'color-mix(in srgb, var(--accent-color) 68%, var(--text-primary))',
    '--text-muted': 'color-mix(in srgb, var(--accent-color) 42%, var(--text-primary))',
  },
  preferences: {
    sectionHeadingAlignment: 'center',
    accent: 'mist',
    backgroundTexture: false,
    verseNumberPlacement: 'gutter',
  },
  classes: {
    'section-heading': 'sh-pill-container',
    'bottom-navigation': 'modern-bottom-nav',
    'bottom-navigation-tab': 'modern-nav-tab',
    'bottom-navigation-tab.active': 'modern-nav-tab--active',
    'bottom-navigation-tab.primary': 'modern-nav-tab--primary',

    'reading-toolbar': 'modern-reading-toolbar',
    'reading-toolbar-label': 'modern-reading-toolbar-label',
    'reading-toolbar-crossrefs': 'modern-reading-toolbar-crossrefs',
    'reading-toolbar-tag-results': 'modern-reading-toolbar-tag-results',

    'mode-popup': 'modern-mode-popup',
    'mode-menu': 'modern-mode-menu',
    'mode-menu-item': 'modern-mode-menu-item',
    'mode-menu-item.active': 'modern-mode-menu-item--active',
    'more-popup': 'modern-more-popup',
    'more-menu-item': 'modern-more-menu-item',

    'settings-panel': 'modern-settings-panel',
    'settings-section-header': 'modern-settings-section-header',
    'setting-row': 'modern-setting-row',
    'accent-swatch': 'modern-accent-swatch',

    'notes-panel': 'modern-notes-panel',
    'plans-panel': 'modern-plans-panel',
    'crossref-panel': 'modern-crossref-panel',
    'crossref-header': 'modern-crossref-header',
    'crossref-body': 'modern-crossref-body',
    'crossref-overlay': 'modern-crossref-overlay',

    'library-panel': 'modern-library-panel',
    'library-header': 'modern-library-header',
    'library-tab': 'modern-library-tab',
    'library-body': 'modern-library-body',
    'search-panel': 'modern-search-panel',
    'search-backdrop': 'modern-search-backdrop',
    'search-header': 'modern-search-header',
    'search-input': 'modern-search-input',
    'search-results': 'modern-search-results',
    'search-result': 'modern-search-result',
    'search-result-ref': 'modern-search-result-ref',
    'search-result-text': 'modern-search-result-text',
    'search-empty': 'modern-search-empty',

    'speed-controls': 'modern-speed-controls',
    'speed-control-row': 'modern-speed-control-row',

    'highlight-toolbar': 'modern-highlight-toolbar',
    'highlight-swatch': 'modern-highlight-swatch',
    'highlight-action': 'modern-highlight-action',

    'install-banner': 'modern-install-banner',
    'install-banner-body': 'modern-install-banner-body',
    'install-sheet': 'modern-install-sheet',
    'install-sheet-header': 'modern-install-sheet-header',
    'install-sheet-body': 'modern-install-sheet-body',

    'reading-plan-card': 'modern-reading-plan-card',
    'reading-plan-title': 'modern-reading-plan-title',
    'reading-plan-passages': 'modern-reading-plan-passages',
    'reading-plan-action': 'modern-reading-plan-action',
    'reading-plan-dismiss': 'modern-reading-plan-dismiss',

    'changelog-panel': 'modern-changelog-panel',
    'debug-log-panel': 'modern-debug-log-panel',

    'bookmark-set-picker': 'modern-bookmark-set-picker',
    'dialog': 'modern-dialog',
    'sync-onboarding': 'modern-sync-onboarding',
    'scripture-repo-panel': 'modern-scripture-repo-panel',
  },
  components: {
    'section-heading': {
      render(ctx) {
        const container = document.createElement('div');
        container.className = 'sh-pill-container';
        const center = document.createElement('div');
        center.className = 'sh-pill-center';
        const pill = document.createElement('div');
        pill.className = 'sh-pill';
        pill.textContent = ctx.text;
        center.appendChild(pill);
        container.appendChild(center);
        return { element: container, lastHeadingEl: container };
      },
    },
  },
});

/* ── Notch gradient sync ──────────────────────────
   Resolve CSS custom properties to concrete stop-color
   values so the SVG gradient renders in all browsers. */

function normalizeColor(val) {
  val = val.trim();
  if (val.startsWith('rgb')) return val;
  const m = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(val);
  if (m) return `rgb(${Math.round(parseFloat(m[1]) * 255)}, ${Math.round(parseFloat(m[2]) * 255)}, ${Math.round(parseFloat(m[3]) * 255)})`;
  return val;
}

function syncNotchGradient() {
  const root = document.documentElement;
  if (root.dataset.uiSkin !== 'modern') return;

  let probe = syncNotchGradient._probe;
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none';
    document.body.appendChild(probe);
    syncNotchGradient._probe = probe;
  }

  const STOPS = [
    { id: 'modern-nav-stop-0',   prop: '--modern-surface-top' },
    { id: 'modern-nav-stop-40',  prop: '--modern-surface-mid' },
    { id: 'modern-nav-stop-100', prop: '--modern-surface-bottom' },
  ];

  for (const { id, prop } of STOPS) {
    const el = document.getElementById(id);
    if (!el) continue;
    probe.style.setProperty('color', `var(${prop})`);
    const val = getComputedStyle(probe).color;
    if (val && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
      el.setAttribute('stop-color', normalizeColor(val));
    }
  }
}

// Sync immediately if modern is already active
if (document.documentElement.dataset.uiSkin === 'modern') syncNotchGradient();

// Re-sync when skin or theme changes
new MutationObserver(() => syncNotchGradient()).observe(
  document.documentElement,
  { attributes: true, attributeFilter: ['data-ui-skin', 'data-theme'] }
);
