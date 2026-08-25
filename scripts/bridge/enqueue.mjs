import {loadBridgeConfig, assertAllowedUrl} from './lib/config.mjs';
import {enqueue} from './lib/queue.mjs';

const [movieId, sourceUrl] = process.argv.slice(2);
if (!movieId || !sourceUrl) throw new Error('Usage: node scripts/bridge/enqueue.mjs <MOVIE_ID> <CC18_SOURCE_URL>');
if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(movieId)) throw new Error(`Invalid movie ID: ${movieId}`);
const config = await loadBridgeConfig();
assertAllowedUrl(sourceUrl, config.security.allowed_source_hosts, {requireHttps: config.security.require_https});
const job = await enqueue(config.queue_file, {movie_id: movieId, source_url: sourceUrl});
console.log(JSON.stringify({job_id: job.job_id, movie_id: job.movie_id, status: job.status}, null, 2));
