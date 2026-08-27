export function alreadyPublishedRequestedIds(registry, requestedIds) {
  const registryById = new Map(registry.records.map((record) => [record.id.toUpperCase(), record]));
  return requestedIds.filter((id) => {
    const record = registryById.get(id.toUpperCase());
    return record && record.review_status !== 'draft';
  });
}

export function registryDraftIds(registry) {
  return new Set(registry.records
    .filter((record) => record.review_status === 'draft')
    .map((record) => record.id.toUpperCase()));
}
