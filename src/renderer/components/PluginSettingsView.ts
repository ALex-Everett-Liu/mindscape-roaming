import { useState, useEffect, useRef } from "preact/hooks";
import { html } from "htm/preact";
import { api } from "../rpc/api";
import { store } from "../state/store";
import { syncRendererPluginState } from "../plugin-system/loadRendererPlugins";
import type { PluginInfo, SettingsExport } from "../../shared/types";
import {
  getAllThemes,
  getCurrentTheme,
  applyTheme,
  getSavedUIFont,
  setUIFont,
  UI_FONT_OPTIONS,
  getSavedUIFontSize,
  setUIFontSize,
  UI_FONT_SIZE_OPTIONS,
  type ThemeDefinition,
} from "../theme/themeManager";
import {
  exportToJson,
  exportToMarkdown,
  exportToPlainText,
  exportToOpml,
  exportToHtml,
  triggerDownload,
} from "../plugins/core-export/exportFormats";

const SETTINGS_EXPORT_VERSION = 2;

interface Props {
  onClose: () => void;
}

type SettingsTab = "plugins" | "theme" | "typography" | "import-export";

export function PluginSettingsView({ onClose }: Props) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>("plugins");
  const [selectedTheme, setSelectedTheme] = useState(getCurrentTheme());
  const [selectedUIFont, setSelectedUIFont] = useState(() => getSavedUIFont() ?? "");
  const [selectedUIFontSize, setSelectedUIFontSize] = useState(() => getSavedUIFontSize() ?? "15px");
  const [customFontSize, setCustomFontSize] = useState(() => {
    const saved = getSavedUIFontSize() ?? "15px";
    return UI_FONT_SIZE_OPTIONS.some((o) => o.value === saved) ? "" : saved.replace("px", "");
  });
  const [importExportError, setImportExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const res = await api.listPlugins();
    if (res.success && res.data) setPlugins(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = async (plugin: PluginInfo) => {
    if (plugin.essential) return;
    const res = plugin.enabled
      ? await api.disablePlugin(plugin.id)
      : await api.enablePlugin(plugin.id);
    if (res.success) {
      load();
      if (plugin.enabled) {
        alert("Plugin disabled. Some features may require an app restart to take effect.");
      }
    } else {
      alert(res.error ?? "Failed to toggle plugin");
    }
  };

  const handleThemeSelect = (id: string) => {
    setSelectedTheme(id);
    applyTheme(id);
  };

  const handleExport = () => {
    setImportExportError(null);
    const pluginsMap: Record<string, boolean> = {};
    for (const p of plugins) {
      pluginsMap[p.id] = p.enabled;
    }
    const savedFont = getSavedUIFont();
    const data: SettingsExport = {
      version: SETTINGS_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      theme: getCurrentTheme(),
      ...(savedFont ? { uiFont: savedFont } : {}),
      plugins: pluginsMap,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "outliner-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    setImportExportError(null);
    fileInputRef.current?.click();
  };

  const handleOutlineExport = async (format: "json" | "markdown" | "opml" | "txt" | "html") => {
    setExportMessage(null);
    const res = await api.getFullTree();
    if (!res.success || !res.data || res.data.length === 0) {
      setExportMessage("Nothing to export — the outline is empty.");
      return;
    }
    const tree = res.data;
    let result: { content: string; filename: string; mimeType: string };
    switch (format) {
      case "json":
        result = exportToJson(tree);
        break;
      case "markdown":
        result = exportToMarkdown(tree);
        break;
      case "opml":
        result = exportToOpml(tree);
        break;
      case "txt":
        result = exportToPlainText(tree);
        break;
      case "html":
        result = exportToHtml(tree);
        break;
    }
    triggerDownload(result.content, result.filename, result.mimeType);
    setExportMessage(`Exported as ${result.filename}`);
  };

  const handleImportFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setImportExportError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as SettingsExport;
      if (typeof data?.version !== "number" || !data.theme || typeof data.plugins !== "object") {
        throw new Error("Invalid settings file format");
      }
      const themesMap = getAllThemes();
      const themeId = themesMap[data.theme] ? data.theme : "native";
      applyTheme(themeId);
      setSelectedTheme(themeId);
      const importedFont =
        typeof data.uiFont === "string" && data.uiFont.trim()
          ? data.uiFont.trim()
          : null;
      setUIFont(importedFont);
      setSelectedUIFont(importedFont ?? "");
      const res = await api.importPluginStates(data.plugins);
      if (res.success) {
        await load();
        await store.refreshSearchAvailability();
        await syncRendererPluginState();
      } else {
        setImportExportError(res.error ?? "Failed to import plugin states");
      }
    } catch (err) {
      setImportExportError(err instanceof Error ? err.message : "Failed to import settings");
    }
  };

  const themes = getAllThemes();
  const themeEntries = Object.entries(themes);

  return html`
    <div class="settings-overlay" onClick=${onClose}>
      <div class="settings-modal" onClick=${(e: Event) => e.stopPropagation()}>
        <div class="settings-header">
          <h2>Settings</h2>
          <button class="btn-close" onClick=${onClose}>×</button>
        </div>

        <div class="settings-tabs">
          <button
            class="settings-tab ${activeTab === "plugins" ? "active" : ""}"
            onClick=${() => setActiveTab("plugins")}
          >
            Plugins
          </button>
          <button
            class="settings-tab ${activeTab === "theme" ? "active" : ""}"
            onClick=${() => setActiveTab("theme")}
          >
            Theme
          </button>
          <button
            class="settings-tab ${activeTab === "typography" ? "active" : ""}"
            onClick=${() => setActiveTab("typography")}
          >
            Typography
          </button>
          <button
            class="settings-tab ${activeTab === "import-export" ? "active" : ""}"
            onClick=${() => setActiveTab("import-export")}
          >
            Import / Export
          </button>
        </div>

        <input
          ref=${fileInputRef}
          type="file"
          accept=".json,application/json"
          style="display: none"
          onChange=${handleImportFile}
        />

        ${activeTab === "plugins" &&
        html`
          <p class="settings-desc">Enable or disable features. Essential plugins cannot be turned off.</p>
          <div class="plugin-list">
            ${plugins.map(
              (p) => html`
                <div class="plugin-row ${p.enabled ? "enabled" : "disabled"}">
                  <div class="plugin-info">
                    <strong>${p.name}</strong>
                    <span class="plugin-id">${p.id}</span>
                    <p class="plugin-desc">${p.description}</p>
                    ${p.essential && html`<span class="badge">Essential</span>`}
                  </div>
                  <label class="toggle">
                    <input
                      type="checkbox"
                      checked=${p.enabled}
                      disabled=${p.essential}
                      onChange=${() => toggle(p)}
                    />
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              `
            )}
          </div>
        `}

        ${activeTab === "theme" &&
        html`
          <p class="settings-desc">Click a theme to apply. Your choice is saved automatically.</p>
          <div class="theme-list">
            ${themeEntries.map(
              ([id, theme]) => html`
                <div
                  class="theme-card ${selectedTheme === id ? "selected" : ""}"
                  onClick=${() => handleThemeSelect(id)}
                >
                  <div class="theme-preview" style=${getThemePreviewStyle(theme)}>
                    <span class="theme-preview-text">Aa</span>
                  </div>
                  <div class="theme-info">
                    <strong>${theme.name}</strong>
                    <p class="theme-desc">${theme.description}</p>
                  </div>
                </div>
              `
            )}
          </div>
        `}

        ${activeTab === "typography" &&
        html`
          <p class="settings-desc">
            Choose UI font and font size. Theme default follows each theme’s typography (e.g. Nunito on Organic). LXGW Bright uses
            local files bundled with the app.
          </p>
          <div class="typography-panel">
            <label class="typography-label" for="settings-ui-font">Interface font</label>
            <select
              id="settings-ui-font"
              class="typography-select"
              value=${selectedUIFont}
              onChange=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                setSelectedUIFont(v);
                setUIFont(v || null);
              }}
            >
              ${(() => {
                const opts = [...UI_FONT_OPTIONS];
                if (
                  selectedUIFont &&
                  !opts.some((o) => o.value === selectedUIFont)
                ) {
                  opts.splice(1, 0, { label: "Custom", value: selectedUIFont });
                }
                return opts.map(
                  (o) => html`<option value=${o.value}>${o.label}</option>`
                );
              })()}
            </select>
            
            <label class="typography-label" for="settings-ui-font-size">Font size</label>
            <select
              id="settings-ui-font-size"
              class="typography-select"
              value=${UI_FONT_SIZE_OPTIONS.some((o) => o.value === selectedUIFontSize) ? selectedUIFontSize : "custom"}
              onChange=${(e: Event) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v === "custom") {
                  setCustomFontSize(selectedUIFontSize.replace("px", ""));
                  setSelectedUIFontSize("custom");
                } else {
                  setSelectedUIFontSize(v);
                  setUIFontSize(v);
                }
              }}
            >
              ${UI_FONT_SIZE_OPTIONS.map(
                (o) => html`<option value=${o.value}>${o.label}</option>`
              )}
              <option value="custom">${!UI_FONT_SIZE_OPTIONS.some((o) => o.value === selectedUIFontSize) && customFontSize ? `Custom (${customFontSize}px)` : "Custom..."}</option>
            </select>
            
            ${!UI_FONT_SIZE_OPTIONS.some((o) => o.value === selectedUIFontSize) &&
            html`
              <div class="custom-font-size-input">
                <input
                  type="number"
                  min="8"
                  max="72"
                  value=${customFontSize}
                  onChange=${(e: Event) => {
                    const val = (e.target as HTMLInputElement).value;
                    setCustomFontSize(val);
                  }}
                  onKeyPress=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value;
                      const num = parseInt(val, 10);
                      if (num >= 8 && num <= 72) {
                        const newSize = `${num}px`;
                        setSelectedUIFontSize(newSize);
                        setUIFontSize(newSize);
                      }
                    }
                  }}
                  placeholder="Enter font size"
                  class="typography-input"
                />
                <span class="typography-input-suffix">px</span>
              </div>
            `}
            
            <p class="font-preview" style=${`font-family: ${selectedUIFont ? selectedUIFont : "inherit"}; font-size: ${selectedUIFontSize === "custom" ? `${customFontSize}px` : selectedUIFontSize}`}>
              The quick brown fox jumps over the lazy dog. 敏捷的棕狐跳过懒狗。
            </p>
          </div>
        `}

        ${activeTab === "import-export" &&
        html`
          <p class="settings-desc">Export or import your theme and plugin settings. Import will overwrite your current settings.</p>
          ${importExportError && html`<p class="settings-import-error">${importExportError}</p>`}
          <div class="import-export-actions">
            <button class="btn" onClick=${handleExport}>Export settings</button>
            <button class="btn" onClick=${handleImportClick}>Import settings</button>
          </div>
          <p class="settings-desc">Export your outline data in various formats.</p>
          ${exportMessage && html`<p class="settings-import-error" style="color: var(--accent)">${exportMessage}</p>`}
          <div class="import-export-actions">
            <button class="btn" onClick=${() => handleOutlineExport("json")}>Export JSON</button>
            <button class="btn" onClick=${() => handleOutlineExport("markdown")}>Export Markdown</button>
            <button class="btn" onClick=${() => handleOutlineExport("opml")}>Export OPML</button>
            <button class="btn" onClick=${() => handleOutlineExport("txt")}>Export TXT</button>
            <button class="btn" onClick=${() => handleOutlineExport("html")}>Export HTML</button>
          </div>
        `}
      </div>
    </div>
  `;
}

function getThemePreviewStyle(theme: ThemeDefinition): string {
  const bg = theme.variables["--bg"] ?? "#1a1a2e";
  const accent = theme.variables["--accent"] ?? "#4fc3f7";
  const text = theme.variables["--text"] ?? "#e0e0e0";
  return `background: ${bg}; color: ${text}; border: 2px solid ${accent};`;
}
