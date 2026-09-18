/* iOS 27 standalone-PWA status-bar frost guard.
   Loaded synchronously in <head> so the mitigation is in place before the
   first paint. iOS 27/27.x paints a system frosted band across the top of
   standalone web apps that use apple-mobile-web-app-status-bar-style:
   black-translucent (Safari tabs and landscape are unaffected). On affected
   devices this sets html.ios-top-blur, which activates the reserved-strip
   workaround in css/styles.css.

   QA override (persists in localStorage, survives launches): append
   ?iosBlur=strip|default-bar|off once on any launch.
     strip       - default: reserve a solid body strip (black-translucent kept)
     default-bar - swap the meta to `default`, which removes the frost band at
                   the cost of an opaque system status bar (needs reinstall)
     off         - no mitigation (reproduce the raw iOS 27 band) */
(function () {
  try {
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    if (!isIOS || !navigator.standalone) return;

    var ver = ua.match(/OS (\d+)[._]/) || ua.match(/Version\/(\d+)/);
    if (!ver || parseInt(ver[1], 10) < 27) return;

    var MODE_KEY = 'focused-word:ios-top-blur-mode';
    var mode = null;
    try {
      var qs = new URLSearchParams(location.search).get('iosBlur');
      if (qs === 'strip' || qs === 'default-bar' || qs === 'off') {
        localStorage.setItem(MODE_KEY, qs);
        mode = qs;
      } else {
        mode = localStorage.getItem(MODE_KEY);
      }
    } catch (e) {
      mode = null;
    }
    if (!mode) mode = 'strip';

    if (mode === 'default-bar') {
      var meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (meta) meta.setAttribute('content', 'default');
      return;
    }
    if (mode === 'strip') {
      document.documentElement.classList.add('ios-top-blur');
    }
  } catch (e) {
    /* best-effort enhancement — never block startup */
  }
})();
