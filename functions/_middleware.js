import { PUBLIC_SITE_ORIGIN } from '../src/lib/site-origin.mjs';

const primaryHostname = new URL(PUBLIC_SITE_ORIGIN).hostname;

export async function onRequest(context) {
  const response = await context.next();
  const hostname = new URL(context.request.url).hostname;
  if (hostname === primaryHostname) return response;

  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
