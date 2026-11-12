export function alreadyPublishedRequestedIds(registry, requestedIds) {
  const registryById = new Map(registry.records.map((record) => [record.id.toUpperCase(), record]));
  return requestedIds.filter((id) => {
    const record = registryById.get(id.toUpperCase());
    return record && record.review_status !== 'draft';
  });
}

export function isCompletedPublishedWork({registryRecord, editorialJob, publishJob}) {
  return registryRecord?.review_status === 'published'
    && editorialJob?.status === 'completed'
    && publishJob?.status === 'completed';
}

export function registryDraftIds(registry) {
  return new Set(registry.records
    .filter((record) => record.review_status === 'draft')
    .map((record) => record.id.toUpperCase()));
}

// Discovery only creates editorial jobs for eligible works. A later listing
// observation may classify the same work as late_arrival as its release ages.
// Preserve that already-admitted job, without admitting newly found history.
export function isAdmittedCanaryWork({movie, editorialJob}) {
  return movie?.metadata_status === 'validated'
    && (movie.classification === 'eligible'
      || (movie.classification === 'late_arrival' && Boolean(editorialJob?.discovery_run_id)));
}

export function isNonBlockingVideoOutcome({stage, status}) {
  return stage === 'video' && ['retry', 'failed'].includes(status);
}

export function isNonBlockingMediaOutcome({stage, status}) {
  return ['image', 'video'].includes(stage) && ['retry', 'failed'].includes(status);
}

export function classifyCanaryStageOutcome({stage, required, exitCode, job}) {
  if (exitCode === 0 && job?.status === 'completed') {
    return {continuePipeline: true, reportStatus: 'completed'};
  }
  if (!required && isNonBlockingMediaOutcome({stage, status: job?.status})) {
    return {continuePipeline: true, reportStatus: `${job.status}_non_blocking`};
  }
  return {continuePipeline: false, reportStatus: job?.status ?? 'missing'};
}
