import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeOutcome, cycleArguments, editorialTransmissionAllowed} from '../scripts/worker/lib/cycle.mjs';

test('cycle has a bounded default and validates its upper limit', () => {
  assert.deepEqual(cycleArguments([]), {max: 3, withEditorial: false});
  assert.deepEqual(cycleArguments(['--max=20', '--with-editorial']), {max: 20, withEditorial: true});
  assert.throws(() => cycleArguments(['--max=21']), /between 1 and 20/);
});

test('cycle extracts a completed movie and recognizes an empty queue', () => {
  assert.deepEqual(bridgeOutcome('{"event":"d1_job_completed","movie_id":"TEST-001"}\n'), {status: 'completed', movieId: 'TEST-001'});
  assert.deepEqual(bridgeOutcome('{"event":"d1_queue_empty"}\n'), {status: 'empty', movieId: null});
});

test('editorial transmission requires exact explicit opt-in', () => {
  assert.equal(editorialTransmissionAllowed({CC18_ALLOW_EDITORIAL_TRANSMISSION: 'YES'}), true);
  assert.equal(editorialTransmissionAllowed({CC18_ALLOW_EDITORIAL_TRANSMISSION: 'true'}), false);
  assert.equal(editorialTransmissionAllowed({}), false);
});
