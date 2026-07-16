window.BionicParser = class BionicParser {
  static parse(text, strength = 0.45) {
    if (!text) return '';
    const words = text.split(/(\s+)/);
    return words.map((word) => {
      const { prefix, core, suffix } = BionicParser.splitPunctuation(word);
      if (!core) return word;
      const fix = Math.min(Math.max(Math.ceil(core.length * strength), 1), core.length);
      return prefix + '<b>' + core.slice(0, fix) + '</b>' + core.slice(fix) + suffix;
    }).join('');
  }

  static splitPunctuation(word) {
    if (!word) return { prefix: '', core: '', suffix: '' };

    let prefix = '', core = word, suffix = '';

    const leading = word.match(/^([^a-zA-Z\u2018\u2019-]*)/);
    if (leading && leading[1].length > 0) {
      prefix = leading[1];
      core = word.slice(prefix.length);
    }

    const trailing = core.match(/([^a-zA-Z\u2018\u2019-]*)$/);
    if (trailing && trailing[1].length > 0) {
      suffix = trailing[1];
      core = core.slice(0, -suffix.length);
    }

    return { prefix, core, suffix };
  }
};
