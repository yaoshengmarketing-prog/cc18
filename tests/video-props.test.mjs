import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVerticalReviewProps, compactText} from '../scripts/video/lib/props.mjs';

test('builds deterministic Remotion props from production artifacts', () => {
  const props = buildVerticalReviewProps({
    movieId: 'TEST-001',
    source: {actress: ['甲', '乙']},
    editorial: {canonical_tag_ids: ['story'], short_review: '這是一段用來測試短影音核心句的評論。'},
    search: {quick_decision: {thesis: '以人物關係的變化作為這部作品的核心切角。'}},
    manifest: {assets: [{role: 'article_hero', path: '/hero.png'}, {role: 'vertical_scene', path: '/vertical.png'}]},
    taxonomy: {tags: [{id: 'story', label: '劇情設定'}]},
    baseUrl: 'https://cc18.pages.dev',
  });
  assert.equal(props.actress, '甲 × 乙');
  assert.deepEqual(props.tags, ['劇情設定']);
  assert.equal(props.imageOne, 'https://cc18.pages.dev/vertical.png');
  assert.equal(props.imageTwo, 'https://cc18.pages.dev/hero.png');
});

test('compactText keeps motion copy within its visual limit', () => {
  assert.equal(compactText('123456789', 6), '12345…');
});
