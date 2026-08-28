import payload from '../../data/search-index-v1.json';

export const prerender = true;

export function GET() {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-robots-tag': 'noindex',
    },
  });
}
