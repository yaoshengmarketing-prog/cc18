export function safeUrlShape(value) {
  try {
    const url = new URL(value);
    const leaf = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
    const extension = leaf.includes('.') ? leaf.split('.').at(-1).toLowerCase() : null;
    return {
      origin: url.origin,
      path_kind: extension ? `*.${extension}` : 'extensionless',
      has_query: Boolean(url.search),
    };
  } catch {
    return {invalid_url: true};
  }
}

function redactText(value) {
  return String(value)
    .replace(/https:\/\/[^\s"']+/gi, (match) => {
      try {
        const url = new URL(match);
        return `${url.origin}${url.pathname}${url.search ? '?[redacted]' : ''}`;
      } catch {
        return '[redacted-url]';
      }
    })
    .replace(/(cookie|authorization|token|signature)=?[^\s,;]*/gi, '$1=[redacted]');
}

export function bridgeLog(event, fields = {}) {
  const safe = Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => !/cookie|token|signature|manifest_url|authorization/i.test(key))
      .map(([key, value]) => [key, typeof value === 'string' ? redactText(value) : value]),
  );
  process.stdout.write(`${JSON.stringify({at: new Date().toISOString(), event, ...safe})}\n`);
}
