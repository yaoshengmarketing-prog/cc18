import {AwsClient} from 'aws4fetch';

const REQUIRED_FIELDS = ['accessKeyId', 'secretAccessKey', 'endpoint'];

export function parseR2S3Credentials(environment = process.env) {
  const raw = environment.CLOUDFLARE_R2_API_TOKEN?.trim();
  const authMode = environment.CC18_R2_AUTH_MODE?.trim().toLowerCase();
  if (!raw) {
    if (authMode === 'api-token') throw new Error('CC18_R2_AUTH_MODE=api-token requires CLOUDFLARE_R2_API_TOKEN');
    return null;
  }

  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    if (authMode === 'api-token') {
      throw new Error('CLOUDFLARE_R2_API_TOKEN must contain the R2 S3 credential JSON (accessKeyId, secretAccessKey, endpoint)');
    }
    return null;
  }
  for (const field of REQUIRED_FIELDS) {
    if (typeof credentials[field] !== 'string' || !credentials[field].trim()) {
      throw new Error(`CLOUDFLARE_R2_API_TOKEN is missing ${field}`);
    }
  }
  const endpoint = credentials.endpoint.replace(/\/$/, '');
  if (!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/i.test(endpoint)) {
    throw new Error('CLOUDFLARE_R2_API_TOKEN contains an invalid R2 endpoint');
  }
  return {...credentials, endpoint};
}

export function r2ObjectUrl({endpoint, bucket, key}) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${endpoint}/${encodeURIComponent(bucket)}/${encodedKey}`;
}

export async function putAndVerifyR2Object({bucket, key, bytes, contentType, cacheControl, environment = process.env}) {
  const credentials = parseR2S3Credentials(environment);
  if (!credentials) throw new Error('R2 S3 credentials are required for this upload path');
  const client = new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const url = r2ObjectUrl({endpoint: credentials.endpoint, bucket, key});
  const put = await client.fetch(url, {
    method: 'PUT',
    body: bytes,
    headers: {'content-type': contentType, 'cache-control': cacheControl},
  });
  if (!put.ok) throw new Error(`R2 S3 PUT failed (${put.status})`);
  const get = await client.fetch(url);
  if (!get.ok) throw new Error(`R2 S3 verification GET failed (${get.status})`);
  return Buffer.from(await get.arrayBuffer());
}
