const normalize = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();

const safeSourceTagSignals = new Map([
  ['角色扮演', {type: 'theme', value: '角色扮演'}],
  ['コスプレ', {type: 'theme', value: '角色扮演'}],
  ['辣妹', {type: 'presentation', value: '辣妹風格'}],
  ['ギャル', {type: 'presentation', value: '辣妹風格'}],
  ['独占配信', {type: 'presentation', value: '獨家配信'}],
  ['獨家配信', {type: 'presentation', value: '獨家配信'}],
  ['720p', {type: 'presentation', value: '高畫質'}],
  ['hd', {type: 'presentation', value: '高畫質'}],
  ['4k', {type: 'presentation', value: '高畫質'}],
  ['劇情', {type: 'theme', value: '劇情設定'}],
  ['ドラマ', {type: 'theme', value: '劇情設定'}],
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

export const safeCanonicalTagIds = ['story', 'close-perspective', 'asmr', 'contrast-charm', 'kissing', 'active-female'];

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

export function buildSafePublicSource(source, localCreativeBrief = null) {
  const safeTitleSignals = buildSafeTitleSignals(source);
  if (safeTitleSignals.length < 2) {
    throw Object.assign(new Error(`${source.id}: fewer than two safe source-grounded title signals`), {code: 'EDITORIAL_SAFE_SIGNALS_INSUFFICIENT'});
  }
  return {
    id: source.id,
    release_date: source.release_date,
    actress: source.actress ?? [],
    series: source.series ?? null,
    safe_title_signals: safeTitleSignals,
    creative_seed_brief: localCreativeBrief,
  };
}
