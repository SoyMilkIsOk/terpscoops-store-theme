class TerpPackBuilder extends HTMLElement {
  constructor() {
    super();
    this.packSize = parseInt(this.dataset.packSize || '2', 10);
    this.slots = new Array(this.packSize).fill('');
    this.rainbowOrder = ['Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple'];
    this.isActive = !this.classList.contains('is-hidden');
  }

  connectedCallback() {
    this.slotButtons = Array.from(this.querySelectorAll('[data-slot-index]'));
    this.slotInputs = Array.from(this.querySelectorAll('[data-slot-input]'));
    this.colorButtons = Array.from(this.querySelectorAll('[data-color-choice]'));
    this.autofillBtn = this.querySelector('[data-rainbow-autofill]');
    this.clearBtn = this.querySelector('[data-clear-slots]');
    this.statusEl = this.querySelector('[data-status-text]');
    this.statusWrap = this.querySelector('[data-builder-status]');

    this.form = this.closest('form') || document.getElementById(this.dataset.formId || '');

    this.colorButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const colorName = btn.dataset.colorChoice;
        this.addColorToNextSlot(colorName);
        this.showColorInViewer(colorName);
      });
    });

    this.slotButtons.forEach((btn, idx) => {
      btn.addEventListener('click', () => {
        if (this.slots[idx]) {
          this.setSlot(idx, '');
        }
      });
    });

    if (this.autofillBtn) {
      this.autofillBtn.addEventListener('click', () => this.applyRainbowAutofill());
    }

    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => this.clearAllSlots());
    }

    document.addEventListener('terp:variant-changed', (event) => {
      if (!event.detail || !event.detail.variant) return;
      const formMatches = !this.form || !event.detail.form || this.form === event.detail.form;
      if (!formMatches) return;
      this.handleVariantChange(event.detail.variant);
    });

    this.syncUI();
  }

  handleVariantChange(variant) {
    const title = (variant.title || '').toLowerCase();
    const shouldActivate = title.includes('you pick') || title.includes('assorted');
    this.isActive = shouldActivate;
    this.classList.toggle('is-hidden', !shouldActivate);

    this.slotInputs.forEach((input) => {
      input.disabled = !shouldActivate;
    });

    this.syncUI();
  }

  addColorToNextSlot(colorName) {
    if (!colorName) return;
    let targetIdx = this.slots.findIndex((val) => !val);
    if (targetIdx === -1) {
      targetIdx = this.packSize - 1;
    }
    this.setSlot(targetIdx, colorName);
  }

  showColorInViewer(colorName) {
    if (!colorName) return;
    const section = this.closest('[data-product-section]') || document;
    const viewer = section.querySelector('[data-aero-photo-viewer]');
    if (!viewer) return;

    if (typeof viewer._terpViewerGoToColor === 'function') {
      viewer._terpViewerGoToColor(colorName);
      return;
    }

    const colorIdx = this.rainbowOrder.findIndex(
      (c) => c.toLowerCase() === String(colorName).trim().toLowerCase()
    );
    if (colorIdx < 0) return;
    const slides = viewer.querySelectorAll('[data-viewer-slide]');
    if (slides.length < this.rainbowOrder.length) return;
    const targetIdx = slides.length - this.rainbowOrder.length + colorIdx;
    const thumb = viewer.querySelector(`[data-viewer-thumb][data-slide-index="${targetIdx}"]`);
    if (thumb) thumb.click();
  }

  setSlot(idx, colorName) {
    if (idx < 0 || idx >= this.packSize) return;
    this.slots[idx] = colorName;
    this.syncUI();

    const slotBtn = this.slotButtons[idx];
    if (slotBtn && colorName) {
      slotBtn.classList.remove('is-popping');
      void slotBtn.offsetWidth;
      slotBtn.classList.add('is-popping');
    }
  }

  applyRainbowAutofill() {
    if (this.packSize === 2) {
      this.slots = ['Cyan', 'Pink'];
    } else if (this.packSize === 4) {
      this.slots = ['Pink', 'Yellow', 'Green', 'Cyan'];
    } else {
      for (let i = 0; i < this.packSize; i += 1) {
        this.slots[i] = this.rainbowOrder[i % this.rainbowOrder.length];
      }
    }
    this.syncUI();
    this.slotButtons.forEach((btn) => {
      btn.classList.remove('is-popping');
      void btn.offsetWidth;
      btn.classList.add('is-popping');
    });
  }

  clearAllSlots() {
    this.slots.fill('');
    this.syncUI();
  }

  getRemainingCount() {
    return this.slots.filter((val) => !val).length;
  }

  validateBeforeSubmit() {
    if (!this.isActive) return true;
    const remaining = this.getRemainingCount();
    if (remaining === 0) return true;

    this.classList.remove('is-shake');
    void this.offsetWidth;
    this.classList.add('is-shake');
    if (this.statusWrap) {
      this.statusWrap.classList.add('is-error');
    }
    this.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return false;
  }

  syncUI() {
    const swatches = (window.TerpAeroConfig && window.TerpAeroConfig.swatches) || {};

    this.slots.forEach((colorName, idx) => {
      const btn = this.slotButtons[idx];
      const input = this.slotInputs[idx];
      if (!btn || !input) return;

      const orb = btn.querySelector('[data-slot-orb]');
      const label = btn.querySelector('[data-slot-label]');

      input.value = colorName;
      input.disabled = !this.isActive;

      if (colorName) {
        btn.classList.add('is-filled');
        btn.setAttribute('aria-label', `Scoop ${idx + 1}: ${colorName}. Click to clear.`);
        if (orb) {
          const slug = colorName.toLowerCase();
          const fallbackHex = swatches[colorName] || '#00D4FF';
          orb.style.setProperty('--resin-color', `var(--swatch-${slug}, ${fallbackHex})`);
        }
        if (label) {
          label.textContent = colorName;
        }
      } else {
        btn.classList.remove('is-filled');
        btn.setAttribute('aria-label', `Scoop ${idx + 1}: empty`);
        if (orb) {
          orb.style.removeProperty('--resin-color');
        }
        if (label) {
          label.textContent = `Slot ${idx + 1}`;
        }
      }
    });

    const remaining = this.getRemainingCount();
    if (this.statusEl && this.statusWrap) {
      this.statusWrap.classList.remove('is-error');
      if (remaining === 0) {
        this.statusWrap.classList.add('is-complete');
        this.statusEl.textContent = `Ready! Custom ${this.packSize}-Pack: ${this.slots.join(' · ')}`;
      } else {
        this.statusWrap.classList.remove('is-complete');
        this.statusEl.textContent = `Pick ${remaining} more color${remaining === 1 ? '' : 's'} to complete your ${this.packSize}-pack`;
      }
    }
  }
}

if (!customElements.get('terp-pack-builder')) {
  customElements.define('terp-pack-builder', TerpPackBuilder);
}

