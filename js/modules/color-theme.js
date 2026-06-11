window.ColorTheme = class ColorTheme {
  constructor(bridge) {
    this.bridge = bridge;
  }

  static definitions = [
    { id: 'gold', label: 'Gold', color: '#D0A96C', contrastText: 'dark' },
    { id: 'purple', label: 'Purple', color: '#8B5CF6', contrastText: 'light' },
    { id: 'emerald', label: 'Emerald', color: '#10B981', contrastText: 'light' },
    { id: 'sapphire', label: 'Sapphire', color: '#3B82F6', contrastText: 'light' },
    { id: 'rose', label: 'Rose', color: '#E11D48', contrastText: 'light' },
    { id: 'amber', label: 'Amber', color: '#F59E0B', contrastText: 'dark' },
    { id: 'pink', label: 'Pink', color: '#EC4899', contrastText: 'light' },
    { id: 'slate', label: 'Slate', color: '#5E81AC', contrastText: 'light' },
    { id: 'sage', label: 'Sage', color: '#4A6B5D', contrastText: 'light' },
    { id: 'ice', label: 'Ice', color: '#88C0D0', contrastText: 'dark' },
    { id: 'bronze', label: 'Bronze', color: '#B8860B', contrastText: 'light' },
    { id: 'teal', label: 'Teal', color: '#14B8A6', contrastText: 'light' },
    { id: 'coral', label: 'Coral', color: '#E06B6B', contrastText: 'light' },
    { id: 'lilac', label: 'Lilac', color: '#A78BFA', contrastText: 'dark' },
  ];

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

  current() {
    return this.bridge.state.get('accent') || 'gold';
  }
};
