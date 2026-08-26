import {mkdir} from 'node:fs/promises';
import {assertAllowedUrl} from './config.mjs';
import {bridgeLog, safeUrlShape} from './redact.mjs';

function authError(message) {
  const error = new Error(message);
  error.code = 'AUTH_REQUIRED';
  return error;
}

function ageConfirmationError(options) {
  const error = new Error(`CC18 age confirmation requires approval; options: ${options.join(' / ') || 'unlabeled controls'}`);
  error.code = 'AGE_CONFIRMATION_REQUIRED';
  return error;
}

const TRANSIENT_NAVIGATION_ERRORS = /ERR_(?:QUIC_PROTOCOL_ERROR|NETWORK_CHANGED|CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT)/i;

async function gotoWithTransientRetry(page, url, options) {
  try {
    return await page.goto(url, options);
  } catch (error) {
    if (!TRANSIENT_NAVIGATION_ERRORS.test(String(error?.message || ''))) throw error;
    await page.waitForTimeout(1500);
    return page.goto(url, options);
  }
}

async function pageNeedsLogin(page) {
  const url = new URL(page.url());
  if (/login|signin|auth/i.test(url.pathname)) return true;
  return page.locator('input[type="password"]:visible').count().catch(() => 0).then((count) => count > 0);
}

export async function launchBridgeBrowser(config) {
  const {chromium} = await import('playwright-core');
  await mkdir(config.profile_dir, {recursive: true});
  return chromium.launchPersistentContext(config.profile_dir, {
    channel: config.browser.channel,
    headless: config.browser.headless,
    acceptDownloads: false,
    viewport: null,
    args: ['--disable-quic'],
  });
}

export async function openAdminForLogin(context, config) {
  const page = context.pages()[0] ?? await context.newPage();
  await gotoWithTransientRetry(page, config.browser.admin_url, {waitUntil: 'domcontentloaded', timeout: config.browser.navigation_timeout_ms});
  return page;
}

async function openAuthorizedFrontend(context, config) {
  const admin = context.pages()[0] ?? await context.newPage();
  await gotoWithTransientRetry(admin, config.browser.admin_url, {waitUntil: 'domcontentloaded', timeout: config.browser.navigation_timeout_ms});
  if (await pageNeedsLogin(admin)) throw authError('CC18 admin session requires login');

  const frontendLink = admin.locator('a[target="_blank"]')
    .filter({hasText: config.browser.frontend_link_text})
    .first();
  await frontendLink.waitFor({state: 'attached', timeout: config.browser.navigation_timeout_ms}).catch(() => {});
  if (!await frontendLink.count()) throw new Error(`CC18 admin frontend link not found: ${config.browser.frontend_link_text}`);

  const popupPromise = context.waitForEvent('page', {timeout: 8000}).catch(() => null);
  await frontendLink.click();
  const frontend = await popupPromise ?? admin;
  await frontend.waitForLoadState('domcontentloaded', {timeout: config.browser.navigation_timeout_ms}).catch(() => {});
  return frontend;
}

export async function captureAuthorizedManifest(context, config, sourceUrl) {
  const source = assertAllowedUrl(sourceUrl, config.security.allowed_source_hosts, {requireHttps: config.security.require_https});
  const page = await openAuthorizedFrontend(context, config);
  await gotoWithTransientRetry(page, source.href, {waitUntil: 'domcontentloaded', timeout: config.browser.navigation_timeout_ms});
  if (await pageNeedsLogin(page)) throw authError('CC18 frontend session requires login');

  const ageGate = page.locator('#message-pop.check_18_popup:visible');
  if (await ageGate.count()) {
    const controls = await ageGate.locator('button, a, [role="button"]').allTextContents();
    const options = controls.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 10);
    if (!config.browser.allow_age_confirmation) throw ageConfirmationError(options);
    const confirmation = ageGate.locator('button, a, [role="button"]')
      .filter({hasText: /18|成年|同意|確認|進入|是/})
      .last();
    if (!await confirmation.count()) throw ageConfirmationError(options);
    await confirmation.click();
    await ageGate.waitFor({state: 'hidden', timeout: config.browser.navigation_timeout_ms});
  }

  const responsePromise = page.waitForResponse((response) => {
    try {
      const url = new URL(response.url());
      return config.security.allowed_media_hosts.includes(url.hostname) && /\.m3u8$/i.test(url.pathname);
    } catch {
      return false;
    }
  }, {timeout: config.browser.manifest_timeout_ms});

  const playButton = page.locator('#play_btn');
  if (await playButton.count()) await playButton.click();
  else await page.locator('.jwplayer, video').first().click();

  const response = await responsePromise;
  if (!response.ok()) throw new Error(`Media manifest returned HTTP ${response.status()}`);
  const manifestUrl = response.url();
  assertAllowedUrl(manifestUrl, config.security.allowed_media_hosts, {requireHttps: config.security.require_https});
  const manifestText = await response.text();
  await page.waitForTimeout(1000);
  const player = await page.evaluate(() => {
    const video = [...document.querySelectorAll('video')].find((item) => item.readyState > 0);
    if (!video) return null;
    video.pause();
    return {
      duration_seconds: Number.isFinite(video.duration) ? video.duration : null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    };
  }).catch(() => null);

  bridgeLog('manifest_captured', {source: safeUrlShape(source.href), media: safeUrlShape(manifestUrl), player});
  return {manifestUrl, manifestText, player, pageTitle: await page.title()};
}
