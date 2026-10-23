import { describe, it, expect } from 'vitest';
import { shortNodeRef, fieldViewHash, parseFieldViewHash, findNodeByShortRef } from './nodeRef';

describe('shortNodeRef', () => {
  it('is stable for the same id and strips non-alphanumeric characters', () => {
    const id = 'a1b2c3d4-e5f6-4711-8899-aabbccddeeff';
    const ref = shortNodeRef(id);
    expect(ref).toBe(shortNodeRef(id));
    expect(ref).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('is derived from the id, so two different ids very rarely collide', () => {
    expect(shortNodeRef('id-one-11112222')).not.toBe(shortNodeRef('id-two-33334444'));
  });
});

describe('fieldViewHash / parseFieldViewHash round-trip', () => {
  it('parses back the same ref that was encoded', () => {
    const id = 'node-abcdef1234567890';
    const hash = fieldViewHash(id);
    expect(hash).toMatch(/^#field\//);
    expect(parseFieldViewHash(hash)).toBe(shortNodeRef(id));
  });

  it('returns null for a hash with a different prefix', () => {
    expect(parseFieldViewHash('#oneline/ABC12345')).toBeNull();
    expect(parseFieldViewHash('')).toBeNull();
  });
});

describe('findNodeByShortRef', () => {
  const nodes = [{ id: 'node-aaaaaaaa1111' }, { id: 'node-bbbbbbbb2222' }];

  it('finds the node whose id maps to the given ref, case-insensitively', () => {
    const ref = shortNodeRef(nodes[1].id);
    expect(findNodeByShortRef(nodes, ref)).toBe(nodes[1]);
    expect(findNodeByShortRef(nodes, ref.toLowerCase())).toBe(nodes[1]);
  });

  it('returns undefined when nothing matches', () => {
    expect(findNodeByShortRef(nodes, 'ZZZZZZZZ')).toBeUndefined();
  });
});
