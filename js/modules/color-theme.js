window.ColorTheme = class ColorTheme {
  constructor(bridge) {
    this.bridge = bridge;
  }

  static definitions = [
    { id: 'gold', label: 'Gold', color: '#D0A96C' },
    { id: 'purple', label: 'Purple', color: '#8B5CF6' },
    { id: 'emerald', label: 'Emerald', color: '#10B981' },
    { id: 'sapphire', label: 'Sapphire', color: '#3B82F6' },
    { id: 'rose', label: 'Rose', color: '#E11D48' },
    { id: 'amber', label: 'Amber', color: '#F59E0B' },
    { id: 'pink', label: 'Pink', color: '#EC4899' },
    { id: 'slate', label: 'Slate', color: '#5E81AC' },
    { id: 'sage', label: 'Sage', color: '#4A6B5D' },
    { id: 'ice', label: 'Ice', color: '#88C0D0' },
    { id: 'bronze', label: 'Bronze', color: '#B8860B' },
    { id: 'teal', label: 'Teal', color: '#14B8A6' },
    { id: 'coral', label: 'Coral', color: '#E06B6B' },
    { id: 'lilac', label: 'Lilac', color: '#A78BFA' },
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
  }

  current() {
    return this.bridge.state.get('accent') || 'gold';
  }
};
