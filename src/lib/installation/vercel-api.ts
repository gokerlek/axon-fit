import type {Environment,EnvironmentItem,InstallGateway,Project} from './automatic.ts';
import {ensureUpdateWorkflow} from './update-workflow.ts';
import {verifyGithubOAuth} from './oauth.ts';

class VercelError extends Error {
  readonly status:number;
  constructor(status:number){super(`Vercel işlemi tamamlanamadı (${status}). Tokenın kapsamını ve proje erişimini kontrol et.`);this.status=status;}
}
export function vercelGateway(token:string,fetcher:typeof fetch=fetch,callback?:string):InstallGateway {
  let teamId:string|undefined;
  async function api<T>(path:string,init:RequestInit={},team=teamId):Promise<T> {
    const url=new URL(path,'https://api.vercel.com');
    if(url.origin!=='https://api.vercel.com')throw new Error('Geçersiz Vercel adresi.');
    if(team)url.searchParams.set('teamId',team);
    const response=await fetcher(url,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new VercelError(response.status);
    if(response.status===204)return undefined as T;
    return response.json() as Promise<T>;
  }
  return {
    async project(id){
      const path=`/v9/projects/${encodeURIComponent(id)}`;
      try{return await api<Project>(path);}catch(error){if(!(error instanceof VercelError) || ![403,404].includes(error.status))throw error;}
      // A token can be scoped to a team; detect the granted team, not another project.
      const teams=await api<{teams:{id:string}[]}>('/v2/teams?limit=20');
      for(const team of teams.teams){try{const project=await api<Project>(path,{},team.id);teamId=team.id;return project;}catch(error){if(!(error instanceof VercelError)||![403,404].includes(error.status))throw error;}}
      throw new Error('Bu Vercel tokenının mevcut projeye erişimi yok. Projenin bulunduğu hesabın/team’in kapsamını seç.');
    },
    async env(id){return (await api<{envs:Environment[]}>(`/v9/projects/${encodeURIComponent(id)}/env`)).envs;},
    async githubOwner(githubToken){
      const response=await fetcher('https://api.github.com/user',{headers:{Authorization:`Bearer ${githubToken}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('GitHub tokenı doğrulanamadı. Kendi hesabında oluşturduğun tokenı ve süresini kontrol et.');
      const user=await response.json() as {login?:unknown};if(typeof user.login!=='string')throw new Error('GitHub hesabı doğrulanamadı.');
      return {login:user.login,scopes:(response.headers.get('x-oauth-scopes')??'').split(/[ ,]+/).filter(Boolean)};
    },
    async create(id,items:EnvironmentItem[]){
      const result=await api<{failed?:unknown[];error?:unknown}>(`/v10/projects/${encodeURIComponent(id)}/env`,{method:'POST',body:JSON.stringify(items)});
      if(result.failed?.length || result.error)throw new Error('Bazı ayarlar kaydedilemedi; yayın başlatılmadı. Kendi Vercel env ekranını kontrol et. Mevcut sırlar değiştirilmedi.');
    },
    async ensureWorkflow(githubToken,repo,branch,scopes){await ensureUpdateWorkflow(githubToken,repo,branch,scopes,fetcher);},
    async validateOAuth(clientId,clientSecret){await verifyGithubOAuth(clientId,clientSecret,callback,fetcher);},
    async deploy(project){return api<{id:string}>('/v13/deployments',{method:'POST',body:JSON.stringify({name:project.name,project:project.id,target:'production',gitSource:{type:'github',repoId:Number(project.link!.repoId),ref:project.link!.productionBranch}})});},
  };
}
