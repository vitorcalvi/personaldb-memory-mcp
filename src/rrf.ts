export interface RankedListItem { id: string; rank: number }
export interface FusedRank { id: string; score: number; lexicalRank?: number; vectorRank?: number }

export function weightedRrf(
  lexical: string[],
  vector: string[],
  k = 60,
  lexicalWeight = 1,
  vectorWeight = 1,
): FusedRank[] {
  const map = new Map<string, FusedRank>();
  lexical.forEach((id, index) => {
    const rank = index + 1;
    const item = map.get(id) ?? { id, score: 0 };
    item.score += lexicalWeight / (k + rank);
    item.lexicalRank = rank;
    map.set(id, item);
  });
  vector.forEach((id, index) => {
    const rank = index + 1;
    const item = map.get(id) ?? { id, score: 0 };
    item.score += vectorWeight / (k + rank);
    item.vectorRank = rank;
    map.set(id, item);
  });
  return [...map.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
