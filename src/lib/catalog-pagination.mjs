export const CATALOG_PAGE_SIZE = 18;
/** @template T @param {T[]} cards */
export function catalogPages(cards) {
  const total = Math.max(1, Math.ceil(cards.length / CATALOG_PAGE_SIZE));
  return Array.from({length: total}, (_, index) => ({
    current: index + 1, total,
    cards: cards.slice(index * CATALOG_PAGE_SIZE, (index + 1) * CATALOG_PAGE_SIZE),
  }));
}
