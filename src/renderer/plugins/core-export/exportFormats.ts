import type { OutlineTreeNode } from "../../../shared/types";

function timestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMarkdownBullet(text: string): string {
  // Escape leading bullet/list characters so they don't become nested lists
  return text.replace(/^(\s*)([-*+]|\d+\.)\s/, "$1\\$2 ");
}

export function exportToJson(tree: OutlineTreeNode[]): { content: string; filename: string; mimeType: string } {
  const json = JSON.stringify(tree, null, 2);
  return {
    content: json,
    filename: `mindscape-export-${timestamp()}.json`,
    mimeType: "application/json",
  };
}

function treeToMarkdown(nodes: OutlineTreeNode[], indent = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const prefix = " ".repeat(indent) + "- ";
    const text = escapeMarkdownBullet(node.content);
    lines.push(prefix + text);
    if (node.children.length > 0) {
      lines.push(treeToMarkdown(node.children, indent + 2));
    }
  }
  return lines.join("\n");
}

export function exportToMarkdown(tree: OutlineTreeNode[]): { content: string; filename: string; mimeType: string } {
  const body = treeToMarkdown(tree);
  return {
    content: body,
    filename: `mindscape-export-${timestamp()}.md`,
    mimeType: "text/markdown",
  };
}

function treeToPlainText(nodes: OutlineTreeNode[], indent = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const prefix = "  ".repeat(indent);
    lines.push(prefix + node.content);
    if (node.children.length > 0) {
      lines.push(treeToPlainText(node.children, indent + 1));
    }
  }
  return lines.join("\n");
}

export function exportToPlainText(tree: OutlineTreeNode[]): { content: string; filename: string; mimeType: string } {
  const body = treeToPlainText(tree);
  return {
    content: body,
    filename: `mindscape-export-${timestamp()}.txt`,
    mimeType: "text/plain",
  };
}

function treeToOpml(nodes: OutlineTreeNode[], depth = 0): string {
  const indent = "  ".repeat(depth + 2); // base 4 spaces inside <body>
  return nodes
    .map((node) => {
      const childrenXml = node.children.length > 0 ? treeToOpml(node.children, depth + 1) : "";
      return `${indent}<outline text="${escapeXml(node.content)}">${childrenXml ? "\n" + childrenXml + "\n" + indent : ""}</outline>`;
    })
    .join("\n");
}

export function exportToOpml(tree: OutlineTreeNode[]): { content: string; filename: string; mimeType: string } {
  const dateCreated = new Date().toUTCString();
  const body = treeToOpml(tree);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Mindscape Export</title>
    <dateCreated>${dateCreated}</dateCreated>
  </head>
  <body>
${body}
  </body>
</opml>`;
  return {
    content: xml,
    filename: `mindscape-export-${timestamp()}.opml`,
    mimeType: "text/x-opml+xml",
  };
}

function treeToHtml(nodes: OutlineTreeNode[]): string {
  if (nodes.length === 0) return "";
  const items = nodes
    .map((node) => {
      const childrenHtml = node.children.length > 0 ? treeToHtml(node.children) : "";
      return `<li>${escapeXml(node.content)}${childrenHtml}</li>`;
    })
    .join("\n");
  return `<ul>\n${items}\n</ul>`;
}

export function exportToHtml(tree: OutlineTreeNode[]): { content: string; filename: string; mimeType: string } {
  const body = treeToHtml(tree);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mindscape Export</title>
  <style>
    :root {
      --bg: #1a1a2e;
      --bg-secondary: #16213e;
      --text: #e0e0e0;
      --text-muted: #888;
      --accent: #4fc3f7;
      --border: #2a2a4a;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 15px;
      line-height: 1.6;
      padding: 40px 24px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 24px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    ul {
      list-style: none;
      padding-left: 0;
    }
    li {
      position: relative;
      padding: 4px 0 4px 20px;
      margin: 2px 0;
      border-radius: 4px;
    }
    li:hover {
      background: rgba(79, 195, 247, 0.06);
    }
    li::before {
      content: "•";
      position: absolute;
      left: 0;
      top: 4px;
      color: var(--accent);
      font-size: 18px;
      line-height: 1;
    }
    ul ul {
      padding-left: 16px;
      margin-top: 2px;
    }
    .meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 24px;
    }
  </style>
</head>
<body>
  <h1>Mindscape Export</h1>
  <p class="meta">Exported on ${new Date().toLocaleString()}</p>
  ${body}
</body>
</html>`;
  return {
    content: html,
    filename: `mindscape-export-${timestamp()}.html`,
    mimeType: "text/html",
  };
}

export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
