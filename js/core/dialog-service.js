window.DialogService = class DialogService {
  constructor() {
    this._dialog = null;
    this._queue = Promise.resolve();
  }

  confirm(options) {
    return this._enqueue(() => this._show('confirm', options));
  }

  prompt(options) {
    return this._enqueue(() => this._show('prompt', options));
  }

  alert(options) {
    return this._enqueue(() => this._show('alert', options));
  }

  _enqueue(task) {
    const result = this._queue.then(task, task);
    this._queue = result.then(() => undefined, () => undefined);
    return result;
  }

  _show(type, options = {}) {
    if (!this._supportsDialog()) {
      return this._showFallback(type, options);
    }

    const dialog = this._ensureDialog();
    const previousFocus = document.activeElement;
    const title = options.title || (type === 'confirm' ? 'Confirm action' : type === 'prompt' ? 'Enter value' : 'Focused Word');
    const message = options.message || '';
    const confirmLabel = options.confirmLabel || (type === 'confirm' ? 'Continue' : type === 'prompt' ? 'Save' : 'OK');
    const cancelLabel = options.cancelLabel || 'Cancel';
    const dangerClass = options.danger ? ' fw-dialog-danger' : '';
    const inputId = 'fw-dialog-input';

    dialog.innerHTML = `
      <form method="dialog" class="fw-dialog-surface${dangerClass}">
        <h2 id="fw-dialog-title" class="fw-dialog-title">${this._escape(title)}</h2>
        ${message ? `<p class="fw-dialog-message">${this._escape(message)}</p>` : ''}
        ${type === 'prompt' ? `
          <label class="fw-dialog-label" for="${inputId}">${this._escape(options.label || 'Value')}</label>
          <input id="${inputId}" class="fw-dialog-input" type="${options.inputType || 'text'}" value="${this._escapeAttr(options.defaultValue || '')}" autocomplete="${options.autocomplete || 'off'}">
          <p class="fw-dialog-error" aria-live="polite"></p>
        ` : ''}
        <div class="fw-dialog-actions">
          ${type === 'confirm' || type === 'prompt' ? `<button type="button" class="fw-dialog-cancel">${this._escape(cancelLabel)}</button>` : ''}
          <button type="submit" class="fw-dialog-confirm">${this._escape(confirmLabel)}</button>
        </div>
      </form>
    `;

    dialog.setAttribute('aria-labelledby', 'fw-dialog-title');

    return new Promise((resolve) => {
      let settled = false;
      const surface = dialog.querySelector('.fw-dialog-surface');
      const input = dialog.querySelector('.fw-dialog-input');
      const error = dialog.querySelector('.fw-dialog-error');
      const cancelButton = dialog.querySelector('.fw-dialog-cancel');

      const finish = (value) => {
        if (settled) return;
        settled = true;
        dialog.removeEventListener('cancel', onCancel);
        surface?.removeEventListener('submit', onSubmit);
        cancelButton?.removeEventListener('click', onCancelClick);
        if (dialog.open) dialog.close();
        dialog.innerHTML = '';
        if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
          previousFocus.focus({ preventScroll: true });
        }
        resolve(value);
      };

      const onCancel = (event) => {
        event.preventDefault();
        finish(type === 'prompt' ? null : false);
      };
      const onCancelClick = () => finish(type === 'prompt' ? null : false);
      const onSubmit = (event) => {
        event.preventDefault();
        if (type === 'prompt') {
          const value = input.value;
          if (options.required && !value.trim()) {
            if (error) error.textContent = options.requiredMessage || 'Enter a value to continue.';
            input.focus({ preventScroll: true });
            return;
          }
          finish(value);
        } else finish(true);
      };

      dialog.addEventListener('cancel', onCancel);
      surface?.addEventListener('submit', onSubmit);
      cancelButton?.addEventListener('click', onCancelClick);
      dialog.showModal();
      requestAnimationFrame(() => {
        (input || cancelButton || dialog.querySelector('.fw-dialog-confirm'))?.focus({ preventScroll: true });
      });
    });
  }

  _supportsDialog() {
    return typeof document.createElement('dialog').showModal === 'function';
  }

  _ensureDialog() {
    if (this._dialog?.isConnected) return this._dialog;
    const dialog = document.createElement('dialog');
    dialog.id = 'fw-dialog';
    dialog.setAttribute('aria-label', 'Focused Word dialog');
    document.body.appendChild(dialog);
    this._dialog = dialog;
    return dialog;
  }

  _showFallback(type, options) {
    const title = options.title ? `${options.title}\n\n` : '';
    if (type === 'confirm') return Promise.resolve(window.confirm(title + (options.message || '')));
    if (type === 'prompt') return Promise.resolve(window.prompt(title + (options.message || ''), options.defaultValue || ''));
    window.alert(title + (options.message || ''));
    return Promise.resolve(true);
  }

  _escape(value) {
    const el = document.createElement('span');
    el.textContent = String(value ?? '');
    return el.innerHTML;
  }

  _escapeAttr(value) {
    return this._escape(value).replace(/"/g, '&quot;');
  }
};

window.dialogService = new window.DialogService();
