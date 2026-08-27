export function cycleArguments(argv) {
  const maxArgument = argv.find((value) => value.startsWith('--max='));
  const max = Number(maxArgument?.split('=')[1] ?? 3);
  if (!Number.isInteger(max) || max < 1 || max > 20) {
    throw new Error('--max must be an integer between 1 and 20');
  }
  return {max, withEditorial: argv.includes('--with-editorial')};
}

export function bridgeOutcome(output) {
  const events = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  const completed = events.find((event) => event.event === 'd1_job_completed');
  if (completed?.movie_id) return {status: 'completed', movieId: completed.movie_id};
  if (events.some((event) => event.event === 'd1_queue_empty')) return {status: 'empty', movieId: null};
  const failed = events.find((event) => event.event === 'd1_job_failed');
  return {status: 'failed', movieId: failed?.movie_id ?? null};
}

export function editorialTransmissionAllowed(environment = process.env) {
  return environment.CC18_ALLOW_EDITORIAL_TRANSMISSION === 'YES';
}

export function imageTransmissionAllowed(environment = process.env) {
  return environment.CC18_ALLOW_IMAGE_TRANSMISSION === 'YES';
}
