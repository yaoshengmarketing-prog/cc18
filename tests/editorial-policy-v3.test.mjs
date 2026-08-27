import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const text = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('title policy prioritizes one source adult topic and demotes technical quality terms', async () => {
  const policy = await json('config/title-policy.json');
  assert.equal(policy.schema_version, 3);
  assert.deepEqual(policy.source_precedence.slice(2, 4), ['cc18_source_title', 'cc18_source_tags']);
  assert.equal(policy.keyword_stack_strategy.exactly_one_primary_adult_topic, true);
  assert.equal(policy.keyword_stack_strategy.technical_quality_weight, 'low');
  assert.ok(policy.keyword_stack_strategy.technical_quality_terms.includes('高畫質'));
  assert.ok(policy.signal_types.includes('character'));
  assert.equal(policy.validation.technical_quality_cannot_displace_adult_topic, true);
  assert.equal(policy.keyword_stack_strategy.core_source_concept_must_anchor_title_and_thesis, true);
  assert.equal(policy.validation.display_or_seo_title_must_include_core_source_concept, true);
});

test('review policy defines seven source-grounded topic buckets and strict tag boundaries', async () => {
  const policy = await json('config/review-policy.json');
  assert.equal(policy.schema_version, 2);
  assert.deepEqual(
    policy.topic_element_summary.categories.map(({id}) => id),
    ['person_identity', 'body_type', 'costume', 'relationship', 'setting', 'acts_positions', 'presentation'],
  );
  assert.equal(policy.tag_layers.source.ai_may_create, false);
  assert.equal(policy.tag_layers.canonical.ai_may_promote, false);
  assert.equal(policy.tag_layers.editorial.ai_may_create, true);
  assert.equal(policy.topic_element_summary.do_not_infer_missing_source_elements, true);
  assert.equal(policy.anti_template_rules.source_core_concept_must_drive_thesis_before_generic_character_arc, true);
});

test('scorecard preserves a complete weight and penalizes keyword-only or templated content', async () => {
  const scorecard = await json('config/review-scorecard.json');
  const weight = Object.values(scorecard.dimensions).reduce((sum, dimension) => sum + dimension.weight, 0);
  assert.ok(Math.abs(weight - 1) < Number.EPSILON);
  assert.equal(scorecard.automatic_deductions.generic_arc_used_without_source_specific_reason.dimension, 'originality');
  assert.equal(scorecard.automatic_deductions.adult_keywords_listed_without_answering_reader_question.dimension, 'search_value');
  assert.equal(scorecard.automatic_deductions.popular_tag_displaces_source_title_core.dimension, 'specificity');
});

test('writer and critic prompts enforce topic summary, tag boundaries and anti-template reasoning', async () => {
  const [writer, critic] = await Promise.all([
    text('prompts/review-writer.md'),
    text('prompts/review-critic.md'),
  ]);
  for (const value of [writer, critic]) {
    assert.match(value, /人物／身分/);
    assert.match(value, /行為／體位/);
    assert.match(value, /source/i);
    assert.match(value, /canonical/i);
    assert.match(value, /editorial/i);
    assert.match(value, /被引導到主動/);
  }
  assert.match(writer, /primary source adult topic/i);
  assert.match(writer, /core_source_concept/);
  assert.match(critic, /core source concept/i);
  assert.match(critic, /technical quality terms do not displace/i);
});
