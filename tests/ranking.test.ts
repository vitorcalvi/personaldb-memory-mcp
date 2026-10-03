import { describe, expect, it } from 'vitest';
import { rankingBoost } from '../src/ranking';

describe('ranking hooks', () => {
  it('boosts Ava title matches', () => expect(rankingBoost('business_knowledge','refund policy',{title:'Refund policy'})).toBeGreaterThan(1));
  it('uses My Thoughs importance without exploding score', () => expect(rankingBoost('memory','x',{importance:10,confidence:1})).toBeLessThan(1.3));
});
