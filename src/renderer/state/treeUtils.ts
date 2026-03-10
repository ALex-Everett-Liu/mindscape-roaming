/**
 * Pure tree manipulation utilities for manual-save.
 * All ops return a new tree; original is never mutated.
 */
import type { OutlineTreeNode } from "../../shared/types";

function deepCloneTree(nodes: OutlineTreeNode[]): OutlineTreeNode[] {
  return nodes.map((n) => ({
    ...n,
    children: deepCloneTree(n.children),
  }));
}

function withDepth(nodes: OutlineTreeNode[], depth: number): OutlineTreeNode[] {
  return nodes.map((n) => ({ ...n, depth, children: withDepth(n.children, depth + 1) }));
}

function reindexPositions(children: OutlineTreeNode[]): void {
  children.forEach((c, i) => {
    c.position = i;
  });
}

/** Find node and its location: parent's children array + index. */
function findLocation(
  nodes: OutlineTreeNode[],
  id: string
): { node: OutlineTreeNode; siblings: OutlineTreeNode[]; index: number; depth: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      return { node: nodes[i], siblings: nodes, index: i, depth: 0 };
    }
    const found = findLocationInParent(nodes[i].children, id, nodes[i].children, 1);
    if (found) return found;
  }
  return null;
}

function findLocationInParent(
  nodes: OutlineTreeNode[],
  id: string,
  siblings: OutlineTreeNode[],
  depth: number
): { node: OutlineTreeNode; siblings: OutlineTreeNode[]; index: number; depth: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      return { node: nodes[i], siblings, index: i, depth };
    }
    const found = findLocationInParent(nodes[i].children, id, nodes[i].children, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Create a new OutlineTreeNode. */
export function createTreeNode(
  id: string,
  content: string,
  parentId: string | null,
  position: number,
  depth: number
): OutlineTreeNode {
  const now = Date.now();
  return {
    id,
    content,
    parent_id: parentId,
    position,
    is_expanded: true,
    created_at: now,
    updated_at: now,
    children: [],
    depth,
  };
}

/** Add node to tree. rootParentId: when parentId is the virtual root (e.g. zoomed node not in tree), use tree root as siblings. */
export function addNodeToTree(
  tree: OutlineTreeNode[],
  newNode: OutlineTreeNode,
  parentId: string | null,
  insertAfterId: string | null,
  rootParentId?: string | null
): OutlineTreeNode[] {
  const cloned = deepCloneTree(tree);

  if (insertAfterId !== null) {
    const loc = findLocation(cloned, insertAfterId);
    if (!loc) return tree;
    const node = { ...newNode, depth: loc.depth, position: loc.index + 1 };
    node.children = withDepth(node.children, loc.depth + 1);
    loc.siblings.splice(loc.index + 1, 0, node);
    reindexPositions(loc.siblings);
  } else {
    let target: OutlineTreeNode[];
    let depth: number;
    if (parentId === null) {
      target = cloned;
      depth = 0;
    } else {
      const loc = findLocation(cloned, parentId);
      if (loc) {
        target = loc.node.children;
        depth = loc.depth + 1;
      } else if (rootParentId !== undefined && parentId === rootParentId) {
        target = cloned;
        depth = tree[0]?.depth ?? 0;
      } else {
        return tree;
      }
    }
    const node = { ...newNode, depth, position: target.length };
    node.children = withDepth(node.children, depth + 1);
    target.push(node);
    reindexPositions(target);
  }
  return withDepth(cloned, 0);
}

/** Extract node from tree (remove it). Returns new tree and extracted node. */
export function extractNodeFromTree(
  tree: OutlineTreeNode[],
  id: string
): { tree: OutlineTreeNode[]; node: OutlineTreeNode | null } {
  const cloned = deepCloneTree(tree);
  const loc = findLocation(cloned, id);
  if (!loc) return { tree, node: null };
  const [node] = loc.siblings.splice(loc.index, 1);
  reindexPositions(loc.siblings);
  return { tree: withDepth(cloned, 0), node };
}

/** Indent: move node to become last child of previous sibling. */
export function indentNodeInTree(tree: OutlineTreeNode[], id: string): OutlineTreeNode[] | null {
  const loc = findLocation(tree, id);
  if (!loc || loc.index === 0) return null;
  const prevSibling = loc.siblings[loc.index - 1];
  const newParentId = prevSibling.id;
  const newPosition = prevSibling.children.length;
  return moveNodeInTree(tree, id, newParentId, newPosition);
}

/** Outdent: move node to become next sibling of parent. */
export function outdentNodeInTree(tree: OutlineTreeNode[], id: string): OutlineTreeNode[] | null {
  const loc = findLocation(tree, id);
  if (!loc || loc.node.parent_id === null) return null;
  const parentId = loc.node.parent_id;
  const parentLoc = findLocation(tree, parentId);
  if (!parentLoc) return null;
  const newParentId = parentLoc.node.parent_id;
  const newPosition = parentLoc.index + 1;
  return moveNodeInTree(tree, id, newParentId, newPosition);
}

/** Move node within tree. */
export function moveNodeInTree(
  tree: OutlineTreeNode[],
  id: string,
  newParentId: string | null,
  newPosition: number
): OutlineTreeNode[] {
  const { tree: without, node } = extractNodeFromTree(tree, id);
  if (!node) return tree;

  const cloned = deepCloneTree(without);
  let targetSiblings: OutlineTreeNode[];
  let targetDepth: number;

  if (newParentId === null) {
    targetSiblings = cloned;
    targetDepth = 0;
  } else {
    const parentLoc = findLocation(cloned, newParentId);
    if (!parentLoc) return tree;
    targetSiblings = parentLoc.node.children;
    targetDepth = parentLoc.depth + 1;
  }

  const n = { ...node, parent_id: newParentId, depth: targetDepth, position: newPosition };
  n.children = withDepth(n.children, targetDepth + 1);
  targetSiblings.splice(newPosition, 0, n);
  reindexPositions(targetSiblings);

  return withDepth(cloned, 0);
}

/** Remove node from tree. If removeChildren, deletes subtree; else reparents children. */
export function removeNodeFromTree(
  tree: OutlineTreeNode[],
  id: string,
  removeChildren: boolean
): OutlineTreeNode[] {
  const cloned = deepCloneTree(tree);
  const loc = findLocation(cloned, id);
  if (!loc) return tree;

  if (removeChildren) {
    loc.siblings.splice(loc.index, 1);
  } else {
    const node = loc.siblings[loc.index];
    const children = [...node.children];
    children.forEach((c, i) => {
      c.parent_id = node.parent_id;
      c.position = loc.index + i;
    });
    loc.siblings.splice(loc.index, 1, ...children);
  }
  reindexPositions(loc.siblings);
  return withDepth(cloned, 0);
}

/** Deep clone for baseline snapshot. */
export function cloneTree(tree: OutlineTreeNode[]): OutlineTreeNode[] {
  return deepCloneTree(tree);
}
