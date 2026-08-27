import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadLocalEditorialEnvironment} from '../editorial/lib/openai-writer.mjs';
import {imageApiKey, listImageModels, selectImageSpec} from './lib/aitokenking-image.mjs';

const root = resolve(import.meta.dirname, '..', '..');
loadLocalEditorialEnvironment(root);
const config = JSON.parse(await readFile(resolve(root, 'config/image-model.json'), 'utf8'));
const apiKey = imageApiKey(config);
if (!apiKey) throw new Error(`${config.api_key_env} is not configured`);
const models = await listImageModels({config, apiKey});
const specs = Object.fromEntries(Object.keys(config.roles).map((role) => [role, selectImageSpec(config, models, role)]));
console.log(JSON.stringify({provider: config.provider, configured_model: config.model, available_models: models.length, specs, generation_submitted: false}, null, 2));
