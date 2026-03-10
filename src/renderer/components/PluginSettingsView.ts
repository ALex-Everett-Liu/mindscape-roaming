import { useState, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { api } from "../rpc/api";
import type { PluginInfo } from "../../shared/types";

interface Props {
  onClose: () => void;
}

export function PluginSettingsView({ onClose }: Props) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);

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

  return html`
    <div class="settings-overlay" onClick=${onClose}>
      <div class="settings-modal" onClick=${(e: Event) => e.stopPropagation()}>
        <div class="settings-header">
          <h2>Plugins</h2>
          <button class="btn-close" onClick=${onClose}>×</button>
        </div>
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
      </div>
    </div>
  `;
}
