const normalize = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();

const safeSourceTagSignals = new Map([
  ['角色扮演', {type: 'theme', value: '角色扮演'}],
  ['コスプレ', {type: 'theme', value: '角色扮演'}],
  ['辣妹', {type: 'presentation', value: '辣妹風格'}],
  ['ギャル', {type: 'presentation', value: '辣妹風格'}],
  ['独占配信', {type: 'presentation', value: '獨家配信'}],
  ['獨家配信', {type: 'presentation', value: '獨家配信'}],
  ['獨家限定', {type: 'presentation', value: '獨家配信'}],
  ['720p', {type: 'presentation', value: '高畫質'}],
  ['全高清 (fhd)', {type: 'presentation', value: '高畫質'}],
  ['fhd', {type: 'presentation', value: '高畫質'}],
  ['hd', {type: 'presentation', value: '高畫質'}],
  ['4k', {type: 'presentation', value: '高畫質'}],
  ['劇情', {type: 'theme', value: '劇情設定'}],
  ['ドラマ', {type: 'theme', value: '劇情設定'}],
  ['企劃片', {type: 'theme', value: '企劃片'}],
  ['美少女', {type: 'presentation', value: '美少女設定'}],
  ['學生妹', {type: 'setting', value: '學生設定'}],
  ['偶像‧藝人', {type: 'presentation', value: '偶像設定'}],
  ['偶像・藝人', {type: 'presentation', value: '偶像設定'}],
  ['空姐', {type: 'setting', value: '空服員設定'}],
  ['溫泉', {type: 'setting', value: '溫泉場景'}],
  ['紀錄片', {type: 'presentation', value: '紀錄片形式'}],
  ['自拍', {type: 'presentation', value: '自拍形式'}],
  ['素人', {type: 'presentation', value: '素人企劃'}],
  ['人妻', {type: 'character', value: '人妻設定'}],
  ['孕婦', {type: 'character', value: '孕婦設定'}],
]);

const classify = (value, rules, fallback) => {
  const text = normalize(value);
  return rules.find(({pattern}) => pattern.test(text))?.label ?? fallback;
};

const settingRules = [
  {pattern: /bedroom|bed|寢室|臥室|ベッド|寝室/, label: '臥室型室內場景'},
  {pattern: /studio|set|攝影棚|スタジオ/, label: '棚內場景'},
  {pattern: /office|workplace|辦公|職場|オフィス/, label: '職場型場景'},
  {pattern: /bath|shower|浴室|淋浴|風呂/, label: '浴室型場景'},
  {pattern: /outdoor|street|outside|戶外|街道|屋外/, label: '戶外場景'},
  {pattern: /room|indoor|室內|部屋|屋内/, label: '一般室內場景'},
];

const toneRules = [
  {pattern: /playful|teas|輕鬆|俏皮|からか/, label: '輕鬆互動'},
  {pattern: /warm|affection|gentle|溫和|親密|優し/, label: '溫和親近'},
  {pattern: /tense|intense|dramatic|緊張|強烈|張力/, label: '高張力互動'},
  {pattern: /energetic|active|活潑|主動|勢い/, label: '節奏鮮明'},
  {pattern: /conversation|dialogue|交談|對話|会話/, label: '對話導向'},
];

const cameraRules = [
  {pattern: /close|detail|特寫|近距離|アップ/, label: '近距離鏡位'},
  {pattern: /handheld|手持/, label: '手持鏡位'},
  {pattern: /static|locked|固定/, label: '固定鏡位'},
  {pattern: /wide|long shot|全景|遠景/, label: '全景鏡位'},
  {pattern: /medium|中景/, label: '中景鏡位'},
];

// Kept as an exported compatibility name; these are now editorial-only IDs.
export const safeCanonicalTagIds = ['story', 'contrast-charm', 'slow-burn', 'character-awakening', 'agency-shift', 'relationship-shift', 'everyday-intimacy', 'series-formula', 'high-story-density', 'showcase-format'];

const unsafeBriefPattern = /口交|顏射|亂交|性交|性愛|性器|性行為|陰道|陰莖|肛門|精液|射精|內射|勃起|乳交|乳頭|高潮|巨乳|美乳|胸部|手交|自慰|插入|抽插|肉棒|雞巴|小穴|玩具攻擊|\b\d+\s*p\b|\d+\s*發|\bsex\b|oral|anal|facial|ejaculat|orgasm|penetrat/i;

const safeBriefTheme = (value) => {
  const theme = String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 40);
  return theme && !unsafeBriefPattern.test(theme) ? theme : null;
};

// The local model may understand graphic source prose, but no generated sentence from
// that pass is trusted for external transmission. Rebuild a compact, deterministic
// abstraction from allowlisted themes and setting categories instead.
export function buildExternalCreativeBrief(localBrief, source = {}) {
  if (!localBrief) return null;
  const themes = [...new Set((localBrief.themes ?? []).map(safeBriefTheme).filter(Boolean))].slice(0, 4);
  const sourceConcepts = [...new Set((localBrief.search_concepts ?? []).map((value) => String(value ?? '').normalize('NFKC').trim()).filter((value) => {
    if (value.length < 2 || value.length > 30 || unsafeBriefPattern.test(value)) return false;
    return String(source.title ?? '').includes(value) || String(source.description ?? '').includes(value);
  }))].slice(0, 6).map((value) => ({
    value,
    source_field: String(source.title ?? '').includes(value) ? 'title' : 'description',
  }));
  return {
    core_source_concept: String(localBrief.core_source_concept ?? '').normalize('NFKC').trim().slice(0, 30),
    // An abstract local brief is not evidence of scenes, relationships or character arcs.
    premise: null,
    relationship: null,
    role_dynamic: null,
    central_tension: null,
    setting: null,
    themes,
    creative_seeds: [],
    evidence_scope: 'source_concepts 為來源摘錄；themes 只供組織文章，不證明作品情節。未確認的場景與人物關係保持未知。',
    source_concepts: sourceConcepts,
  };
}

export function buildSafeTitleSignals(source) {
  const signals = [];
  for (const performer of source.actress ?? []) {
    if (performer?.trim()) signals.push({type: 'performer', value: performer.trim(), source_field: 'actress'});
  }
  if (source.series?.trim()) signals.push({type: 'series', value: source.series.trim().slice(0, 30), source_field: 'series'});
  for (const tag of source.source_tags ?? []) {
    const mapped = safeSourceTagSignals.get(normalize(tag));
    if (mapped) signals.push({...mapped, source_field: 'safe_signals'});
  }
  return [...new Map(signals.map((signal) => [`${signal.type}:${signal.value}`, signal])).values()].slice(0, 8);
}

export function buildSafeVideoAnalysis(analysis) {
  return {
    duration_seconds: analysis.source_duration_seconds,
    sample_windows: analysis.coverage.sample_windows,
    average_confidence: analysis.coverage.average_confidence,
    observations: analysis.visual_observations.map((item) => ({
      i: item.sample_index,
      at: Math.round(item.source_start_seconds),
      setting: classify(item.setting, settingRules, '未分類場景'),
      tone: classify(item.interaction_tone, toneRules, '中性互動'),
      camera: [...new Set((item.camera_style ?? []).map((value) => classify(value, cameraRules, '一般鏡位')))].slice(0, 2),
    })),
  };
}

export function buildSafePublicSource(source, localCreativeBrief = null, taxonomy = null) {
  const externalBrief = buildExternalCreativeBrief(localCreativeBrief, source);
  const topicElements = taxonomy ? buildSourceTopicElements(source, taxonomy) : {};
  const signalTypeByGroup = {
    identity: 'identity', body: 'body_type', clothing: 'costume', relationship: 'relationship',
    setting: 'setting', action: 'act_or_position', presentation: 'presentation',
  };
  const topicSignals = Object.entries(topicElements).flatMap(([group, labels]) => labels.map((value) => ({
    type: signalTypeByGroup[group] ?? 'theme', value, source_field: 'safe_signals',
  })));
  const coreSignal = externalBrief?.core_source_concept
    ? [{type: 'theme', value: externalBrief.core_source_concept, source_field: 'safe_signals'}]
    : [];
  const safeTitleSignals = [...buildSafeTitleSignals(source), ...coreSignal, ...topicSignals, ...(externalBrief?.source_concepts ?? []).map((concept) => ({
    type: 'theme', value: concept.value, source_field: concept.source_field,
  }))];
  const uniqueSignals = [...new Map(safeTitleSignals.map((signal) => [`${signal.type}:${signal.value}`, signal])).values()].slice(0, 8);
  return {
    id: source.id,
    release_date: source.release_date,
    actress: source.actress ?? [],
    series: source.series ?? null,
    core_source_concept: externalBrief?.core_source_concept ?? null,
    safe_title_signals: uniqueSignals,
    topic_elements: topicElements,
    creative_seed_brief: externalBrief,
  };
}

export function buildSourceTopicElements(source, taxonomy) {
  const tagsById = new Map(taxonomy.tags.map((tag) => [tag.id, tag]));
  const normalizedMap = new Map(Object.entries(taxonomy.source_tag_map).map(([label, id]) => [normalize(label), id]));
  const grouped = Object.fromEntries(taxonomy.groups.filter(({origin}) => origin === 'source').map(({id}) => [id, []]));
  for (const rawLabel of source.source_tags ?? []) {
    const label = String(rawLabel).normalize('NFKC').trim();
    const id = normalizedMap.get(normalize(label));
    const group = tagsById.get(id)?.group;
    if (group && grouped[group] && !grouped[group].includes(label)) grouped[group].push(label);
  }
  return grouped;
}
