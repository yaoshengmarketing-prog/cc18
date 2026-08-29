export const WORK_ROUTE_PREFIX = '/works/';

export const normalizeWorkSlug = (value) => {
  const slug = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new TypeError(`Invalid work slug or ID: ${value ?? ''}`);
  }
  return slug;
};

export const workPath = (value) => `${WORK_ROUTE_PREFIX}${normalizeWorkSlug(value)}/`;

export const workCanonicalUrl = (baseUrl, value) => new URL(workPath(value), baseUrl).href;

export const resolveInternalWorkHref = (canonicalUrl, value) => {
  try {
    const expectedPathname = workPath(value);
    const url = new URL(canonicalUrl);
    return url.pathname === expectedPathname ? expectedPathname : null;
  } catch {
    return null;
  }
};
