window.ColorTheme = class ColorTheme {
  constructor(bridge) {
    this.bridge = bridge;
  }

  static get definitions() {
    return [
      { id: 'gold', label: 'Gold', color: '#D4AF37', contrastText: 'dark' },
      { id: 'purple', label: 'Purple', color: '#7C3AED', contrastText: 'light' },
      { id: 'emerald', label: 'Emerald', color: '#10B981', contrastText: 'light' },
      { id: 'sapphire', label: 'Sapphire', color: '#2563EB', contrastText: 'light' },
      { id: 'rose', label: 'Rose', color: '#E11D48', contrastText: 'light' },
      { id: 'amber', label: 'Amber', color: '#E7DDC0', contrastText: 'dark' },
      { id: 'slate', label: 'Slate', color: '#7A88A0', contrastText: 'light' },
      { id: 'pink', label: 'Pink', color: '#F472B6', contrastText: 'dark' },
      { id: 'mint', label: 'Mint', color: '#34D399', contrastText: 'dark' },
      { id: 'ice', label: 'Ice', color: '#67E8F9', contrastText: 'dark' },
      { id: 'bronze', label: 'Bronze', color: '#B45309', contrastText: 'light' },
      { id: 'mist', label: 'Mist', color: '#B7C9D9', contrastText: 'dark' },
      { id: 'teal', label: 'Teal', color: '#0F766E', contrastText: 'light' },
      { id: 'icy', label: 'Icy', color: '#96c5f7', contrastText: 'dark' },
      { id: 'coral', label: 'Coral', color: '#F87171', contrastText: 'light' },
      { id: 'chartreuse', label: 'Chartreuse', color: '#A3E635', contrastText: 'dark' },
      { id: 'lagoon', label: 'Lagoon', color: '#06B6D4', contrastText: 'light' },
      { id: 'orchid', label: 'Orchid', color: '#D946EF', contrastText: 'light' },
      { id: 'vermilion', label: 'Vermilion', color: '#FB923C', contrastText: 'dark' },
    ];
  }

  static getSetColors() {
    return [
      { label: 'Purple', color: '#7C3AED' },
      { label: 'Gold', color: '#D4AF37' },
      { label: 'Emerald', color: '#10B981' },
      { label: 'Sapphire', color: '#2563EB' },
      { label: 'Rose', color: '#E11D48' },
      { label: 'Amber', color: '#E7DDC0' },
      { label: 'Mint', color: '#34D399' },
    ];
  }
  init() {
    const saved = this.bridge.state.get('accent');
    const resolved = window.UISkins ? window.UISkins.resolveSetting('accent', saved) : (saved === 'skin' ? 'gold' : saved);
    this.apply(resolved || 'gold');
  }

  setAccent(id) {
    this.bridge.state.set('accent', id);
    const resolved = window.UISkins ? window.UISkins.resolveSetting('accent', id) : (id === 'skin' ? 'gold' : id);
    this.apply(resolved || 'gold');
  }

  apply(id) {
    document.documentElement.dataset.accent = id;
    const def = ColorTheme.definitions.find(d => d.id === id);
    if (def) {
      document.documentElement.style.setProperty(
        '--progress-text',
        def.contrastText === 'dark' ? '#111827' : '#F9FAFB'
      );
    }
  }
};
