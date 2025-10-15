// nodeId.ts
// Deterministic, stable IDs for hierarchical nodes.
// No random. Works across runs and renders.

export type IdLike = string | number;

export interface IdSource {
  id?: IdLike;
  name?: string;
  parentId?: IdLike | null;
  path?: string; // optional explicit path like "root/Documents/Taxes"
}

/**
 * Fast 32 bit FNV-1a hash to base36 string
 */
export function hashToKey(input: string): string {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // FNV prime 16777619 with 32 bit overflow
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/**
 * Builds a stable key from parent and name or a provided path.
 * Use this when no explicit numeric or string id exists.
 */
export function buildStableKey(s: IdSource): string {
  const base =
    s.path ??
    `${s.parentId ?? 'root'}::${s.name ?? ''}`;
  return `n${hashToKey(base)}`;
}

/**
 * Get a deterministic id for any node-like object.
 * Priority:
 * 1. explicit id
 * 2. stable key from parentId + name or path
 */
export function getNodeId<T extends IdSource>(node: T): string {
  const raw = node?.id;
  if (raw !== undefined && raw !== null) return String(raw);
  return buildStableKey(node ?? {});
}

/**
 * Convenience helper to assert stable ids on arrays
 */
export function ensureIds<T extends IdSource>(items: T[]): (T & { id: string })[] {
  return items.map(it => ({
    ...it,
    id: getNodeId(it),
  }));
}
