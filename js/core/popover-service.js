/* Progressive enhancement wrapper for the Popover API. */
const popoverControllers = new WeakMap();

window.PopoverService = {
  create(element, options = {}) {
    if (popoverControllers.has(element)) return popoverControllers.get(element);
    const controller = new PopoverController(element, options);
    popoverControllers.set(element, controller);
    return controller;
  },

  supports(element) {
    return Boolean(
      element &&
      typeof element.showPopover === 'function' &&
      typeof element.hidePopover === 'function' &&
      element.getAttribute('popover') !== null
    );
  },

  isOpen(element) {
    return Boolean(element && (element.classList.contains('open') || element.matches?.(':popover-open')));
  }
};

class PopoverController {
  constructor(element, { onChange } = {}) {
    this.element = element;
    this.native = window.PopoverService.supports(element);
    this._open = false;
    this._onChange = onChange;

    if (this.native) {
      this._toggleHandler = () => {
        let open = this._open;
        try {
          open = element.matches(':popover-open');
        } catch (_) {
          // Older implementations may expose the API without the selector.
        }
        this._setState(open);
      };
      element.addEventListener('toggle', this._toggleHandler);
    }
  }

  isOpen() {
    return this._open;
  }

  show() {
    if (this.native) {
      if (this._open) return;
      this._setState(true);
      try {
        this.element.showPopover();
        return;
      } catch (_) {
        this.native = false;
        this.element.removeAttribute('popover');
      }
    }
    this._setState(true);
  }

  hide() {
    if (this.native) {
      if (!this._open) return;
      try {
        this.element.hidePopover();
      } catch (_) {
        this.native = false;
        this.element.removeAttribute('popover');
      }
    }
    this._setState(false);
  }

  toggle() {
    if (this.isOpen()) this.hide();
    else this.show();
  }

  destroy() {
    if (this._toggleHandler) {
      this.element.removeEventListener('toggle', this._toggleHandler);
      this._toggleHandler = null;
    }
  }

  _setState(open) {
    if (this._open === open) return;
    this._open = open;
    this.element.classList.toggle('open', open);
    this.element.classList.toggle('hidden', !open);
    if (this._onChange) this._onChange(open);
  }
}
