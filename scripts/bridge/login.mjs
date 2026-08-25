import {loadBridgeConfig} from './lib/config.mjs';
import {launchBridgeBrowser, openAdminForLogin} from './lib/browser.mjs';

const config = await loadBridgeConfig();
config.browser.headless = false;
const context = await launchBridgeBrowser(config);
await openAdminForLogin(context, config);
console.log('Dedicated CC18 Chrome profile is open. Log in manually, confirm the admin page loads, then press Enter here.');
process.stdin.setEncoding('utf8');
await new Promise((resolve) => process.stdin.once('data', resolve));
await context.close();
console.log('CC18 bridge profile saved locally.');
