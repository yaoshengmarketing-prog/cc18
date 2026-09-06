import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../config/agent-roles.json', import.meta.url), 'utf8'));
const pipeline = JSON.parse(await readFile(new URL('../config/pipeline.json', import.meta.url), 'utf8'));
const requiredRoles = ['scout', 'tag_curator', 'editor', 'critic_qa', 'media_producer', 'publisher'];

test('agent workflow configuration has the required role-separated DAG', () => {
  assert.equal(config.schema_version, 1);
  assert.deepEqual(Object.keys(config.roles), requiredRoles);
  assert.match(config.roles.scout.executor, /^deterministic_/);
  assert.match(config.roles.publisher.executor, /^deterministic_/);
  assert.notEqual(config.roles.editor.executor, config.roles.critic_qa.executor);

  const edges = new Map(requiredRoles.map((role) => [role, [
    ...(config.roles[role].next ?? []),
    ...(config.roles[role].next_on_pass ?? []),
  ]]));
  const visiting = new Set();
  const visited = new Set();
  function visit(role) {
    if (visiting.has(role)) throw new Error(`cycle detected at ${role}`);
    if (visited.has(role)) return;
    visiting.add(role);
    for (const next of edges.get(role) ?? []) {
      assert.ok(requiredRoles.includes(next), `unknown next role ${next}`);
      visit(next);
    }
    visiting.delete(role);
    visited.add(role);
  }
  visit('scout');
  assert.deepEqual([...visited].sort(), [...requiredRoles].sort());
});

test('every role declares inputs, outputs, prohibitions and a versioned output contract', () => {
  for (const [name, role] of Object.entries(config.roles)) {
    assert.ok(Array.isArray(role.reads) && role.reads.length > 0, `${name} reads`);
    assert.ok(Array.isArray(role.writes) && role.writes.length > 0, `${name} writes`);
    assert.ok(Array.isArray(role.must_not) && role.must_not.length > 0, `${name} must_not`);
    assert.match(role.output_contract, /^[a-z_]+:v\d+$/, `${name} output contract`);
  }
  assert.ok(config.roles.critic_qa.next_on_rewrite.includes('editor'));
  assert.ok(config.roles.publisher.must_not.includes('enable_daily_schedule'));
});

test('handoff envelope and source-of-truth boundaries are explicit', () => {
  const contract = config.handoff_contract;
  const example = contract.example;
  for (const field of contract.required_envelope_fields) {
    assert.ok(Object.hasOwn(example, field), `missing example field ${field}`);
  }
  assert.equal(contract.reference_only_payloads, true);
  assert.equal(contract.forbid_secrets_in_payload, true);
  assert.equal(config.invariants.ai_cannot_write_queue_or_registry_directly, true);
  assert.equal(config.source_of_truth.queue_and_job_state, 'cloudflare_d1');
  assert.equal(config.source_of_truth.source_identity_and_provenance, 'source_record');
});

test('production scheduling drains the D1 queue serially without a daily work limit', () => {
  assert.equal(config.production_schedule_enabled, true);
  assert.equal(config.production_schedule.trigger, 'hourly_github_actions');
  assert.equal(config.production_schedule.cron_utc, '17 * * * *');
  assert.equal(config.production_schedule.queue_authority, 'cloudflare_d1');
  assert.equal(config.production_schedule.enqueue_all_eligible, true);
  assert.equal(config.production_schedule.daily_work_limit, null);
  assert.equal(config.production_schedule.maximum_parallel_works, 1);
  assert.equal(config.production_schedule.drain_until_empty, true);
  assert.equal(pipeline.production.mode, 'scheduled_serial');
  assert.equal(pipeline.production.batch_size, 1);
  assert.equal(pipeline.production.max_parallel, 1);
  assert.equal(Object.hasOwn(pipeline.discovery, 'hard_discovery_cap'), false);
  assert.equal(pipeline.publishing.daily_enabled, false);
});

test('the historical canary remains bounded and separate from scheduled production', () => {
  assert.equal(config.canary.enabled, true);
  assert.equal(config.canary.daily_schedule_enabled, false);
  assert.equal(config.canary.manual_trigger_only, true);
  assert.ok(config.canary.minimum_days >= 3);
  assert.ok(config.canary.target_days >= config.canary.minimum_days);
  assert.ok(config.canary.target_days <= 7);
  assert.ok(config.canary.daily_work_limit >= 1 && config.canary.daily_work_limit <= 3);
  assert.ok(config.canary.maximum_parallel_works >= 1 && config.canary.maximum_parallel_works <= config.canary.daily_work_limit);
  assert.ok(config.canary.promotion_gates.end_to_end_success_rate_percent >= 95);
  assert.equal(config.canary.promotion_gates.duplicate_publication_count, 0);
  assert.equal(config.canary.promotion_gates.source_identity_error_count, 0);
});

test('failures are isolated per work and escalate only after bounded automation', () => {
  const policy = config.failure_policy;
  assert.equal(policy.isolation_key, 'work_id');
  assert.equal(policy.continue_other_works_after_failure, true);
  assert.ok(policy.maximum_attempts_per_stage >= 1 && policy.maximum_attempts_per_stage <= 5);
  assert.ok(policy.automatic_rewrite_attempts >= 1 && policy.automatic_rewrite_attempts <= 2);
  assert.ok(policy.human_escalation.required_when.includes('same_stage_reaches_maximum_attempts'));
  assert.ok(policy.human_escalation.not_required_when.includes('new_source_tag_is_recorded_as_candidate'));
});
