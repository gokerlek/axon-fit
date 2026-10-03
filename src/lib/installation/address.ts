type DeploymentEnvironment={VERCEL_ENV?:string;VERCEL_PROJECT_PRODUCTION_URL?:string};
export function installationHomepage(incoming:Pick<Headers,'get'>,env:DeploymentEnvironment):string {
  // Production domain aliases can change without rebuilding this deployment.
  // Match the request origin used by the login callback, not a stale deployment env.
  if(env.VERCEL_ENV==='preview'&&env.VERCEL_PROJECT_PRODUCTION_URL)return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const host=incoming.get('x-forwarded-host')??incoming.get('host');
  if(!host)return env.VERCEL_PROJECT_PRODUCTION_URL?`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`:'http://localhost:3000';
  const scheme=incoming.get('x-forwarded-proto')??(host.startsWith('localhost')||host.startsWith('127.')?'http':'https');
  return `${scheme}://${host}`;
}
