# TerpAero — Shopify OS 2.0 Theme for terpscoops.com

**TerpAero ("Translucent Resin & Liquid Chrome")** is a custom-built Shopify Online Store 2.0 theme designed for **Terpscoops** (`terpmetrix-2.myshopify.com`), uniting injection-molded rainbow acrylic resin scoops, aerospace-grade metal & sterling silver collector editions, Terp Merch, and dispensary/headshop wholesale into a cohesive Frutiger Aero storefront.

---

## Key Features Built Into the Theme
- **Frutiger Aero Design System (`assets/base.css`)**: Translucent Aero glass panels (`backdrop-filter: blur`), curved specular Aqua gel pill buttons, floating glass taskbar header, and 3D light-refracting resin color orbs.
- **Interactive "You Pick" Aero Capsule Pack Builder (`snippets/pack-color-builder.liquid` + `assets/pack-builder.js`)**: On `terpscoop-2pk`, `terpscoop-4pk`, and `terpscoop-8pk`, selecting `"You Pick"` opens an interactive slot tray (2, 4, or 8 slots) with one-tap **Rainbow Auto-Fill** and automatic line-item properties (`properties[Scoop 1]` ... `properties[Scoop N]`)—no SKU restructuring required.
- **Pack-Tier Upsell Switcher (`snippets/pack-tier-switcher.liquid`)**: Instant one-click navigation between `2-Pack ($4.20)`, `4-Pack ($8.00)`, and `8-Pack ($15.00)` with per-scoop unit pricing.
- **Liquid Chrome Metal Vault (`sections/metal-vault-showcase.liquid` & `sections/main-product-metal.liquid`)**: Smoked aero glass + brushed chrome showcase for **304 Stainless Steel ($20)**, **Aerospace Titanium ($40)**, and **15g .925 Sterling Silver by @kevianjewelers ($120)**, complete with an inline Back-in-Stock / Drop Notification form (`{% form 'customer' %}`) for sold-out variants.
- **Native 21+ Aero Glass Age Gate (`sections/native-age-gate.liquid`)**: Zero-external-dependency age verification dialog stored in `localStorage`, replacing third-party blocking scripts.
- **Dispensary & Headshop Wholesale Portal (`sections/wholesale-portal.liquid`)**: Interactive 25ct Display Jar margin calculator ($1.60/scoop cost) plus a tax-exempt wholesale inquiry form routing to `wholesale@terpscoops.com`.
- **Smart Default Product Routing (`templates/product.json`)**: Automatically inspects `product.handle` so color packs, metal scoops, merch, and the 25ct display jar render their tailored layouts even before assigning alternate templates manually.

---

## Shopify GitHub Integration Setup

Reference: [Shopify Dev — GitHub integration for themes](https://shopify.dev/docs/storefronts/themes/tools/github)

1. Push this repository to GitHub (keep `main` for production and create a `staging` branch for testing).
2. In **Shopify Admin** (`terpmetrix-2.myshopify.com`), go to **Online Store > Themes**.
3. Under **Theme library**, click **Add theme > Connect from GitHub**.
4. Authorize your GitHub account, select this repository, and connect:
   - **`staging` branch** → Unpublished Staging Theme (preview & QA)
   - **`main` branch** → Published Live Theme (after QA sign-off)

### Recommended Branching Workflow
- **Developers own:** `.liquid`, `.css`, `.js`, and `config/settings_schema.json`.
- **Theme Editor owns:** `config/settings_data.json` and `templates/*.json` / `sections/*-group.json` visual customizations (Shopify automatically commits Theme Editor edits back to the connected branch).
- Always run `git pull` on `main` / `staging` before merging feature branches so Theme Editor edits are preserved.

### Local Development with Shopify CLI
```bash
shopify theme dev --store=terpmetrix-2.myshopify.com
```

---

## Shopify Admin Setup Checklist After Connecting
1. **Assign Alternate Templates (Recommended, though `product.json` includes smart auto-detection):**
   - `product.color-pack`: `terpscoop-2pk`, `terpscoop-4pk`, `terpscoop-8pk`
   - `product.metal-edition`: `stainless-steel-terpscoop`, `titanium-terpscoop`, `solid-silver-terpscoop`
   - `product.merch`: `terpscoop-flower-embroidered-dad-hat`, `terpmetrix-heavyweight-t-shirt`, `terps-heavyweight-t-shirt`, `terps-next-door-heavyweight-t-shirt`, `terpscoops-lightweight-t-shirt`
   - `page.wholesale`: Create/assign `/pages/wholesale`
   - `page.story`: Assign `/pages/about-us`
   - `page.contact`: Assign `/pages/contact`
2. **Navigation Menus (`Content > Menus`):**
   - Create/verify `main-menu` links: `Shop Scoops` (`/collections/shop-terpscoops`), `Metal Vault` (`/collections/metal-scoops`), `Merch` (`/collections/merch`), `Wholesale` (`/pages/wholesale`), `Our Story` (`/pages/about-us`).
3. **Judge.me App Embed & Blocks:**
   - Enable the Judge.me app embed in **Theme Editor > App embeds** and optionally add the Judge.me Review Widget block inside `judgeme-editorial-reviews` and product sections.
4. **Replace AgeChecker Plus:**
   - Once you verify the **Native Age Gate** in Theme Settings (`Theme Settings > Native Age Verification (21+)`), disable or uninstall the external AgeChecker Plus app embed to remove blocking third-party scripts and improve Core Web Vitals.

