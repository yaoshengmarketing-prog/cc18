import { PUBLIC_SITE_ORIGIN } from '../src/lib/site-origin.mjs';
import {excludedIds} from './exclusion-ids.js';

const primaryHostname = new URL(PUBLIC_SITE_ORIGIN).hostname;

export async function onRequest(context) {
  const requestUrl = new URL(context.request.url);
  const hostname = requestUrl.hostname;
  const work = /^\/works\/([a-z0-9]+(?:-[a-z0-9]+)+)\/?$/iu.exec(requestUrl.pathname);
  const media = /^\/media\/works\/\d{4}\/\d{2}\/([a-z0-9]+(?:-[a-z0-9]+)+)\//iu.exec(requestUrl.pathname);
  if (excludedIds.has((work?.[1] ?? media?.[1] ?? '').toUpperCase())) {
    return new Response('Gone', {status: 410, headers: {'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store'}});
  }
  if (hostname === 'cc18.pages.dev' && !requestUrl.pathname.startsWith('/media/')) {
    requestUrl.protocol = 'https:';
    requestUrl.hostname = primaryHostname;
    return Response.redirect(requestUrl, 301);
  }
  const response = await context.next();
  if (hostname === primaryHostname) return response;

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
