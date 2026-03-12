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
  type ThemeDefinition,
} from "../theme/themeManager";

const SETTINGS_EXPORT_VERSION = 1;

interface Props {
  onClose: () => void;
}

type SettingsTab = "plugins" | "theme" | "import-export";

export function PluginSettingsView({ onClose }: Props) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTab>("plugins");
  const [selectedTheme, setSelectedTheme] = useState(getCurrentTheme());
  const [importExportError, setImportExportError] = useState<string | null>(null);
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
    const data: SettingsExport = {
      version: SETTINGS_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      theme: getCurrentTheme(),
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

        ${activeTab === "import-export" &&
        html`
          <p class="settings-desc">Export or import your theme and plugin settings. Import will overwrite your current settings.</p>
          ${importExportError && html`<p class="settings-import-error">${importExportError}</p>`}
          <div class="import-export-actions">
            <button class="btn" onClick=${handleExport}>Export settings</button>
            <button class="btn" onClick=${handleImportClick}>Import settings</button>
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
