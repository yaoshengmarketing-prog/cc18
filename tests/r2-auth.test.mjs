import test from 'node:test';
import assert from 'node:assert/strict';
import {buildR2WranglerEnvironment} from '../scripts/r2/wrangler-auth.mjs';

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
