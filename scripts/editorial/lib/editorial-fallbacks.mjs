export function fillMissingEditorialTitle({result, movieId, source, safePublicSource}) {
  if (result.title?.trim()) return false;
  const performer = (source.actress ?? []).join('、').trim();
  const concept = safePublicSource.core_source_concept
    ?? safePublicSource.safe_title_signals?.find(({type, value}) => type !== 'performer' && value?.trim())?.value
    ?? '作品企劃解析';
  result.title = `${movieId}${performer ? ` ${performer}` : ''}｜${concept}`.slice(0, 90);
  return true;
}

export function ensureAllPerformersInTitle({value, movieId, performers, maximumLength}) {
  const names = [...new Set((performers ?? []).map((name) => name.trim()).filter(Boolean))];
  if (!names.length || names.every((name) => value.includes(name))) return value;
  let remainder = value.replace(movieId, '').trim();
  for (const name of names) remainder = remainder.replaceAll(name, '').trim();
  remainder = remainder.replace(/^[\s｜|：:、,—–-]+|[\s｜|：:、,—–-]+$/g, '');
  const identity = `${movieId} ${names.join('、')}`;
  return `${identity}${remainder ? `｜${remainder}` : ''}`.slice(0, maximumLength);
}
