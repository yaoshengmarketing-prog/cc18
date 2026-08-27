export function alreadyPublishedRequestedIds(registry, requestedIds) {
  const registryById = new Map(registry.records.map((record) => [record.id.toUpperCase(), record]));
  return requestedIds.filter((id) => {
    const record = registryById.get(id.toUpperCase());
    return record && record.review_status !== 'draft';
  });
}
