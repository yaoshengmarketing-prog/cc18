import {buildExternalCreativeBrief} from '../../editorial/lib/safe-editorial-payload.mjs';

const mature = (value) => String(value ?? '')
  .replace(/美少女|少女|學生妹|女學生/g, '成年女性')
  .replace(/校園型場景|教室/g, '成人進修教室')
  .slice(0, 60);

export function buildArtworkPrompts({source, localCreativeBrief}) {
  const safe = buildExternalCreativeBrief(localCreativeBrief, source) ?? {
    setting: '一般室內場景', themes: ['角色成長', '互動節奏', '關係轉折'], source_concepts: [],
  };
  const concepts = [...safe.source_concepts.map(({value}) => mature(value)), ...safe.themes.map(mature)].filter(Boolean).slice(0, 4);
  const common = `Original cinematic editorial artwork inspired by ${concepts.join(', ')}. Setting: ${mature(safe.setting)}. Show fictional East Asian adults around age 28, fully clothed, with a clear sense of coaching, progression and changing confidence. Premium photorealistic editorial photography, realistic materials, sophisticated lighting. Original fictional people; no resemblance to performers; no text, logos or watermark.`;
  return {
    article_hero: `${common} Wide 16:9 environmental composition with two mature adults and clean negative space for a website headline.`,
    vertical_scene: `${common} Vertical 9:16 composition with one mature adult as the confident focal subject and a second adult guide in the background; room for animated captions.`,
  };
}
