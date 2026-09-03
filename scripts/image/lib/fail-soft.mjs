export const INTERNAL_COVER_FALLBACK = '/images/movie-cover-fallback.svg';

const frontmatterCover = (markdown) => markdown
  .match(/^coverUrl:\s*(.+)$/m)?.[1]
  ?.trim()
  .replace(/^['"]|['"]$/g, '');

export const publicationCoverAfterImageFailure = ({reviewMarkdown, source}) => (
  frontmatterCover(reviewMarkdown)
  || (typeof source?.cover_source_url === 'string' && source.cover_source_url.trim())
  || INTERNAL_COVER_FALLBACK
);

export async function continuePublicationAfterImageFailure({store, claimed, workerId, error, retryAt}) {
  const outcome = claimed.attempt >= claimed.max_attempts ? 'failed' : 'retry';
  const publishJob = await store.enqueueJob({
    movieId: claimed.movie_id,
    stage: 'publish',
    priority: claimed.priority,
    discoveryRunId: claimed.discovery_run_id,
  });
  const imageJob = await store.finishJob({
    jobId: claimed.id,
    workerId,
    outcome,
    errorCode: error?.code ?? 'IMAGE_GENERATION_FAILED',
    retryAt: outcome === 'retry' ? retryAt : null,
  });
  return {imageJob, publishJob, outcome};
}
