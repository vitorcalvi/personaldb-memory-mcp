import { describe, expect, it } from 'vitest';
import { weightedRrf } from '../src/rrf';

describe('weightedRrf', () => {
  it('fuses lexical and vector ranks deterministically', () => {
    const out = weightedRrf(['a','b'], ['b','c'], 60);
    expect(out[0]?.id).toBe('b');
    expect(out.find((x) => x.id === 'a')?.lexicalRank).toBe(1);
    expect(out.find((x) => x.id === 'c')?.vectorRank).toBe(2);
  });
  it('degrades to lexical-only', () => expect(weightedRrf(['a'], [], 60).map(x => x.id)).toEqual(['a']));
  it('degrades to vector-only', () => expect(weightedRrf([], ['v'], 60).map(x => x.id)).toEqual(['v']));
});
