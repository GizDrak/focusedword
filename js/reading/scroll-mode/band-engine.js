window.BandEngine = {
  getReadingBandY: function getReadingBandY(scrollY, vh, docH) {
    const TOP_ZONE_FRAC = 0.25;
    const BOTTOM_ZONE_FRAC = 0.5;
    const TOP_LERP_START = 0.10;
    const TOP_LERP_END = 0.25;
    const BOTTOM_LERP_START = 0.25;
    const BOTTOM_LERP_END = 0.9;

    const distFromBottom = docH - (scrollY + vh);

    if (scrollY < vh * TOP_ZONE_FRAC) {
      const t = scrollY / (vh * TOP_ZONE_FRAC);
      return vh * (TOP_LERP_START + t * (TOP_LERP_END - TOP_LERP_START));
    }

    if (distFromBottom < vh * BOTTOM_ZONE_FRAC) {
      const t = 1 - (distFromBottom / (vh * BOTTOM_ZONE_FRAC));
      return vh * (BOTTOM_LERP_START + t * (BOTTOM_LERP_END - BOTTOM_LERP_START));
    }

    return vh * 0.25;
  }
};
