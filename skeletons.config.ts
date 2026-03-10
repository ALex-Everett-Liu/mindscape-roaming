/**
 * App Skeletons — defines which built-in plugins are in each profile.
 * Build-time: SKELETON env selects one. Runtime: user can switch via Settings.
 */
export type SkeletonId = "minimal" | "standard" | "full";

const MINIMAL_PLUGINS = [
  "core-node-ops",
  "core-tree-view",
  "core-editor",
  "core-theme",
  "core-settings",
];

export const SKELETONS: Record<SkeletonId, string[]> = {
  minimal: [...MINIMAL_PLUGINS],
  standard: [
    ...MINIMAL_PLUGINS,
    "core-keyboard",
    "core-toolbar",
    "core-search",
    "core-undo-redo",
  ],
  full: [
    ...MINIMAL_PLUGINS,
    "core-keyboard",
    "core-toolbar",
    "core-search",
    "core-undo-redo",
    "core-fts-search",
    "core-drag-drop",
    "core-breadcrumb",
    "core-zoom",
    "core-context-menu",
  ],
};

export const DEFAULT_SKELETON: SkeletonId = "standard";

export function getPluginsForSkeleton(skeleton: SkeletonId): string[] {
  return [...SKELETONS[skeleton]];
}

export function getBuildSkeleton(): SkeletonId {
  const env = (typeof process !== "undefined"
    ? (process as NodeJS.Process).env?.SKELETON
    : undefined) as SkeletonId | undefined;
  if (env && SKELETONS[env]) return env;
  return DEFAULT_SKELETON;
}
