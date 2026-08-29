export const CANONICAL_CATALOG_CODE_PATTERN = /^(?:[A-Z][A-Z0-9]*-[0-9]+|CC18-DEMO-[0-9]+)$/u;

export const validateCanonicalCatalogCode = (catalogCode, label = 'Movie') => {
  if (typeof catalogCode !== 'string' || !CANONICAL_CATALOG_CODE_PATTERN.test(catalogCode)) {
    throw new Error(`${label}: invalid canonical catalog code ${JSON.stringify(catalogCode)}`);
  }
  return catalogCode;
};

export const canonicalMovieMasterPath = (catalogCode, label = 'Movie') => (
  `data/movie-master/${validateCanonicalCatalogCode(catalogCode, label).toLowerCase()}.json`
);

export const validateCanonicalMovieIdentity = ({stableMovieId, catalogCode, label = 'Movie'}) => {
  validateCanonicalCatalogCode(catalogCode, label);
  const expectedStableMovieId = `cc18:${catalogCode}`;
  if (stableMovieId !== expectedStableMovieId) {
    throw new Error(`${label}: stable movie ID must equal ${expectedStableMovieId}`);
  }
  return {catalogCode, stableMovieId};
};

export const validateCanonicalMovieMasterIndexEntry = (
  entry,
  label = entry?.catalog_code ?? 'Movie Master index entry',
) => {
  const identity = validateCanonicalMovieIdentity({
    stableMovieId: entry?.stable_movie_id,
    catalogCode: entry?.catalog_code,
    label,
  });
  const expectedMasterPath = canonicalMovieMasterPath(identity.catalogCode, label);
  if (typeof entry?.master_path !== 'string' || entry.master_path !== expectedMasterPath) {
    throw new Error(`${label}: master path must equal ${expectedMasterPath} and must be a primitive string`);
  }
  return {...identity, masterPath: expectedMasterPath};
};

export const validateCanonicalMovieMasterIndexEntries = (entries) => {
  if (!Array.isArray(entries)) throw new Error('Movie Master index entries must be an array');
  const ids = new Set();
  const codes = new Set();
  const paths = new Set();
  for (const entry of entries) {
    const identity = validateCanonicalMovieMasterIndexEntry(entry);
    if (ids.has(identity.stableMovieId) || codes.has(identity.catalogCode) || paths.has(identity.masterPath)) {
      throw new Error(`Duplicate Movie Master index identity: ${identity.stableMovieId} / ${identity.masterPath}`);
    }
    ids.add(identity.stableMovieId);
    codes.add(identity.catalogCode);
    paths.add(identity.masterPath);
  }
  return entries;
};

export const validateMovieMasterAgainstIndexEntry = (entry, master) => {
  const entryIdentity = validateCanonicalMovieMasterIndexEntry(entry);
  const masterIdentity = validateCanonicalMovieIdentity({
    stableMovieId: master?.stable_movie_id,
    catalogCode: master?.source?.catalog_code,
    label: `${entryIdentity.catalogCode} Movie Master`,
  });
  if (masterIdentity.stableMovieId !== entryIdentity.stableMovieId
    || masterIdentity.catalogCode !== entryIdentity.catalogCode) {
    throw new Error(`${entryIdentity.catalogCode} Movie Master: identity does not match its index entry`);
  }
  return entryIdentity;
};
