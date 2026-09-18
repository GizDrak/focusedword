/* iOS 27 standalone-PWA status-bar frost guard.
   Loaded synchronously in <head> so the mitigation is in place before the
   first paint. iOS 27/27.x paints a system frosted band across the top of
   standalone web apps that use apple-mobile-web-app-status-bar-style:
   black-translucent (Safari tabs and landscape are unaffected). On affected
   devices this sets html.ios-top-blur, which activates the reserved-strip
   workaround in css/styles.css.

   QA override (persists in localStorage, survives launches): append
   ?iosBlur=<mode> once on any launch.
     strip       - default: reserve a solid body strip (black-translucent kept)
     default-bar - swap the meta to `default`, which removes the frost band at
                   the cost of an opaque system status bar (needs reinstall)
     force       - apply the strip even if the platform gate misses
     debug       - strip + an on-screen readout of what the guard detected
     off         - no mitigation (reproduce the raw iOS band)
   ?iosStrip=<px> (0-120) tunes the reserved band height for the device and
   persists.

   The detected values are also exposed on window.__iosTopBlur for
   inspection, and on html[data-ios-blur] as the applied mode. */
(function () {
  var GUARD_VERSION = '2';
  var MODE_KEY = 'focused-word:ios-top-blur-mode';
  var STRIP_KEY = 'focused-word:ios-top-blur-strip';
  var VALID = ['strip', 'default-bar', 'force', 'debug', 'off'];

  function uaString() {
    return navigator.userAgent || '';
  }

  function isIOS() {
    if (/iPhone|iPad|iPod/.test(uaString())) return true;
    return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
  }

  function isStandalone() {
    if (navigator.standalone === true) return true;
    try {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches;
    } catch (e) {
      return false;
    }
  }

  function iosMajor() {
    var m = uaString().match(/\bOS (\d+)[._]/) || uaString().match(/Version\/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function readMode() {
    var qs = null;
    try {
      qs = new URLSearchParams(location.search).get('iosBlur');
    } catch (e) {
      qs = null;
    }
    if (qs && VALID.indexOf(qs) !== -1) {
      try { localStorage.setItem(MODE_KEY, qs); } catch (e) {}
      return qs;
    }
    try {
      var stored = localStorage.getItem(MODE_KEY);
      if (stored && VALID.indexOf(stored) !== -1) return stored;
    } catch (e) {}
    return 'strip';
  }

  /* Optional device tuning of the reserved band height (CSS default is 16px):
     ?iosStrip=24 persists and overrides --ios-top-strip. */
  function readStrip() {
    var raw = null;
    try {
      raw = new URLSearchParams(location.search).get('iosStrip');
    } catch (e) {
      raw = null;
    }
    if (!raw) {
      try { raw = localStorage.getItem(STRIP_KEY); } catch (e) {}
    }
    if (!raw) return null;
    var n = parseInt(raw, 10);
    if (!isFinite(n) || n < 0 || n > 120) return null;
    try { localStorage.setItem(STRIP_KEY, String(n)); } catch (e) {}
    return n;
  }

  function snapshot() {
    return {
      guardVersion: GUARD_VERSION,
      mode: mode,
      applied: applied,
      ios: isIOS(),
      standalone: isStandalone(),
      major: iosMajor(),
      userAgent: uaString(),
    };
  }

  var mode = 'strip';
  var applied = false;

  function apply() {
    if (applied) return true;
    applied = true;
    document.documentElement.classList.add('ios-top-blur');
    document.documentElement.setAttribute('data-ios-blur', mode === 'debug' ? 'debug' : 'strip');
    return true;
  }

  try {
    mode = readMode();

    var forced = mode === 'force' || mode === 'debug';
    /* Deliberately fail-open: on any iOS/iPadOS standalone PWA we reserve the
       strip even if the UA version is unparseable or reads older than 26.
       UA version reporting has been unreliable across the 26/27 rename, a
       missed band costs far more than a 16px theme-colored strip, and users
       on older releases can opt out with ?iosBlur=off. */
    var eligible = isIOS() && isStandalone();

    if (mode === 'off') {
      applied = false;
    } else if (mode === 'default-bar') {
      var meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (meta) meta.setAttribute('content', 'default');
      applied = false;
    } else if (forced || eligible) {
      applied = apply();
    } else {
      applied = false;
    }

    var strip = readStrip();
    if (applied && strip !== null) {
      document.documentElement.style.setProperty('--ios-top-strip', strip + 'px');
    }

    window.__iosTopBlur = Object.assign(snapshot(), { apply: apply, refresh: snapshot });

    if (mode === 'debug') {
      document.addEventListener('DOMContentLoaded', function () {
        try {
          var d = window.__iosTopBlur.refresh ? window.__iosTopBlur.refresh() : window.__iosTopBlur;
          var badge = document.createElement('pre');
          badge.setAttribute('data-ios-blur-badge', '');
          badge.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;margin:0;padding:6px 8px;font:10px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;background:rgba(0,0,0,.92);color:#7CFC9A;pointer-events:none';
          var vp = document.getElementById('verse-progress');
          var vpTop = vp ? Math.round(vp.getBoundingClientRect().top) : null;
          badge.textContent =
            'guard v' + d.guardVersion + ' iosBlur=debug applied=' + d.applied +
            ' ios=' + d.ios + ' standalone=' + d.standalone + ' major=' + d.major +
            '\nstrip=' + getComputedStyle(document.documentElement).getPropertyValue('--ios-top-strip').trim() +
            ' bodyPadTop=' + getComputedStyle(document.body).paddingTop +
            ' verseProgressTop=' + vpTop +
            '\n' + d.userAgent;
          document.body.appendChild(badge);
        } catch (e) {}
      });
    }
  } catch (e) {
    /* best-effort enhancement — never block startup */
  }
})();
