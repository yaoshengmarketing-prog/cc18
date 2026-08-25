import {loadBridgeConfig} from './lib/config.mjs';
import {launchBridgeBrowser, openAdminForLogin} from './lib/browser.mjs';

const config = await loadBridgeConfig();
let context;
try {
  context = await launchBridgeBrowser(config);
  const page = await openAdminForLogin(context, config);
  const result = await page.evaluate(() => ({
    title: document.title,
    page: {origin: location.origin, path: location.pathname, has_query: Boolean(location.search)},
    password_fields: document.querySelectorAll('input[type="password"]').length,
    links: [...document.querySelectorAll('a[href]')].map((anchor) => {
      try {
        const url = new URL(anchor.href, location.href);
        if (url.origin !== location.origin) return null;
        return {
          text: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          path: url.pathname,
          has_query: Boolean(url.search),
          target: anchor.target || null,
        };
      } catch {
        return null;
      }
    }).filter(Boolean).slice(0, 50),
  }));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context?.close().catch(() => {});
}
