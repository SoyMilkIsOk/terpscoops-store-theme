(function () {
  'use strict';

  const config = window.TerpAeroConfig || {
    routes: {
      cart_url: '/cart',
      cart_add_url: '/cart/add',
      cart_change_url: '/cart/change',
      cart_update_url: '/cart/update',
    },
    freeShippingThresholdCents: 3500,
    enableCartDrawer: true,
    swatches: {},
  };

  function formatMoney(cents) {
    const amount = (Number(cents || 0) / 100).toFixed(2);
    return `$${amount}`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* 1. Native Aero Glass Age Gate (Replaces AgeChecker Plus) */
  function initAgeGate() {
    const dialog = document.getElementById('TerpAgeGateDialog');
    if (!dialog) return;

    const storageKey = 'terpscoops_age_verified_v1';
    const ttlDays = parseInt(dialog.dataset.ttlDays || '30', 10);
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

    let isVerified = false;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (saved && saved.verified && saved.expiresAt > Date.now()) {
        isVerified = true;
      }
    } catch (_) {
      isVerified = false;
    }

    if (isVerified) {
      dialog.setAttribute('hidden', 'hidden');
      return;
    }

    dialog.removeAttribute('hidden');
    document.body.classList.add('age-gate-locked');

    const confirmBtn = dialog.querySelector('[data-age-confirm]');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ verified: true, expiresAt: Date.now() + ttlMs })
          );
        } catch (_) {}
        dialog.classList.add('is-closing');
        document.body.classList.remove('age-gate-locked');
        setTimeout(() => {
          dialog.setAttribute('hidden', 'hidden');
        }, 220);
      });
    }
  }

  /* 2. Variant Picker + Metal Restock Drawer Sync */
  class TerpVariantPicker extends HTMLElement {
    connectedCallback() {
      const jsonEl = this.querySelector('[data-product-variants]');
      if (!jsonEl) return;

      try {
        this.variants = JSON.parse(jsonEl.textContent || '[]');
      } catch (_) {
        this.variants = [];
      }

      this.section = this.closest('[data-product-section]') || document;
      this.form = this.section.querySelector('form[action*="/cart/add"]');
      this.idInput = this.form ? this.form.querySelector('input[name="id"]') : null;
      this.priceEl = this.section.querySelector('[data-product-price]');
      this.compareEl = this.section.querySelector('[data-product-compare-price]');
      this.submitBtn = this.form ? this.form.querySelector('[type="submit"]') : null;
      this.restockDrawer = this.section.querySelector('[data-restock-drawer]');
      this.restockVariantInput = this.section.querySelector('[data-restock-variant-label]');
      this.galleryMainImg = this.section.querySelector('[data-gallery-main-img]');

      this.addEventListener('change', () => this.onOptionChange());
      this.onOptionChange(true);
    }

    getSelectedOptions() {
      const inputs = Array.from(this.querySelectorAll('input[type="radio"]:checked, select'));
      const sorted = inputs.sort(
        (a, b) => Number(a.dataset.optionPosition || 0) - Number(b.dataset.optionPosition || 0)
      );
      return sorted.map((el) => el.value);
    }

    onOptionChange(initial = false) {
      const selected = this.getSelectedOptions();
      const matched = this.variants.find((variant) =>
        selected.every((val, idx) => variant.options[idx] === val)
      );

      if (!matched) return;

      if (this.idInput) {
        this.idInput.value = matched.id;
      }

      if (!initial && window.history && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.set('variant', matched.id);
        window.history.replaceState({}, '', url.toString());
      }

      if (!initial && this.galleryMainImg && matched.featured_image && matched.featured_image.src) {
        this.galleryMainImg.src = matched.featured_image.src;
        this.galleryMainImg.srcset = '';
      }

      if (this.priceEl) {
        this.priceEl.textContent = formatMoney(matched.price);
      }

      if (this.compareEl) {
        if (matched.compare_at_price && matched.compare_at_price > matched.price) {
          this.compareEl.textContent = formatMoney(matched.compare_at_price);
          this.compareEl.hidden = false;
        } else {
          this.compareEl.hidden = true;
        }
      }

      if (this.submitBtn) {
        const labelEl = this.submitBtn.querySelector('[data-submit-label]') || this.submitBtn;
        if (matched.available) {
          this.submitBtn.disabled = false;
          labelEl.textContent = this.submitBtn.dataset.addText || 'Add to Cart';
        } else {
          this.submitBtn.disabled = true;
          labelEl.textContent = this.submitBtn.dataset.soldOutText || 'Sold Out';
        }
      }

      if (this.restockDrawer) {
        this.restockDrawer.hidden = Boolean(matched.available);
        if (this.restockVariantInput) {
          this.restockVariantInput.value = matched.title;
        }
      }

      document.dispatchEvent(
        new CustomEvent('terp:variant-changed', {
          detail: { variant: matched, form: this.form },
        })
      );
    }
  }

  if (!customElements.get('terp-variant-picker')) {
    customElements.define('terp-variant-picker', TerpVariantPicker);
  }

  /* 3. Aero Glass Slide-Out Cart Drawer */
  function initCartDrawer() {
    const drawer = document.getElementById('TerpCartDrawer');
    const triggers = document.querySelectorAll('[data-open-cart-drawer]');
    const closeBtns = document.querySelectorAll('[data-close-cart-drawer]');
    const itemsContainer = drawer ? drawer.querySelector('[data-cart-items]') : null;
    const emptyState = drawer ? drawer.querySelector('[data-cart-empty]') : null;
    const footerEl = drawer ? drawer.querySelector('[data-cart-footer]') : null;
    const subtotalEl = drawer ? drawer.querySelector('[data-cart-subtotal]') : null;
    const shipBarFill = drawer ? drawer.querySelector('[data-shipping-fill]') : null;
    const shipText = drawer ? drawer.querySelector('[data-shipping-text]') : null;

    function openDrawer() {
      if (!drawer) return;
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.classList.add('drawer-open');
    }

    function closeDrawer() {
      if (!drawer) return;
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('drawer-open');
    }

    triggers.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (!config.enableCartDrawer || !drawer) return;
        e.preventDefault();
        refreshCart().then(openDrawer);
      });
    });

    closeBtns.forEach((btn) => btn.addEventListener('click', closeDrawer));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer && drawer.classList.contains('is-open')) {
        closeDrawer();
      }
    });

    async function refreshCart() {
      try {
        const res = await fetch(`${config.routes.cart_url}.js`, {
          headers: { Accept: 'application/json' },
        });
        const cart = await res.json();
        renderCart(cart);
        return cart;
      } catch (err) {
        console.error('TerpAero cart refresh failed:', err);
        return null;
      }
    }

    function renderCart(cart) {
      if (!cart) return;

      document.querySelectorAll('[data-cart-count]').forEach((el) => {
        el.textContent = String(cart.item_count || 0);
        el.classList.toggle('is-empty', (cart.item_count || 0) === 0);
      });

      if (!drawer || !itemsContainer) return;

      const threshold = Number(config.freeShippingThresholdCents || 3500);
      const totalCents = Number(cart.total_price || 0);
      const pct = Math.min(100, Math.round((totalCents / threshold) * 100));

      if (shipBarFill) {
        shipBarFill.style.width = `${pct}%`;
      }
      if (shipText) {
        if (totalCents >= threshold) {
          shipText.textContent = 'Unlocked! Free Shipping from Boulder, CO';
        } else {
          shipText.textContent = `Add ${formatMoney(threshold - totalCents)} more for Free US Shipping`;
        }
      }

      if (subtotalEl) {
        subtotalEl.textContent = formatMoney(totalCents);
      }

      if (!cart.items || cart.items.length === 0) {
        itemsContainer.innerHTML = '';
        if (emptyState) emptyState.hidden = false;
        if (footerEl) footerEl.hidden = true;
        return;
      }

      if (emptyState) emptyState.hidden = true;
      if (footerEl) footerEl.hidden = false;

      itemsContainer.innerHTML = cart.items
        .map((item, idx) => {
          const props = item.properties || {};
          const propEntries = Object.entries(props).filter(([, val]) => val);
          const propsHtml = propEntries.length
            ? `<div class="aero-cart-item__props">${propEntries
                .map(([key, val]) => {
                  const hex = config.swatches && config.swatches[val];
                  const dot = hex
                    ? `<span class="swatch-aero-resin swatch-aero-resin--xs" style="--resin-color:${escapeHtml(
                        hex
                      )};"></span>`
                    : '';
                  return `<span class="aero-cart-prop">${dot}${escapeHtml(key)}: ${escapeHtml(val)}</span>`;
                })
                .join('')}</div>`
            : '';

          const imgHtml = item.featured_image && item.featured_image.url
            ? `<img src="${escapeHtml(item.featured_image.url)}" alt="${escapeHtml(item.product_title)}" class="aero-cart-item__img">`
            : `<div class="aero-cart-item__img aero-cart-item__img--placeholder">🥄</div>`;

          const variantTitle =
            item.variant_title && item.variant_title !== 'Default Title'
              ? `<div class="aero-cart-item__variant">${escapeHtml(item.variant_title)}</div>`
              : '';

          return `
            <div class="aero-cart-item aero-glass" data-line-index="${idx + 1}">
              ${imgHtml}
              <div class="aero-cart-item__info">
                <a href="${escapeHtml(item.url)}" class="aero-cart-item__title">${escapeHtml(item.product_title)}</a>
                ${variantTitle}
                ${propsHtml}
                <div class="aero-cart-item__controls">
                  <div class="aero-qty-pill">
                    <button type="button" class="aero-qty-pill__btn" data-cart-qty="${idx + 1}" data-next-qty="${item.quantity - 1}" aria-label="Decrease quantity">−</button>
                    <span class="aero-qty-pill__val">${item.quantity}</span>
                    <button type="button" class="aero-qty-pill__btn" data-cart-qty="${idx + 1}" data-next-qty="${item.quantity + 1}" aria-label="Increase quantity">+</button>
                  </div>
                  <span class="aero-cart-item__price">${formatMoney(item.final_line_price)}</span>
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      itemsContainer.querySelectorAll('[data-cart-qty]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const line = Number(btn.dataset.cartQty);
          const quantity = Math.max(0, Number(btn.dataset.nextQty));
          await updateLineQuantity(line, quantity);
        });
      });
    }

    async function updateLineQuantity(line, quantity) {
      try {
        const res = await fetch(`${config.routes.cart_change_url}.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ line, quantity }),
        });
        const cart = await res.json();
        renderCart(cart);
      } catch (err) {
        console.error('Cart quantity update failed:', err);
      }
    }

    document.addEventListener('submit', async (event) => {
      const form = event.target;
      if (!form || !form.matches('form[data-ajax-cart-form="true"]')) return;

      const packBuilder = form.querySelector('terp-pack-builder');
      if (packBuilder && typeof packBuilder.validateBeforeSubmit === 'function') {
        if (!packBuilder.validateBeforeSubmit()) {
          event.preventDefault();
          return;
        }
      }

      if (!config.enableCartDrawer || !drawer) return;
      event.preventDefault();

      const submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.classList.add('is-loading');

      try {
        const formData = new FormData(form);
        const addRes = await fetch(`${config.routes.cart_add_url}.js`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: formData,
        });

        if (!addRes.ok) {
          throw new Error('Could not add item to cart');
        }

        await refreshCart();
        openDrawer();
      } catch (err) {
        console.error('Add to cart failed, falling back to standard submit:', err);
        form.removeAttribute('data-ajax-cart-form');
        form.submit();
      } finally {
        if (submitBtn) submitBtn.classList.remove('is-loading');
      }
    });

    const noteInput = drawer ? drawer.querySelector('[data-cart-note]') : null;
    if (noteInput) {
      let timer = null;
      noteInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          fetch(`${config.routes.cart_update_url}.js`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: noteInput.value }),
          }).catch(() => {});
        }, 450);
      });
    }
  }

  /* 4. Wholesale Display Jar Margin Calculator */
  function initWholesaleCalculator() {
    const calc = document.querySelector('[data-wholesale-calculator]');
    if (!calc) return;

    const jarRange = calc.querySelector('[data-jar-count]');
    const msrpSelect = calc.querySelector('[data-retail-msrp]');
    const jarCountOut = calc.querySelector('[data-out-jars]');
    const scoopCountOut = calc.querySelector('[data-out-scoops]');
    const wholesaleCostOut = calc.querySelector('[data-out-cost]');
    const retailRevOut = calc.querySelector('[data-out-revenue]');
    const profitOut = calc.querySelector('[data-out-profit]');
    const jarQtyInput = document.querySelector('[data-wholesale-jar-qty]');

    function update() {
      const jars = Number(jarRange ? jarRange.value : 2);
      const msrp = Number(msrpSelect ? msrpSelect.value : 4.2);
      const scoops = jars * 25;
      const cost = jars * 40;
      const revenue = scoops * msrp;
      const profit = revenue - cost;

      if (jarCountOut) jarCountOut.textContent = `${jars} Jar${jars === 1 ? '' : 's'}`;
      if (scoopCountOut) scoopCountOut.textContent = `${scoops} Scoops`;
      if (wholesaleCostOut) wholesaleCostOut.textContent = `$${cost.toFixed(2)}`;
      if (retailRevOut) retailRevOut.textContent = `$${revenue.toFixed(2)}`;
      if (profitOut) profitOut.textContent = `+$${profit.toFixed(2)}`;
      if (jarQtyInput) jarQtyInput.value = String(jars);
    }

    if (jarRange) jarRange.addEventListener('input', update);
    if (msrpSelect) msrpSelect.addEventListener('change', update);
    update();
  }

  /* 5. Mobile Menu & Hero Color Showcase */
  function initInteractiveUI() {
    const menuToggle = document.querySelector('[data-mobile-menu-toggle]');
    const mobileMenu = document.getElementById('TerpMobileMenu');
    const menuClose = document.querySelectorAll('[data-mobile-menu-close]');

    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener('click', () => {
        const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', String(!expanded));
        mobileMenu.classList.toggle('is-open', !expanded);
      });
      menuClose.forEach((btn) =>
        btn.addEventListener('click', () => {
          menuToggle.setAttribute('aria-expanded', 'false');
          mobileMenu.classList.remove('is-open');
        })
      );
    }

    const wheelStage = document.querySelector('[data-hero-wheel-stage]');
    const wheelWrap = document.querySelector('[data-hero-wheel-wrap]');
    const wheelEl = document.querySelector('[data-hero-wheel]');
    let angle = 0;
    let spinVelocity = 0;
    let isDragging = false;
    let lastPointerAngle = 0;

    if (wheelStage && wheelWrap && wheelEl) {
      const getPointerAngle = (e) => {
        const rect = wheelWrap.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        return Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      };

      wheelStage.addEventListener('pointermove', (e) => {
        const rect = wheelStage.getBoundingClientRect();
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        wheelWrap.style.transform = `perspective(700px) rotateX(${(-ny * 10).toFixed(2)}deg) rotateY(${(nx * 10).toFixed(2)}deg)`;

        if (isDragging) {
          const nextAngle = getPointerAngle(e);
          let delta = nextAngle - lastPointerAngle;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          angle += delta;
          spinVelocity = delta * 0.45;
          lastPointerAngle = nextAngle;
        } else {
          spinVelocity += nx * 0.04;
        }
      });

      wheelStage.addEventListener('pointerleave', () => {
        wheelWrap.style.transform = '';
        isDragging = false;
      });

      wheelWrap.addEventListener('pointerdown', (e) => {
        isDragging = true;
        lastPointerAngle = getPointerAngle(e);
        if (wheelWrap.setPointerCapture) {
          try {
            wheelWrap.setPointerCapture(e.pointerId);
          } catch (_) {}
        }
      });

      const endDrag = () => {
        isDragging = false;
      };
      wheelWrap.addEventListener('pointerup', endDrag);
      wheelWrap.addEventListener('pointercancel', endDrag);

      const tick = () => {
        if (!isDragging) {
          angle = (angle + 0.22 + spinVelocity) % 360;
          spinVelocity *= 0.94;
        }
        wheelEl.style.transform = `rotate(${angle.toFixed(2)}deg)`;
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    }

    document.querySelectorAll('[data-hero-color-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const root = btn.closest('[data-hero-showcase]');
        if (!root) return;
        root.querySelectorAll('[data-hero-color-btn]').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        const label = root.querySelector('[data-hero-active-color]');
        const orb = root.querySelector('[data-hero-preview-orb]');
        if (label) label.textContent = btn.dataset.colorName || 'Cyan';
        if (orb) {
          orb.style.setProperty('--resin-color', btn.dataset.colorHex || '#60AEDB');
        }
        spinVelocity += 4.5;
      });
    });

    document.querySelectorAll('[data-gallery-thumb]').forEach((thumb) => {
      thumb.addEventListener('click', () => {
        const gallery = thumb.closest('[data-product-gallery]');
        if (!gallery) return;
        const mainImg = gallery.querySelector('[data-gallery-main-img]');
        if (!mainImg || !thumb.dataset.fullSrc) return;
        mainImg.src = thumb.dataset.fullSrc;
        mainImg.srcset = '';
        gallery.querySelectorAll('[data-gallery-thumb]').forEach((t) => t.classList.remove('is-active'));
        thumb.classList.add('is-active');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAgeGate();
    initCartDrawer();
    initWholesaleCalculator();
    initInteractiveUI();
  });
})();

