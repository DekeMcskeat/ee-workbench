/**
 * Short, stable, human-copyable reference for a node — derived from its
 * (already unique, already stable) id rather than a new stored field, so
 * no schema/migration is needed. Used for the Field view's "jump to this
 * node" deep link, which is plain text you could hand-type, paste, or
 * encode into a QR code externally (this app doesn't generate the QR
 * image itself — see README "Next steps").
 *
 * Scope note: the hash link only encodes the node, not its project, so
 * "jump to" resolves against whichever project is currently loaded in the
 * browser tab — consistent with this app's single-browser, no-sync
 * persistence model (see README "Known gaps").
 */
const HASH_PREFIX = '#field/';

export function shortNodeRef(nodeId: string): string {
  return nodeId.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase();
}

export function fieldViewHash(nodeId: string): string {
  return `${HASH_PREFIX}${shortNodeRef(nodeId)}`;
}

export function fieldViewLink(nodeId: string): string {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin + window.location.pathname : '';
  return `${origin}${fieldViewHash(nodeId)}`;
}

export function parseFieldViewHash(hash: string): string | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const ref = hash.slice(HASH_PREFIX.length).trim();
  return ref.length > 0 ? ref.toUpperCase() : null;
}

export function findNodeByShortRef<T extends { id: string }>(nodes: T[], ref: string): T | undefined {
  const norm = ref.trim().toUpperCase();
  return nodes.find(n => shortNodeRef(n.id) === norm);
}
