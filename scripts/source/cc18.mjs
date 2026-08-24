import {parseListing, parseWorkPage, assertCc18Url} from './cc18-parser.mjs';

const command = process.argv[2] ?? 'discover';
const target = process.argv[3] ?? 'https://cc18.tv/';
const url = assertCc18Url(target);
const response = await fetch(url, {headers: {'user-agent': 'CC18ReviewBot/0.1 (+https://github.com/yaoshengmarketing-prog/cc18)'}});
if (!response.ok) throw new Error(`Source returned ${response.status} for ${url.href}`);
const html = await response.text();

if (command === 'discover') {
  console.log(JSON.stringify({source_url: url.href, work_urls: parseListing(html, url.href)}, null, 2));
} else if (command === 'work') {
  console.log(JSON.stringify(parseWorkPage(html, url.href), null, 2));
} else {
  throw new Error(`Unknown command: ${command}`);
}
