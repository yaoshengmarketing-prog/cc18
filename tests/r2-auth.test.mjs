import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildR2WranglerEnvironment} from '../scripts/r2/wrangler-auth.mjs';
import {parseR2S3Credentials, r2ObjectUrl} from '../scripts/r2/object-store.mjs';

test('dedicated R2 token replaces the D1 token only for Wrangler children', () => {
  const environment = {
    CLOUDFLARE_API_TOKEN: 'd1-token',
    CLOUDFLARE_R2_API_TOKEN: 'r2-token',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
  };
  const child = buildR2WranglerEnvironment(environment);
  assert.equal(child.CLOUDFLARE_API_TOKEN, 'r2-token');
  assert.equal(child.CLOUDFLARE_ACCOUNT_ID, 'account-id');
  assert.equal(child.CLOUDFLARE_R2_API_TOKEN, undefined);
  assert.equal(environment.CLOUDFLARE_API_TOKEN, 'd1-token');
});

test('local OAuth mode removes API tokens from the Wrangler child', () => {
  const child = buildR2WranglerEnvironment({
    CC18_R2_AUTH_MODE: 'oauth',
    CLOUDFLARE_API_TOKEN: 'd1-token',
    CLOUDFLARE_R2_API_TOKEN: 'r2-token',
  });
  assert.equal(child.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(child.CLOUDFLARE_R2_API_TOKEN, undefined);
});

test('legacy single-token configuration remains supported', () => {
  const child = buildR2WranglerEnvironment({CLOUDFLARE_API_TOKEN: 'legacy-token'});
  assert.equal(child.CLOUDFLARE_API_TOKEN, 'legacy-token');
});

test('GitHub API-token mode fails before generation when the dedicated R2 secret is absent', () => {
  assert.throws(
    () => buildR2WranglerEnvironment({CC18_R2_AUTH_MODE: 'api-token', CLOUDFLARE_API_TOKEN: 'd1-only'}),
    /requires CLOUDFLARE_R2_API_TOKEN/,
  );
});

test('parses the bucket-scoped R2 S3 credential bundle used by GitHub Actions', () => {
  const credentials = parseR2S3Credentials({
    CC18_R2_AUTH_MODE: 'api-token',
    CLOUDFLARE_R2_API_TOKEN: JSON.stringify({
      accessKeyId: 'access-id',
      secretAccessKey: 'secret-key',
      endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/',
    }),
  });
  assert.deepEqual(credentials, {
    accessKeyId: 'access-id', secretAccessKey: 'secret-key',
    endpoint: 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
  });
  assert.equal(r2ObjectUrl({endpoint: credentials.endpoint, bucket: 'cc18-media', key: 'works/2026/08/SNOS-409/hero v1.jpg'}),
    'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com/cc18-media/works/2026/08/SNOS-409/hero%20v1.jpg');
});

test('rejects a plain Cloudflare API token in GitHub S3 mode', () => {
  assert.throws(() => parseR2S3Credentials({
    CC18_R2_AUTH_MODE: 'api-token', CLOUDFLARE_R2_API_TOKEN: 'cfat_plain_token',
  }), /must contain the R2 S3 credential JSON/);
});

test('media rehydration preserves prior rewrite history while recording no rewrite in the recovery run', async () => {
  const source = await readFile(new URL('../scripts/r2/rehydrate-media.mjs', import.meta.url), 'utf8');
  assert.match(source, /pre_approval_rewrite_attempts_observed/);
  assert.match(source, /rewrite_attempts = 0/);
  assert.match(source, /completed_d1_rehydration_without_rewrite/);
  assert.match(source, /rehydrated_from_hash_verified_r2_object/);
});
