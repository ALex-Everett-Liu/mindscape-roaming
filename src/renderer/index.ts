import { render } from "preact";
import { html } from "htm/preact";
import { Electroview } from "electrobun/view";
import type { OutlinerRPCType } from "../shared/rpc-schema";
import { initApi } from "./rpc/api";
import { App } from "./components/App";
import { store } from "./state/store";

// Initialize Electrobun RPC - connects to main process
const rpc = Electroview.defineRPC<OutlinerRPCType>({
  handlers: {
    requests: {},
    messages: {},
  },
});
const electroview = new Electroview({ rpc });
initApi(electroview.rpc.request as Parameters<typeof initApi>[0]);

// Initial data load
store.loadTree();

// Render app
render(html`<${App} />`, document.getElementById("app")!);
