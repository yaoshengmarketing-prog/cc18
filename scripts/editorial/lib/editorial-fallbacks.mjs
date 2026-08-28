export function fillMissingEditorialTitle({result, movieId, source, safePublicSource}) {
  if (result.title?.trim()) return false;
  const performer = (source.actress ?? []).join('、').trim();
  const concept = safePublicSource.core_source_concept
    ?? safePublicSource.safe_title_signals?.find(({type, value}) => type !== 'performer' && value?.trim())?.value
    ?? '作品企劃解析';
  result.title = `${movieId}${performer ? ` ${performer}` : ''}｜${concept}`.slice(0, 90);
  return true;
}
