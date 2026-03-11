import { render } from "preact";
import { html } from "htm/preact";
import { Electroview } from "electrobun/view";
import type { OutlinerRPCType } from "../shared/rpc-schema";
import { initApi } from "./rpc/api";
import { App } from "./components/App";
import { store } from "./state/store";
import { loadRendererPlugins } from "./plugin-system/loadRendererPlugins";

// Initialize Electrobun RPC - connects to main process
const rpc = Electroview.defineRPC<OutlinerRPCType>({
  maxRequestTime: 15000,
  handlers: {
    requests: {},
    messages: {},
  },
});
const electroview = new Electroview({ rpc });
initApi(electroview.rpc!.request as Parameters<typeof initApi>[0]);

// Render app immediately (shows empty/loading state)
render(html`<${App} />`, document.getElementById("app")!);

// Defer data load and plugin load - give WebSocket time to connect to main process
setTimeout(async () => {
  await store.loadTree();
  await store.refreshSearchAvailability();
  await loadRendererPlugins().catch((err) => console.error("[renderer plugins] Failed to load:", err));
}, 300);
