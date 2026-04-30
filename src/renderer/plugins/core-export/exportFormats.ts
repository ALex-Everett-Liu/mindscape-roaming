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

export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
