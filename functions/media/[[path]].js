const ALLOWED_MEDIA_KEY = /^works\/\d{4}\/\d{2}\/[A-Z0-9-]+\/(?:vertical-v\d+\.mp4|hero-v\d+\.(?:png|webp|jpe?g)|scene-vertical-v\d+\.(?:png|webp|jpe?g))$/;

const mediaKey = (context) => {
  const value = context.params.path;
  return Array.isArray(value) ? value.join('/') : value;
};

const baseHeaders = (object) => {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return headers;
};

export async function onRequestGet(context) {
  const key = mediaKey(context);
  if (!key || !ALLOWED_MEDIA_KEY.test(key)) return new Response('Not found', {status: 404});

  try {
    const object = await context.env.MEDIA.get(key, {range: context.request.headers});
    if (!object) return new Response('Not found', {status: 404});

    const headers = baseHeaders(object);
    if (object.range) {
      const offset = object.range.offset ?? 0;
      const length = object.range.length ?? object.size;
      headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set('content-length', String(length));
      return new Response(object.body, {status: 206, headers});
    }

    headers.set('content-length', String(object.size));
    return new Response(object.body, {status: 200, headers});
  } catch {
    return new Response('Range not satisfiable', {
      status: 416,
      headers: {'accept-ranges': 'bytes', 'cache-control': 'no-store'},
    });
  }
}

export async function onRequestHead(context) {
  const key = mediaKey(context);
  if (!key || !ALLOWED_MEDIA_KEY.test(key)) return new Response(null, {status: 404});
  const object = await context.env.MEDIA.head(key);
  if (!object) return new Response(null, {status: 404});
  const headers = baseHeaders(object);
  headers.set('content-length', String(object.size));
  return new Response(null, {status: 200, headers});
}
