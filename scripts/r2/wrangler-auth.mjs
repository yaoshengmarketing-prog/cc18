export function buildR2WranglerEnvironment(environment = process.env) {
  const result = {...environment};
  const authMode = environment.CC18_R2_AUTH_MODE?.trim().toLowerCase();

  if (authMode === 'oauth') {
    delete result.CLOUDFLARE_API_TOKEN;
    delete result.CLOUDFLARE_R2_API_TOKEN;
    return result;
  }

  const r2Token = environment.CLOUDFLARE_R2_API_TOKEN?.trim();
  if (authMode === 'api-token' && !r2Token) {
    throw new Error('CC18_R2_AUTH_MODE=api-token requires CLOUDFLARE_R2_API_TOKEN');
  }
  if (r2Token) result.CLOUDFLARE_API_TOKEN = r2Token;
  delete result.CLOUDFLARE_R2_API_TOKEN;
  return result;
}
