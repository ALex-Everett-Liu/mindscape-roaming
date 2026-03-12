# Theme System Guide

This guide helps contributors and developers create custom themes for Mindscape Outliner. Themes are defined as sets of CSS variables; the app applies them to the document root, and all components adapt automatically.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Required CSS Variables](#required-css-variables)
4. [Creating a New Theme](#creating-a-new-theme)
5. [Adding Custom Fonts](#adding-custom-fonts)
6. [Theme-Specific CSS](#theme-specific-css)
7. [Best Practices](#best-practices)
8. [Testing Your Theme](#testing-your-theme)

---

## Overview

**Current themes:**

| Theme | Description |
|-------|-------------|
| **Native** (default) | Simple dark theme with native system styling |
| **Light** | Clean, minimal light theme |
| **Organic** | Warm, natural palette with earth tones |
| **Ocean** | Cool oceanic blue tones |
| **Forest** | Deep green, nature-inspired |

**How to switch themes:** Click the gear icon in the toolbar → Theme tab → Click a theme card. Your choice is saved automatically.

---

## Architecture

```
themeManager.ts (THEMES object)
        ↓
applyTheme() sets CSS variables on document.documentElement
        ↓
main.css + components use var(--bg), var(--accent), etc.
        ↓
Theme change = instant visual update
```

### File Structure

```
src/
├── renderer/
│   ├── theme/
│   │   └── themeManager.ts    ← Theme definitions (EDIT HERE)
│   ├── styles/
│   │   └── main.css           ← Components using CSS variables
│   ├── components/
│   │   └── PluginSettingsView.ts   ← Theme selector UI
│   └── index.html            ← Add font imports here if needed
```

All components reference CSS variables (e.g., `var(--bg)`, `var(--accent)`). Themes override these variables on `:root`, so components adapt without code changes.

---

## Required CSS Variables

Every theme must define these variables. Use the **Native** theme in `themeManager.ts` as a reference.

| Variable | Purpose | Example |
|----------|---------|---------|
| `--bg` | Main background (body, app canvas) | `#1a1a2e` |
| `--bg-secondary` | Toolbar, breadcrumb, cards, modal | `#16213e` |
| `--text` | Primary text color | `#e0e0e0` |
| `--text-muted` | Secondary text, placeholders | `#888` |
| `--accent` | Primary accent (buttons, links, app title) | `#4fc3f7` |
| `--accent-hover` | Hover state for accent elements | `#81d4fa` |
| `--border` | Borders, dividers | `#2a2a4a` |
| `--bullet` | Outline bullet color (leaf nodes) | `#4fc3f7` |
| `--bullet-parent` | Bullet color for nodes with children | `#fff` |
| `--focus-bg` | Hover/focus background (subtle highlight) | `rgba(79, 195, 247, 0.08)` |
| `--font-mono` | Monospace font stack | `"SF Mono", "Fira Code", monospace` |
| `--font-sans` | Sans-serif font stack | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |

---

## Creating a New Theme

### Step 1: Add the theme to themeManager.ts

**File:** `src/renderer/theme/themeManager.ts`

Add your theme to the `THEMES` object:

```typescript
export const THEMES: Record<string, ThemeDefinition> = {
  // ... existing themes ...

  myTheme: {
    name: "My Theme",
    description: "Short description shown in the Theme tab",
    variables: {
      "--bg": "#0d1117",
      "--bg-secondary": "#161b22",
      "--text": "#c9d1d9",
      "--text-muted": "#8b949e",
      "--accent": "#58a6ff",
      "--accent-hover": "#79b8ff",
      "--border": "#30363d",
      "--bullet": "#58a6ff",
      "--bullet-parent": "#ffffff",
      "--focus-bg": "rgba(88, 166, 255, 0.08)",
      "--font-mono": '"SF Mono", "Fira Code", monospace',
      "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },
};
```

### Step 2: Verify in the app

1. Run the app (`bun run start` or `bun run build` then run the built app).
2. Open Settings → Theme tab.
3. Click your new theme. It should apply immediately.

### Theme ID rules

- **Lowercase** only
- Use **hyphens** for multi-word IDs: `dark-mode`, `high-contrast`
- No spaces or special characters

---

## Adding Custom Fonts

If your theme uses a web font (e.g., Google Fonts), add it to `src/renderer/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=YourFont:wght@400;600&display=swap" rel="stylesheet" />
```

Then reference it in your theme variables:

```typescript
"--font-sans": '"YourFont", -apple-system, BlinkMacSystemFont, sans-serif',
```

Always include fallback fonts for reliability.

---

## Theme-Specific CSS

The theme manager adds a `theme-{id}` class to `<body>` when a theme is active. You can use this for overrides:

```css
/* src/renderer/styles/main.css */

.theme-myTheme .special-element {
  /* Overrides only when "my theme" is active */
}
```

Most styling should use CSS variables; use theme classes only when variables are insufficient.

---

## Best Practices

### Contrast

- Ensure text meets **WCAG AA** (4.5:1 minimum) on the background.
- Test `--text` on `--bg` and `--text-muted` on `--bg-secondary`.

### Focus states

- `--focus-bg` should be a semi-transparent overlay (e.g., `rgba(accent, 0.08)`).
- Keeps focus indicators visible across light and dark themes.

### Consistent accent usage

- Use `--accent` for primary actions and highlights.
- Use `--accent-hover` for hover states on accent-colored elements.
- `--bullet` and `--bullet-parent` can match the accent or differ for hierarchy.

### Descriptions

- Keep descriptions to one short line.
- Example: `"Warm, natural theme with earth-drawn palette"`.

---

## Testing Your Theme

Check these areas:

- [ ] **Toolbar**: Title, search input, buttons, gear icon
- [ ] **Breadcrumb**: Text, separators, hover states
- [ ] **Outline tree**: Bullets, node text, expand/collapse, hover, focus
- [ ] **Settings modal**: Tabs, plugin rows, theme cards, toggle
- [ ] **Save/Discard**: Success and error feedback text
- [ ] **Search results**: Hover and selection states

Use browser DevTools to inspect computed `--*` variables and confirm your theme values are applied.

---

## Quick Reference: Full Theme Template

```typescript
myTheme: {
  name: "Display Name",
  description: "One-line description",
  variables: {
    "--bg": "#...",
    "--bg-secondary": "#...",
    "--text": "#...",
    "--text-muted": "#...",
    "--accent": "#...",
    "--accent-hover": "#...",
    "--border": "#...",
    "--bullet": "#...",
    "--bullet-parent": "#...",
    "--focus-bg": "rgba(...)",
    "--font-mono": '"SF Mono", "Fira Code", monospace',
    "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
},
```

---

**Last updated:** 2025-03-12  
**Version:** 0.1.7
