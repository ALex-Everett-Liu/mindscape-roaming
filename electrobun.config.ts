import type { ElectrobunConfig } from "electrobun";

const config: ElectrobunConfig = {
  app: {
    name: "Outliner",
    identifier: "sh.blackboard.outliner",
    version: "0.1.3",
  },
  build: {
    bun: {
      entrypoint: "src/main/index.ts",
    },
    views: {
      renderer: {
        entrypoint: "src/renderer/index.ts",
      },
    },
    copy: {
      "src/renderer/index.html": "views/renderer/index.html",
      "src/renderer/styles/main.css": "views/renderer/main.css",
    },
  },
};

export default config;
