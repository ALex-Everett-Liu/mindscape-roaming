/**
 * Tree manipulation with path-copying (structural sharing).
 * Only the path from root to the modified node is cloned — O(depth) per op.
 * Move also clones the moved subtree O(m) to update depths; typical single-node move is O(depth).
 * Unchanged subtrees are shared by reference. Scales to 100k+ nodes.
 */
import type { OutlineTreeNode } from "../../shared/types";

type Loc = { node: OutlineTreeNode; siblings: OutlineTreeNode[]; index: number; depth: number };

function findLocation(
  nodes: OutlineTreeNode[],
  id: string,
  siblings: OutlineTreeNode[],
  depth: number
): Loc | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { node: nodes[i], siblings, index: i, depth };
    const found = findLocation(nodes[i].children, id, nodes[i].children, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Clone only the path from root to targetId. Returns new root and the location
 * in the cloned tree. Unchanged branches are shared. O(depth).
 */
function copyPathTo(
  nodes: OutlineTreeNode[],
  targetId: string,
  depth: number
): { root: OutlineTreeNode[]; loc: Loc } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) {
      const newSiblings = nodes.slice();
      newSiblings[i] = { ...nodes[i], depth, children: nodes[i].children };
      return { root: newSiblings, loc: { node: newSiblings[i], siblings: newSiblings, index: i, depth } };
    }
    const found = copyPathTo(nodes[i].children, targetId, depth + 1);
    if (found) {
      const newChild = { ...nodes[i], children: found.root };
      const newSiblings = nodes.slice();
      newSiblings[i] = newChild;
      return { root: newSiblings, loc: found.loc };
    }
  }
  return null;
}

/**
 * Clone path to the parent of targetId, or clone root if targetId is at root.
 * Used when we need the siblings array containing targetId.
 */
function copyPathToParentOf(
  nodes: OutlineTreeNode[],
  targetId: string,
  depth: number
): { root: OutlineTreeNode[]; siblings: OutlineTreeNode[]; index: number; depth: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) {
      const newSiblings = nodes.slice();
      newSiblings[i] = { ...nodes[i], depth, children: nodes[i].children };
      return { root: newSiblings, siblings: newSiblings, index: i, depth };
    }
    const found = copyPathToParentOf(nodes[i].children, targetId, depth + 1);
    if (found) {
      const newChild = { ...nodes[i], children: found.root };
      const newSiblings = nodes.slice();
      newSiblings[i] = newChild;
      return { root: newSiblings, siblings: found.siblings, index: found.index, depth: found.depth };
    }
  }
  return null;
}

function reindexPositions(children: OutlineTreeNode[]): void {
  for (let i = 0; i < children.length; i++) {
    children[i].position = i;
  }
}

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

/** Add node. Path-copy to insertion point only. O(depth). */
export function addNodeToTree(
  tree: OutlineTreeNode[],
  newNode: OutlineTreeNode,
  parentId: string | null,
  insertAfterId: string | null,
  rootParentId?: string | null
): OutlineTreeNode[] {
  if (insertAfterId !== null) {
    const found = copyPathToParentOf(tree, insertAfterId, 0);
    if (!found) return tree;
    const { siblings, index, depth } = found;
    const node = { ...newNode, depth, position: index + 1 };
    node.children = [];
    siblings.splice(index + 1, 0, node);
    reindexPositions(siblings);
    return found.root;
  }

  if (parentId === null || (rootParentId !== undefined && parentId === rootParentId)) {
    const newRoot = tree.slice();
    const depth = tree[0]?.depth ?? 0;
    const node = { ...newNode, depth, position: newRoot.length };
    node.children = [];
    newRoot.push(node);
    reindexPositions(newRoot);
    return newRoot;
  }

  const found = copyPathTo(tree, parentId, 0);
  if (!found) return tree;
  const parent = found.loc.node;
  const depth = found.loc.depth + 1;
  const children = parent.children.slice();
  const node = { ...newNode, depth, position: children.length };
  node.children = [];
  children.push(node);
  reindexPositions(children);
  found.loc.siblings[found.loc.index] = { ...parent, children };
  return found.root;
}

function cloneSubtree(n: OutlineTreeNode, depth: number): OutlineTreeNode {
  return { ...n, depth, children: n.children.map((c) => cloneSubtree(c, depth + 1)) };
}

/** Extract node (remove from tree). Path-copy O(depth). Returns cloned node (O(subtree)) so we can mutate depths. */
export function extractNodeFromTree(
  tree: OutlineTreeNode[],
  id: string
): { tree: OutlineTreeNode[]; node: OutlineTreeNode | null } {
  const found = copyPathToParentOf(tree, id, 0);
  if (!found) return { tree, node: null };
  const [raw] = found.siblings.splice(found.index, 1);
  reindexPositions(found.siblings);
  return { tree: found.root, node: cloneSubtree(raw, raw.depth) };
}

/** Move node. Path-copy to source and destination. O(depth). */
export function moveNodeInTree(
  tree: OutlineTreeNode[],
  id: string,
  newParentId: string | null,
  newPosition: number
): OutlineTreeNode[] {
  const { tree: without, node } = extractNodeFromTree(tree, id);
  if (!node) return tree;

  node.parent_id = newParentId;
  node.position = newPosition;

  if (newParentId === null) {
    const newRoot = without.slice();
    node.depth = 0;
    for (const c of node.children) c.depth = 1;
    newRoot.splice(newPosition, 0, node);
    reindexPositions(newRoot);
    return newRoot;
  }

  const found = copyPathTo(without, newParentId, 0);
  if (!found) return tree;
  const parentLoc = findLocation(found.root, newParentId, found.root, 0);
  if (!parentLoc) return tree;
  const targetDepth = parentLoc.depth + 1;
  node.depth = targetDepth;
  const updateChildrenDepth = (nodes: OutlineTreeNode[], d: number) => {
    for (const c of nodes) {
      c.depth = d;
      if (c.children.length) updateChildrenDepth(c.children, d + 1);
    }
  };
  updateChildrenDepth(node.children, targetDepth + 1);
  const children = parentLoc.node.children.slice();
  children.splice(newPosition, 0, node);
  reindexPositions(children);
  parentLoc.siblings[parentLoc.index] = { ...parentLoc.node, children };
  return found.root;
}

/** Remove node. Path-copy only. O(depth). */
export function removeNodeFromTree(
  tree: OutlineTreeNode[],
  id: string,
  removeChildren: boolean
): OutlineTreeNode[] {
  const found = copyPathToParentOf(tree, id, 0);
  if (!found) return tree;

  const { siblings, index } = found;
  const node = siblings[index];

  if (removeChildren) {
    siblings.splice(index, 1);
  } else {
    const children = node.children.slice();
    const parentId = node.parent_id;
    const basePos = node.position;
    for (let i = 0; i < children.length; i++) {
      children[i].parent_id = parentId;
      children[i].position = basePos + i;
    }
    siblings.splice(index, 1, ...children);
  }
  reindexPositions(siblings);
  return found.root;
}

/**
 * Full deep clone. Use only when necessary (baseline snapshot, discard restore).
 * O(n) — avoid in hot paths.
 */
export function cloneTree(tree: OutlineTreeNode[]): OutlineTreeNode[] {
  return tree.map((n) => ({
    ...n,
    children: cloneTree(n.children),
  }));
}
