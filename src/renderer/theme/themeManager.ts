/**
 * Theme Manager
 * Handles theme switching and persistence for the Outliner app.
 *
 * Themes:
 * - native: Simple dark theme (default, system-native style)
 * - light: Clean light theme
 * - organic: Warm, natural theme with earth-drawn palette
 * - ocean: Cool oceanic blue tones
 * - forest: Deep green, nature-inspired
 */

const STORAGE_KEY = "outliner_theme";
export const DEFAULT_THEME = "native";

export interface ThemeDefinition {
  name: string;
  description: string;
  variables: Record<string, string>;
}

/**
 * Theme Definitions
 * Each theme defines CSS variables that override the base design tokens in main.css
 */
export const THEMES: Record<string, ThemeDefinition> = {
  native: {
    name: "Native",
    description: "Simple dark theme with native system styling",
    variables: {
      "--bg": "#1a1a2e",
      "--bg-secondary": "#16213e",
      "--text": "#e0e0e0",
      "--text-muted": "#888",
      "--accent": "#4fc3f7",
      "--accent-hover": "#81d4fa",
      "--border": "#2a2a4a",
      "--bullet": "#4fc3f7",
      "--bullet-parent": "#fff",
      "--focus-bg": "rgba(79, 195, 247, 0.08)",
      "--font-mono": '"SF Mono", "Fira Code", monospace',
      "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },

  light: {
    name: "Light",
    description: "Clean, minimal light theme",
    variables: {
      "--bg": "#f5f5f5",
      "--bg-secondary": "#ffffff",
      "--text": "#1a1a1a",
      "--text-muted": "#6b7280",
      "--accent": "#0284c7",
      "--accent-hover": "#0ea5e9",
      "--border": "#e5e7eb",
      "--bullet": "#0284c7",
      "--bullet-parent": "#64748b",
      "--focus-bg": "rgba(2, 132, 199, 0.08)",
      "--font-mono": '"SF Mono", "Fira Code", monospace',
      "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },

  organic: {
    name: "Organic",
    description: "Warm, natural theme with earth-drawn palette",
    variables: {
      "--bg": "#fdfcf8",
      "--bg-secondary": "#f5f0e6",
      "--text": "#2c2c24",
      "--text-muted": "#78786c",
      "--accent": "#5d7052",
      "--accent-hover": "#6b7f60",
      "--border": "#d4cfc4",
      "--bullet": "#5d7052",
      "--bullet-parent": "#4a4a42",
      "--focus-bg": "rgba(93, 112, 82, 0.08)",
      "--font-mono": '"SF Mono", "Fira Code", monospace',
      "--font-sans": '"Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },

  ocean: {
    name: "Ocean",
    description: "Cool oceanic blue tones",
    variables: {
      "--bg": "#0f172a",
      "--bg-secondary": "#1e293b",
      "--text": "#e2e8f0",
      "--text-muted": "#94a3b8",
      "--accent": "#38bdf8",
      "--accent-hover": "#7dd3fc",
      "--border": "#334155",
      "--bullet": "#38bdf8",
      "--bullet-parent": "#f8fafc",
      "--focus-bg": "rgba(56, 189, 248, 0.1)",
      "--font-mono": '"SF Mono", "Fira Code", monospace',
      "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },

  forest: {
    name: "Forest",
    description: "Deep green, nature-inspired",
    variables: {
      "--bg": "#0d1f12",
      "--bg-secondary": "#1a2e1e",
      "--text": "#d4e6db",
      "--text-muted": "#7d9b85",
      "--accent": "#4ade80",
      "--accent-hover": "#86efac",
      "--border": "#2d4a36",
      "--bullet": "#4ade80",
      "--bullet-parent": "#f0fdf4",
      "--focus-bg": "rgba(74, 222, 128, 0.08)",
      "--font-mono": '"SF Mono", "Fira Code", monospace',
      "--font-sans": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
  },
};

/**
 * Load theme from localStorage
 */
export function loadTheme(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES[stored]) return stored;
  } catch (e) {
    console.warn("Failed to load theme:", e);
  }
  return DEFAULT_THEME;
}

/**
 * Save theme to localStorage
 */
export function saveTheme(themeId: string): void {
  try {
    if (!THEMES[themeId]) {
      console.warn(`Invalid theme ID: ${themeId}`);
      return;
    }
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch (e) {
    console.error("Failed to save theme:", e);
  }
}

/**
 * Apply theme to the document
 */
export function applyTheme(themeId: string): void {
  const theme = THEMES[themeId];
  if (!theme) {
    console.warn(`Theme not found: ${themeId}`);
    return;
  }

  const root = document.documentElement;
  Object.entries(theme.variables).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });

  // Add theme class for theme-specific styling if needed
  document.body.className = document.body.className
    .split(" ")
    .filter((cls) => !cls.startsWith("theme-"))
    .join(" ") + ` theme-${themeId}`;

  saveTheme(themeId);
}

/**
 * Get current theme ID
 */
export function getCurrentTheme(): string {
  return loadTheme();
}

/**
 * Get theme info
 */
export function getThemeInfo(themeId: string): ThemeDefinition | null {
  return THEMES[themeId] ?? null;
}

/**
 * Get all available themes
 */
export function getAllThemes(): Record<string, ThemeDefinition> {
  return THEMES;
}

/**
 * Initialize theme on app load
 */
export function initializeTheme(): string {
  const themeId = loadTheme();
  applyTheme(themeId);
  return themeId;
}

/**
 * Reset theme to default
 */
export function resetTheme(): string {
  localStorage.removeItem(STORAGE_KEY);
  applyTheme(DEFAULT_THEME);
  return DEFAULT_THEME;
}
