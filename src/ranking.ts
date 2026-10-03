export function rankingBoost(
  type: string,
  query: string,
  metadata: Record<string, unknown>,
): number {
  if (type === 'memory') {
    const importance = typeof metadata.importance === 'number' ? metadata.importance : 5;
    const confidence = typeof metadata.confidence === 'number' ? metadata.confidence : 1;
    return Math.max(0.7, 1 + (Math.min(10, Math.max(1, importance)) - 5) * 0.03) * Math.max(0.8, Math.min(1, confidence));
  }
  if (type === 'business_knowledge') {
    const title = typeof metadata.title === 'string' ? metadata.title.toLowerCase() : '';
    const tokens = query.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((x) => x.length >= 2);
    return tokens.some((token) => title.includes(token)) ? 1.15 : 1;
  }
  return 1;
}
