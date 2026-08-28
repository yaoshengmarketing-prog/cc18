import {buildExternalCreativeBrief} from '../../editorial/lib/safe-editorial-payload.mjs';

const mature = (value) => String(value ?? '')
  .replace(/美少女|少女|學生妹|女學生/g, '成年女性')
  .replace(/校園型場景|教室/g, '成人進修教室')
  .slice(0, 60);

const unsafeArtworkConcept = /口交|顏射|亂交|性交|性愛|性器|性行為|陰道|陰莖|肛門|精液|射精|內射|勃起|乳交|乳頭|高潮|巨乳|美乳|胸部|手交|自慰|插入|抽插|肉棒|雞巴|小穴|玩具攻擊|\bsex\b|oral|anal|facial|ejaculat|orgasm|penetrat/i;
const visualSourceConcept = /美容院|沙龍|職場|辦公|溫泉|旅館|飯店|戶外|室內|攝影棚|棚內|空服員/;
const normalized = (value) => String(value ?? '').normalize('NFKC').trim().toLowerCase();

export function buildArtworkPrompts({source, localCreativeBrief}) {
  const safe = buildExternalCreativeBrief(localCreativeBrief, source) ?? {
    setting: '一般室內場景', themes: ['角色成長', '互動節奏', '關係轉折'], source_concepts: [],
  };
  const performerNames = new Set((source.actress ?? []).map(normalized));
  // Source concepts may contain performer aliases that differ from source.actress.
  // Only venue/setting concepts are eligible for visual prompts; abstract themes are
  // already rebuilt locally and remain the safe creative vocabulary.
  const sourceConcepts = safe.source_concepts.map(({value}) => mature(value)).filter((value) => visualSourceConcept.test(value));
  const concepts = [...sourceConcepts, ...safe.themes.map(mature)]
    .map((value) => value.trim())
    .filter((value) => value && !performerNames.has(normalized(value)) && !unsafeArtworkConcept.test(value))
    .slice(0, 4);
  const common = `Original cinematic editorial artwork inspired by ${concepts.join(', ')}. Setting: ${mature(safe.setting)}. Show fictional East Asian adults around age 28, fully clothed, with a clear sense of coaching, progression and changing confidence. Premium photorealistic editorial photography, realistic materials, sophisticated lighting. Original fictional people; no resemblance to performers; no text, logos or watermark.`;
  return {
    article_hero: `${common} Wide 16:9 environmental composition with two mature adults and clean negative space for a website headline.`,
    vertical_scene: `${common} Vertical 9:16 composition with one mature adult as the confident focal subject and a second adult guide in the background; room for animated captions.`,
  };
}
