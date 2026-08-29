import {parsePerformerStableId} from './performer-url.mjs';

const RECORD_STATUSES = new Set([
  'VERIFIED_TW_MARKET', 'VERIFIED_ORTHOGRAPHIC', 'SOURCE_NAME_UNCHANGED',
  'SOURCE_TITLE_ALIAS_ONLY', 'SOURCE_ATTESTED', 'UNVERIFIED',
]);
const ALIAS_TYPES = new Set([
  'SOURCE_TITLE_ALIAS', 'OFFICIAL_JA_NAME', 'VERIFIED_TW_MARKET_NAME',
  'VERIFIED_FORMER_STAGE_NAME',
]);
const text = (value, label, {nullable = false} = {}) => {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string${nullable ? ' or null' : ''}`);
  return value.trim();
};
const equivalentName = (left, right) => (
  typeof left === 'string' && typeof right === 'string' && left.normalize('NFKC') === right.normalize('NFKC')
);

export const validatePerformerLocalizationRecord = (record) => {
  const id = record?.source_actor_id;
  parsePerformerStableId(id);
  const sourceName = text(record.source_name, `${id} source_name`);
  const nameJa = text(record.name_ja, `${id} name_ja`, {nullable: true});
  const displayNameZhTw = text(record.display_name_zh_tw, `${id} display_name_zh_tw`, {nullable: true});
  if (!RECORD_STATUSES.has(record.verification_status)) throw new Error(`${id}: unsupported verification status`);
  if (displayNameZhTw !== null && !['VERIFIED_TW_MARKET', 'VERIFIED_ORTHOGRAPHIC'].includes(record.verification_status)) {
    throw new Error(`${id}: display_name_zh_tw is not backed by an approved verification status`);
  }
  if (!Array.isArray(record.source_references) || record.source_references.length === 0) {
    throw new Error(`${id}: source_references must be a non-empty array`);
  }
  if (!Array.isArray(record.aliases)) throw new Error(`${id}: aliases must be an array`);
  const aliasNames = new Map();
  const baseNames = [
    ['source_name', sourceName],
    ['name_ja', nameJa],
    ['display_name_zh_tw', displayNameZhTw],
  ].filter(([, value]) => value !== null);
  const aliases = record.aliases.map((alias) => {
    const name = text(alias?.name, `${id} alias name`);
    const type = text(alias?.type, `${id} alias type`);
    if (!ALIAS_TYPES.has(type)) throw new Error(`${id}: unknown alias type ${type}`);
    const normalizedAlias = name.normalize('NFKC');
    if (aliasNames.has(normalizedAlias)) throw new Error(`${id}: duplicate or NFKC-conflicting alias ${name}`);
    aliasNames.set(normalizedAlias, type);
    if (typeof alias.searchable !== 'boolean') throw new Error(`${id}: alias ${name} requires boolean searchable`);
    const displayAsPrimary = alias.display_as_primary ?? false;
    if (typeof displayAsPrimary !== 'boolean') throw new Error(`${id}: alias ${name} has invalid display_as_primary`);
    if (displayAsPrimary === true) throw new Error(`${id}: alias ${name} cannot be a primary display name`);
    const allowedBaseMirror = (type === 'OFFICIAL_JA_NAME' && equivalentName(name, nameJa))
      || (type === 'VERIFIED_TW_MARKET_NAME' && equivalentName(name, displayNameZhTw));
    for (const [field, baseName] of baseNames) {
      if (!equivalentName(name, baseName)) continue;
      if (!allowedBaseMirror) throw new Error(`${id}: alias ${name} conflicts with ${field}`);
    }
    let schemaEligible = false;
    if (type === 'SOURCE_TITLE_ALIAS') {
      if (alias.verification_status !== 'SOURCE_ATTESTED' || alias.searchable !== true
        || !Array.isArray(alias.source_references)
        || alias.source_references.length === 0
        || alias.source_references.some((ref) => typeof ref !== 'string' || ref.trim() === '')) {
        throw new Error(`${id}: source-title alias requires attested, searchable, non-primary provenance`);
      }
    } else if (type === 'OFFICIAL_JA_NAME') {
      if (!['VERIFIED_ORTHOGRAPHIC', 'VERIFIED_TW_MARKET'].includes(alias.verification_status)) {
        throw new Error(`${id}: OFFICIAL_JA_NAME requires an approved verification status`);
      }
      schemaEligible = true;
    } else if (type === 'VERIFIED_TW_MARKET_NAME') {
      if (alias.verification_status !== 'VERIFIED_TW_MARKET') {
        throw new Error(`${id}: VERIFIED_TW_MARKET_NAME requires VERIFIED_TW_MARKET`);
      }
      schemaEligible = true;
    } else if (type === 'VERIFIED_FORMER_STAGE_NAME') {
      if (alias.verification_status !== 'VERIFIED_TW_MARKET' || alias.searchable !== true) {
        throw new Error(`${id}: former stage name must remain searchable and non-primary`);
      }
    }
    return {...alias, name, type, display_as_primary: displayAsPrimary, schema_eligible: schemaEligible};
  });
  const primaryDisplayName = displayNameZhTw ?? nameJa ?? sourceName;
  const schemaNames = [];
  const addSchemaName = (name) => {
    if (name && name !== primaryDisplayName && !schemaNames.includes(name)) schemaNames.push(name);
  };
  addSchemaName(nameJa);
  addSchemaName(sourceName);
  for (const alias of aliases) if (alias.schema_eligible) addSchemaName(alias.name);
  return {
    ...record,
    source_name: sourceName,
    name_ja: nameJa,
    display_name_zh_tw: displayNameZhTw,
    aliases,
    primary_display_name: primaryDisplayName,
    schema_alternate_names: schemaNames,
  };
};

export const buildPerformerLocalizationMap = (localization) => {
  if (!Array.isArray(localization?.performers)) throw new Error('Performer localization performers must be an array');
  const result = new Map();
  for (const raw of localization.performers) {
    const record = validatePerformerLocalizationRecord(raw);
    if (result.has(record.source_actor_id)) throw new Error(`Duplicate performer source actor ID: ${record.source_actor_id}`);
    result.set(record.source_actor_id, record);
  }
  return result;
};
