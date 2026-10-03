export function environmentStatus(env: Record<string,string|undefined>): 'missing'|'ready' {
  const base=['GITHUB_OWNER','APP_REPO','AUTH_SECRET'];
  const oauth=Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  if(base.some(k=>!env[k]) || new TextEncoder().encode(env.AUTH_SECRET ?? '').length<32 || (!oauth && !env.RESEND_API_KEY))return 'missing';
  if(!env.GITHUB_TOKEN)return 'missing';
  return 'ready';
}
