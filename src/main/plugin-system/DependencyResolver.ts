import type { PluginManifest } from "./PluginManifest";

export interface ResolveResult {
  loadOrder: string[];
  unresolvable: { pluginId: string; missingDeps: string[] }[];
  circularDeps: string[][];
}

export function resolveDependencies(
  manifests: Map<string, PluginManifest>,
  enabledPluginIds: Set<string>
): ResolveResult {
  const result: ResolveResult = { loadOrder: [], unresolvable: [], circularDeps: [] };

  const active = new Map<string, PluginManifest>();
  for (const [id, m] of manifests) {
    if (enabledPluginIds.has(id)) active.set(id, m);
  }

  for (const [id, m] of active) {
    const missing = (m.dependencies ?? []).filter((d) => !active.has(d));
    if (missing.length > 0) result.unresolvable.push({ pluginId: id, missingDeps: missing });
  }

  for (const u of result.unresolvable) active.delete(u.pluginId);

  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();
  for (const [id] of active) {
    inDegree.set(id, 0);
    adjList.set(id, []);
  }

  for (const [id, m] of active) {
    const deps = (m.dependencies ?? []).filter((d) => active.has(d));
    inDegree.set(id, deps.length);
    for (const d of deps) adjList.get(d)!.push(id);
  }

  const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const sorted: string[] = [];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    sorted.push(cur);
    for (const dep of adjList.get(cur) ?? []) {
      const d = inDegree.get(dep)! - 1;
      inDegree.set(dep, d);
      if (d === 0) queue.push(dep);
    }
  }

  if (sorted.length < active.size) {
    const inCycle = [...active.keys()].filter((id) => !sorted.includes(id));
    result.circularDeps.push(inCycle);
  }

  result.loadOrder = sorted;
  return result;
}
