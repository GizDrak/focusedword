window.ColorTheme = class ColorTheme {
  constructor(bridge) {
    this.bridge = bridge;
  }

  static definitions = [
    { id: 'gold', label: 'Gold', color: '#D4AF37', contrastText: 'dark' },
    { id: 'purple', label: 'Purple', color: '#7C3AED', contrastText: 'light' },
    { id: 'emerald', label: 'Emerald', color: '#10B981', contrastText: 'light' },
    { id: 'sapphire', label: 'Sapphire', color: '#2563EB', contrastText: 'light' },
    { id: 'rose', label: 'Rose', color: '#E11D48', contrastText: 'light' },
    { id: 'amber', label: 'Amber', color: '#F59E0B', contrastText: 'dark' },
    { id: 'slate', label: 'Slate', color: '#64748B', contrastText: 'light' },
    { id: 'pink', label: 'Pink', color: '#F472B6', contrastText: 'dark' },
    { id: 'mint', label: 'Mint', color: '#34D399', contrastText: 'dark' },
    { id: 'ice', label: 'Ice', color: '#67E8F9', contrastText: 'dark' },
    { id: 'bronze', label: 'Bronze', color: '#B45309', contrastText: 'light' },
    { id: 'teal', label: 'Teal', color: '#0F766E', contrastText: 'light' },
    { id: 'indigo', label: 'Indigo', color: '#4F46E5', contrastText: 'light' },
    { id: 'coral', label: 'Coral', color: '#F87171', contrastText: 'light' },
  ];

  static getSetColors() {
    return [
      { label: 'Purple', color: '#7C3AED' },
      { label: 'Gold', color: '#D4AF37' },
      { label: 'Emerald', color: '#10B981' },
      { label: 'Sapphire', color: '#2563EB' },
      { label: 'Rose', color: '#E11D48' },
      { label: 'Amber', color: '#F59E0B' },
      { label: 'Mint', color: '#34D399' },
    ];
  }
  init() {
    const saved = this.bridge.state.get('accent');
    this.apply(saved || 'gold');
  }

  setAccent(id) {
    this.bridge.state.set('accent', id);
    this.apply(id);
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
