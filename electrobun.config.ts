import type { ElectrobunConfig } from "electrobun";

const config: ElectrobunConfig = {
  app: {
    name: "Outliner",
    identifier: "sh.blackboard.outliner",
    version: "0.2.0",
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
      "src/renderer/styles/fonts.css": "views/renderer/fonts.css",
      "src/renderer/fonts/LXGWBright-Regular.ttf": "views/renderer/fonts/LXGWBright-Regular.ttf",
      "src/renderer/fonts/LXGWBright-Italic.ttf": "views/renderer/fonts/LXGWBright-Italic.ttf",
      "src/renderer/fonts/LXGWBright-Light.ttf": "views/renderer/fonts/LXGWBright-Light.ttf",
      "src/renderer/fonts/LXGWBright-LightItalic.ttf": "views/renderer/fonts/LXGWBright-LightItalic.ttf",
      "src/renderer/fonts/LXGWBright-Medium.ttf": "views/renderer/fonts/LXGWBright-Medium.ttf",
      "src/renderer/fonts/LXGWBright-MediumItalic.ttf": "views/renderer/fonts/LXGWBright-MediumItalic.ttf",
    },
  },
};

export default config;
