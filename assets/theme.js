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
      this.galleryViewer = this.section.querySelector('[data-aero-photo-viewer]');
      this.dynamicCheckout = this.section.querySelector('[data-dynamic-checkout]');

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

      if (!initial && matched.featured_image && matched.featured_image.src) {
        let handledByViewer = false;
        if (this.galleryViewer && typeof this.galleryViewer._terpViewerGoToFile === 'function') {
          const fileName = matched.featured_image.src.split('?')[0].split('/').pop();
          handledByViewer = this.galleryViewer._terpViewerGoToFile(fileName);
        }
        if (!handledByViewer) {
          const fallbackImg =
            (this.galleryViewer && this.galleryViewer.querySelector('.aero-photo-viewer__slide.is-active img')) ||
            this.galleryMainImg;
          if (fallbackImg) {
            fallbackImg.src = matched.featured_image.src;
            fallbackImg.srcset = '';
          }
        }
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

      if (this.dynamicCheckout) {
        this.dynamicCheckout.hidden = !matched.available;
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
    const wheelShadowEls = Array.from(document.querySelectorAll('[data-hero-wheel-shadow]'));
    const colorBtns = Array.from(document.querySelectorAll('[data-hero-color-btn]'));
    const previewOrb = document.querySelector('[data-hero-preview-orb]');
    const wheelTargetAngles = {
      Pink: 22.5,
      Red: -22.5,
      Orange: -67.5,
      Yellow: -112.5,
      Green: -157.5,
      Cyan: -202.5,
      Blue: -247.5,
      Purple: -292.5,
    };
    let angle = 0;
    let targetAngle = null;
    let holdTimer = null;
    let activeColorName = null;
    let spinVelocity = 0;
    let isDragging = false;
    let lastPointerAngle = 0;
    let currentGlowRgb = { r: 96, g: 174, b: 219 };
    let targetGlowRgb = { r: 96, g: 174, b: 219 };
    let lastGlowRgbStr = '';

    function hexToRgb(hex) {
      const clean = String(hex || '').replace('#', '');
      if (clean.length === 3) {
        return {
          r: parseInt(clean[0] + clean[0], 16),
          g: parseInt(clean[1] + clean[1], 16),
          b: parseInt(clean[2] + clean[2], 16),
        };
      }
      if (clean.length === 6) {
        return {
          r: parseInt(clean.slice(0, 2), 16),
          g: parseInt(clean.slice(2, 4), 16),
          b: parseInt(clean.slice(4, 6), 16),
        };
      }
      return { r: 96, g: 174, b: 219 };
    }

    function setActiveColorUI(colorName) {
      if (!colorName || colorName === activeColorName) return;
      activeColorName = colorName;
      let activeHex = '#60AEDB';
      colorBtns.forEach((btn) => {
        if (btn.dataset.colorHex) {
          btn.style.setProperty('--active-orb-color', btn.dataset.colorHex);
        }
        const match = btn.dataset.colorName === colorName;
        btn.classList.toggle('is-selected', match);
        if (match && btn.dataset.colorHex) {
          activeHex = btn.dataset.colorHex;
        }
      });
      targetGlowRgb = hexToRgb(activeHex);
    }

    function syncTopColorFromAngle(currentAngle) {
      let closestName = null;
      let minDist = Infinity;
      Object.entries(wheelTargetAngles).forEach(([name, topAngle]) => {
        const dist = Math.abs((((currentAngle - topAngle) % 360) + 540) % 360 - 180);
        if (dist < minDist) {
          minDist = dist;
          closestName = name;
        }
      });
      if (closestName) {
        setActiveColorUI(closestName);
      }
    }

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
        wheelWrap.style.setProperty('--wheel-shadow-shift-x', `${(-nx * 3.5).toFixed(2)}px`);
        wheelWrap.style.setProperty('--wheel-shadow-shift-y', `${(-ny * 3.5).toFixed(2)}px`);

        if (isDragging) {
          const nextAngle = getPointerAngle(e);
          let delta = nextAngle - lastPointerAngle;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          angle += delta;
          spinVelocity = delta * 0.45;
          lastPointerAngle = nextAngle;
          syncTopColorFromAngle(angle);
        }
      });

      wheelStage.addEventListener('pointerleave', () => {
        wheelWrap.style.transform = '';
        wheelWrap.style.removeProperty('--wheel-shadow-shift-x');
        wheelWrap.style.removeProperty('--wheel-shadow-shift-y');
        isDragging = false;
      });

      wheelWrap.addEventListener('pointerdown', (e) => {
        isDragging = true;
        targetAngle = null;
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
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
        if (isDragging) {
          targetAngle = null;
          if (holdTimer) {
            window.clearTimeout(holdTimer);
            holdTimer = null;
          }
          syncTopColorFromAngle(angle);
        } else if (targetAngle !== null) {
          const remaining = targetAngle - angle;
          if (Math.abs(remaining) < 0.05) {
            angle = targetAngle;
          } else {
            angle += remaining * 0.14;
          }
        } else {
          angle = (angle - 0.22 + spinVelocity) % 360;
          spinVelocity *= 0.94;
          syncTopColorFromAngle(angle);
        }
        if (previewOrb) {
          currentGlowRgb.r += (targetGlowRgb.r - currentGlowRgb.r) * 0.08;
          currentGlowRgb.g += (targetGlowRgb.g - currentGlowRgb.g) * 0.08;
          currentGlowRgb.b += (targetGlowRgb.b - currentGlowRgb.b) * 0.08;
          const nextRgbStr = `rgb(${Math.round(currentGlowRgb.r)}, ${Math.round(currentGlowRgb.g)}, ${Math.round(currentGlowRgb.b)})`;
          if (nextRgbStr !== lastGlowRgbStr) {
            lastGlowRgbStr = nextRgbStr;
            previewOrb.style.setProperty('--resin-color', nextRgbStr);
          }
        }
        const rotateTransform = `rotate(${angle.toFixed(2)}deg)`;
        wheelEl.style.transform = rotateTransform;
        for (let i = 0; i < wheelShadowEls.length; i += 1) {
          wheelShadowEls[i].style.transform = rotateTransform;
        }
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    }

    colorBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const colorName = btn.dataset.colorName;
        if (!colorName) return;
        if (holdTimer) {
          window.clearTimeout(holdTimer);
          holdTimer = null;
        }
        setActiveColorUI(colorName);
        if (Object.prototype.hasOwnProperty.call(wheelTargetAngles, colorName)) {
          const desiredAngle = wheelTargetAngles[colorName];
          const diff = (((desiredAngle - angle) % 360) + 540) % 360 - 180;
          targetAngle = angle + diff;
          spinVelocity = 0;
          holdTimer = window.setTimeout(() => {
            targetAngle = null;
            holdTimer = null;
          }, 2600);
        }
      });
    });
  }

  /* 6. Client-Side Collection Sort & Wholesale Filter */
  function initCollectionSort() {
    const sortSelect = document.querySelector('[data-collection-sort]');
    const grid = document.querySelector('[data-collection-grid]');
    const wholesaleTab = document.querySelector('[data-wholesale-filter-tab]');
    const allTab = document.querySelector('[data-all-filter-tab]');
    const headingEl = document.querySelector('[data-collection-heading]');
    const initialHeading = headingEl ? headingEl.textContent : '';

    if (!grid) return;

    function applyWholesaleFilter(active) {
      document.querySelectorAll('.aero-filter-tab').forEach((t) => t.classList.remove('is-active'));
      const groups = Array.from(grid.querySelectorAll('[data-collection-group]'));

      if (active && wholesaleTab) {
        wholesaleTab.classList.add('is-active');
        if (headingEl) headingEl.textContent = 'Wholesale';
        if (groups.length > 0) {
          groups.forEach((group) => {
            const isJarGroup = group.dataset.collectionGroup === 'jar';
            group.hidden = !isJarGroup;
            group.style.display = isJarGroup ? '' : 'none';
          });
        }
        grid.querySelectorAll('.aero-grid-item').forEach((item) => {
          const isJar = item.dataset.productCategory === 'jar';
          item.hidden = !isJar;
          item.style.display = isJar ? '' : 'none';
        });
      } else {
        if (allTab) allTab.classList.add('is-active');
        if (headingEl) headingEl.textContent = initialHeading;
        if (groups.length > 0) {
          groups.forEach((group) => {
            group.hidden = false;
            group.style.display = '';
          });
        }
        grid.querySelectorAll('.aero-grid-item').forEach((item) => {
          const hideExtra = item.dataset.wholesaleExtra === 'true';
          item.hidden = hideExtra;
          item.style.display = hideExtra ? 'none' : '';
        });
      }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('category') === 'wholesale') {
      applyWholesaleFilter(true);
    }

    if (wholesaleTab) {
      wholesaleTab.addEventListener('click', (e) => {
        e.preventDefault();
        applyWholesaleFilter(true);
        if (window.history && window.history.replaceState) {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set('category', 'wholesale');
          window.history.replaceState({}, '', nextUrl.toString());
        }
      });
    }

    if (allTab && allTab.dataset.isAllPage === 'true') {
      allTab.addEventListener('click', (e) => {
        e.preventDefault();
        applyWholesaleFilter(false);
        if (window.history && window.history.replaceState) {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.delete('category');
          window.history.replaceState({}, '', nextUrl.toString());
        }
      });
    }

    if (!sortSelect) return;

    sortSelect.addEventListener('change', () => {
      const mode = sortSelect.value;
      const containers = Array.from(grid.querySelectorAll('[data-collection-subgrid]'));
      const sortTargets = containers.length > 0 ? containers : [grid];

      sortTargets.forEach((container) => {
        const items = Array.from(container.querySelectorAll('.aero-grid-item'));

        items.sort((a, b) => {
          if (mode === 'price-asc') {
            return Number(a.dataset.productPrice || 0) - Number(b.dataset.productPrice || 0);
          }
          if (mode === 'price-desc') {
            return Number(b.dataset.productPrice || 0) - Number(a.dataset.productPrice || 0);
          }
          if (mode === 'title-asc') {
            return (a.dataset.productTitle || '').localeCompare(b.dataset.productTitle || '');
          }
          return Number(a.dataset.featuredIndex || 0) - Number(b.dataset.featuredIndex || 0);
        });

        items.forEach((item) => container.appendChild(item));
      });
    });
  }

  /* 7. Rotating Announcement Bar */
  function initAnnouncementBar() {
    document.querySelectorAll('[data-announcement-rotator]').forEach((rotator) => {
      const slides = Array.from(rotator.querySelectorAll('[data-announcement-slide]'));
      if (slides.length < 2) return;

      let currentIndex = slides.findIndex((s) => s.classList.contains('is-active'));
      if (currentIndex < 0) {
        currentIndex = 0;
        slides[0].classList.add('is-active');
      }

      let intervalId = null;

      function advanceSlide() {
        if (document.hidden) return;
        const prevSlide = slides[currentIndex];
        currentIndex = (currentIndex + 1) % slides.length;
        const nextSlide = slides[currentIndex];

        prevSlide.classList.remove('is-active');
        prevSlide.classList.add('is-exiting');
        window.setTimeout(() => {
          prevSlide.classList.remove('is-exiting');
        }, 300);

        nextSlide.classList.remove('is-exiting');
        nextSlide.classList.add('is-active');
      }

      function startTimer() {
        if (intervalId !== null) return;
        intervalId = window.setInterval(advanceSlide, 3400);
      }

      function stopTimer() {
        if (intervalId === null) return;
        window.clearInterval(intervalId);
        intervalId = null;
      }

      rotator.addEventListener('pointerenter', stopTimer);
      rotator.addEventListener('pointerleave', startTimer);
      rotator.addEventListener('focusin', stopTimer);
      rotator.addEventListener('focusout', startTimer);

      startTimer();
    });
  }

  /* 8. TerpAero OS Photo Viewers (Hero, PDP & About) */
  function initPhotoViewers() {
    document.querySelectorAll('[data-aero-photo-viewer]').forEach((viewer) => {
      const stage = viewer.querySelector('[data-viewer-stage]');
      const slides = Array.from(viewer.querySelectorAll('[data-viewer-slide]'));
      const thumbs = Array.from(viewer.querySelectorAll('[data-viewer-thumb]'));
      const counterEl = viewer.querySelector('[data-viewer-counter]');
      const prevBtn = viewer.querySelector('[data-viewer-prev]');
      const nextBtn = viewer.querySelector('[data-viewer-next]');
      const dockEl = viewer.querySelector('.aero-photo-viewer__dock');
      if (slides.length === 0) return;

      let activeIdx = slides.findIndex((s) => s.classList.contains('is-active'));
      if (activeIdx < 0) activeIdx = 0;

      const useAutoplay = viewer.dataset.autoplay === 'true' && slides.length > 1;
      let timerId = null;

      function goToSlide(nextIdx) {
        const idx = ((nextIdx % slides.length) + slides.length) % slides.length;
        activeIdx = idx;
        slides.forEach((slide, i) => slide.classList.toggle('is-active', i === idx));
        thumbs.forEach((thumb, i) => thumb.classList.toggle('is-active', i === idx));
        if (counterEl) {
          counterEl.textContent = `${idx + 1} / ${slides.length}`;
        }
        if (dockEl && thumbs[idx]) {
          const t = thumbs[idx];
          dockEl.scrollTo({
            left: Math.max(0, t.offsetLeft - dockEl.clientWidth / 2 + t.clientWidth / 2),
            behavior: 'smooth',
          });
        }
      }

      function stopAutoplay() {
        if (timerId !== null) {
          window.clearInterval(timerId);
          timerId = null;
        }
      }

      function startAutoplay() {
        if (!useAutoplay || timerId !== null) return;
        timerId = window.setInterval(() => {
          if (!document.hidden) goToSlide(activeIdx + 1);
        }, 4200);
      }

      function resetAutoplay() {
        stopAutoplay();
        startAutoplay();
      }

      viewer._terpViewerGoToFile = (fileName) => {
        if (!fileName) return false;
        const matchedIdx = slides.findIndex((s) => s.dataset.imageFile === fileName);
        if (matchedIdx >= 0) {
          goToSlide(matchedIdx);
          return true;
        }
        return false;
      };

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          goToSlide(activeIdx - 1);
          resetAutoplay();
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          goToSlide(activeIdx + 1);
          resetAutoplay();
        });
      }

      thumbs.forEach((thumb) => {
        thumb.addEventListener('click', () => {
          const idx = Number(thumb.dataset.slideIndex || 0);
          goToSlide(idx);
          resetAutoplay();
        });
      });

      if (stage && slides.length > 1) {
        let swipeStartX = null;
        let swipeStartY = null;

        stage.addEventListener('pointerdown', (e) => {
          if (e.target.closest('button')) return;
          swipeStartX = e.clientX;
          swipeStartY = e.clientY;
        });

        stage.addEventListener('pointerup', (e) => {
          if (swipeStartX === null) return;
          const dx = e.clientX - swipeStartX;
          const dy = e.clientY - swipeStartY;
          swipeStartX = null;
          swipeStartY = null;
          if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) {
            goToSlide(dx < 0 ? activeIdx + 1 : activeIdx - 1);
            resetAutoplay();
          }
        });

        stage.addEventListener('pointercancel', () => {
          swipeStartX = null;
          swipeStartY = null;
        });
      }

      if (useAutoplay) {
        viewer.addEventListener('pointerenter', stopAutoplay);
        viewer.addEventListener('pointerleave', startAutoplay);
        viewer.addEventListener('focusin', stopAutoplay);
        viewer.addEventListener('focusout', startAutoplay);
        viewer.addEventListener('touchstart', stopAutoplay, { passive: true });
        viewer.addEventListener('touchend', startAutoplay, { passive: true });
        startAutoplay();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAgeGate();
    initCartDrawer();
    initWholesaleCalculator();
    initInteractiveUI();
    initCollectionSort();
    initAnnouncementBar();
    initPhotoViewers();
  });
})();

