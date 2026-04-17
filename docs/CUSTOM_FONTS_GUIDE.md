# Custom fonts in this project

> **This repo (Outliner, Electrobun):** Put LXGW Bright `.ttf` files in **`src/renderer/fonts/`** (listed in `.gitignore` — **do not commit binaries**). The build copies them to `views/renderer/fonts/`. Wiring: `src/renderer/styles/fonts.css`, `themeManager.ts` (`outliner_uiFont`), Settings → **Typography**.

The sections below describe a reference **`public/`**-based app; use them as a checklist when reimplementing a similar setup elsewhere.

## Overview

| Layer | Mechanism |
|-------|-----------|
| **Design tokens** | CSS variables `--font-body` and `--font-display` in `public/css/variables.css` |
| **Font loading** | `public/css/fonts.css` — Google Fonts via `@import` plus local `@font-face` rules for LXGW Bright |
| **Global stylesheet order** | `public/styles.css` imports `variables.css` first, then `fonts.css`, then the rest |
| **User overrides** | `public/managers/fontSettingsManager.js` — reads/writes `localStorage`, sets `document.documentElement` CSS variables and `window.GRAPH_CONSTANTS` for canvas |
| **Settings UI** | `public/templates/dialogs/settings-dialog.html` — `<select>` options use full `font-family` strings (e.g. `'LXGW Bright', Arial, sans-serif`) |

## Local font files (`public/fonts/`)

Binary font files live in **`public/fonts/`** (e.g. `LXGWBright-Regular.ttf`, `LXGWBright-Italic.ttf`, `LXGWBright-Light.ttf`, `LXGWBright-LightItalic.ttf`, `LXGWBright-Medium.ttf`, `LXGWBright-MediumItalic.ttf`).

- **`public/fonts` is listed in `.gitignore`**, so font binaries are not committed. Clone the [LXGW Bright](https://github.com/lxgw/LxgwBright) release (or your own files) into `public/fonts/` locally when developing or packaging the app.
- Files are served as static assets: a request path like `/fonts/LXGWBright-Regular.ttf` resolves from the project’s public root.

## Declaring LXGW Bright (`public/css/fonts.css`)

Local fonts are registered with **`@font-face`**. All LXGW variants share the same logical name **`"LXGW Bright"`**; weight and style distinguish them:

- **400** normal → `LXGWBright-Regular.ttf`
- **400** italic → `LXGWBright-Italic.ttf`
- **300** normal → `LXGWBright-Light.ttf`
- **300** italic → `LXGWBright-LightItalic.ttf`
- **500** normal → `LXGWBright-Medium.ttf`
- **500** italic → `LXGWBright-MediumItalic.ttf`

Paths are **relative to the CSS file** (`public/css/fonts.css`), so TTF files are referenced as `../fonts/...`:

```css
@font-face {
    font-family: "LXGW Bright";
    src: url("../fonts/LXGWBright-Regular.ttf") format("truetype");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
}
```

`font-display: swap` avoids invisible text while fonts load.

The same file also pulls theme fonts from Google Fonts (`@import url('https://fonts.googleapis.com/...')`) for **Plus Jakarta Sans**, **DM Sans**, **Fraunces**, **Nunito**, etc.

## Load order (`public/styles.css`)

`fonts.css` must load **after** design tokens and **before** rules that use those fonts:

1. `variables.css` — defines default `--font-body` / `--font-display`
2. **`fonts.css`** — registers `@font-face` and remote `@import` fonts
3. `base.css`, `layout.css`, … — consume `var(--font-body)` / `var(--font-display)`

If `@font-face` runs too late, the first paint may use fallback faces until the next style pass.

## Default typography (`public/css/variables.css`)

Defaults are theme-oriented (e.g. Plus Jakarta Sans + DM Sans for the Neumorphism theme). Components use **`var(--font-body)`** and **`var(--font-display)`** (see `public/css/base.css`), not hard-coded LXGW — LXGW is optional via settings.

## Theme integration (`public/managers/themeManager.js`)

Each theme can set `--font-display` and `--font-body` when applied. User font preferences, when saved, override these via inline styles on the root element (see below).

## User font settings (`public/managers/fontSettingsManager.js`)

- **Storage key:** `graphApp_fontSettings` in `localStorage`.
- **Defaults** (`DEFAULT_SETTINGS`): system UI stack for `uiFontFamily`; `Arial` for canvas English and Chinese font family strings; base sizes for canvas and selection info.
- **`applyUIFont`:** sets `document.body.style.fontFamily` and, when applying user choices, **`--font-body` and `--font-display`** on `document.documentElement` so the whole design system follows one UI font.
- **`initializeFontSettings`:** only overrides CSS variables if the user has **saved** settings; otherwise `variables.css` defaults remain.
- **Canvas-related:** updates **`window.GRAPH_CONSTANTS`** (`DEFAULT_FONT_FAMILY`, `DEFAULT_CHINESE_FONT_FAMILY`, `DEFAULT_FONT_SIZE`, `SELECTION_INFO_FONT_SIZE`) so the graph code reads runtime values. `GRAPH_CONSTANTS` is assigned on `window` from `public/app.js` so these mutations work.

## Settings dialog (`public/templates/dialogs/settings-dialog.html`)

Each `<option>` stores a full **`font-family` value** (not just a nickname). LXGW is selected with:

```html
<option value="'LXGW Bright', Arial, sans-serif">LXGW Bright</option>
```

Quoting `'LXGW Bright'` is required because the name contains a space. The fallback stack (`Arial, sans-serif`) keeps labels readable if the local files are missing.

Previews update by setting `preview.style.fontFamily = select.value` in `public/ui/dialogs/settingsDialog.js`.

## Canvas rendering (`public/styles.js`, `public/graph-renderer.js`)

- **`getFontString(baseSize, scale, fontFamily)`** in `public/styles.js` builds `ctx.font` as `` `${size}px ${family}` `` with `family` defaulting to **`GRAPH_CONSTANTS.DEFAULT_FONT_FAMILY`**.
- Node labels use **`getFontString(...)`** with that default; edge weight labels also use `getFontString` with the same family source.

**Note:** `DEFAULT_CHINESE_FONT_FAMILY` is updated when the user saves the “Canvas Label Font (Chinese)” setting, but **current canvas node label drawing uses the primary label and `DEFAULT_FONT_FAMILY`** in `renderNodeLabel`. Choosing **LXGW** for the **English** canvas font is what makes mixed Latin + CJK text render with LXGW on the canvas for the main label. If you need separate English vs Chinese drawing (e.g. two lines or `chineseLabel`), you would extend the renderer to call `getFontString` with `DEFAULT_CHINESE_FONT_FAMILY` where appropriate.

## Reimplementing this in another project

1. **Add font files** under a static directory served at a stable URL (e.g. `public/fonts/` → `/fonts/...`).
2. **Add `@font-face`** blocks (one per file/weight/style), same `font-family` string, correct `font-weight` / `font-style`, `font-display: swap`.
3. **Fix `src` URLs** relative to the CSS file that contains `@font-face`, or use root-absolute paths like `/fonts/MyFont.woff2` if your bundler or server supports it.
4. **Load that CSS early** in your global entry or main stylesheet **before** components that reference the family.
5. **Reference the family** in CSS or JS: `'Your Font Name', fallbacks...`.
6. **For Canvas:** set `ctx.font` to a string that includes the same family name the browser resolved from `@font-face` (and ensure the font has loaded before measuring/drawing if you need metrics — optional `document.fonts.load()`).
7. **For user preference:** persist a string, apply to CSS variables for DOM UI, and mirror into your own constants object for canvas if you use the same pattern.

## Related docs

- `docs/THEME_SYSTEM_GUIDE.md` — themes and `--font-*` customization
- `CHANGELOG.md` — historical notes on LXGW Bright integration

## Quick file reference

| File | Role |
|------|------|
| `public/css/fonts.css` | Google Fonts `@import` + LXGW `@font-face` |
| `public/css/variables.css` | Default `--font-body` / `--font-display` |
| `public/styles.css` | Import order |
| `public/managers/fontSettingsManager.js` | Persistence and applying UI + canvas constants |
| `public/templates/dialogs/settings-dialog.html` | Font `<select>` options and preview markup |
| `public/utils/constants.js` | `GRAPH_CONSTANTS` defaults for canvas text |
| `public/styles.js` | `getFontString` for canvas |
| `.gitignore` | Ignores `public/fonts` |
