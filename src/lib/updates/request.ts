function failure(path:string,status:number) {
  const repo=path.match(/^\/repos\/([^/]+\/[^/?]+)/)?.[1]??'GitHub';
  if(status===404){
    if(path.includes('/actions/workflows/'))return `${repo}: axon-update.yml workflow’una erişilemedi (404). Dosyanın varsayılan dalda bulunduğunu ve Actions’ın açık olduğunu kontrol et.`;
    const branch=path.match(/\/git\/ref\/heads\/(.+)$/)?.[1];
    if(branch)return `${decodeURIComponent(branch)} dalına erişilemedi (404): ${repo}. Kod reposunun varsayılan dalını ve AXON_CODE_BRANCH ayarını kontrol et.`;
    return `${repo} reposuna erişilemedi (404). AXON_CODE_REPO doğruysa Vercel’deki GITHUB_TOKEN anahtarının bu kod reposuna da erişebildiğini kontrol et. Veri reposuna erişim tek başına yeterli değil.`;
  }
  if(status===401)return 'GitHub anahtarı doğrulanamadı (401). Vercel’deki GITHUB_TOKEN anahtarının geçerliliğini kontrol et.';
  if(status===403)return `${repo}: GitHub işlemi engellendi (403). Anahtar izinlerini, Actions ayarlarını ve GitHub API kullanım sınırını kontrol et.`;
  return `${repo}: GitHub işlemi tamamlanamadı (${status}).`;
}

export async function githubRequest<T>(token:string|undefined,path:string,init:RequestInit={},allowMissing=false,fetcher:typeof fetch=fetch):Promise<T|null> {
  const headers=new Headers(init.headers);
  headers.set('Accept','application/vnd.github+json');
  headers.set('X-GitHub-Api-Version','2022-11-28');
  headers.set('Content-Type','application/json');
  if(token)headers.set('Authorization',`Bearer ${token}`);
  else headers.delete('Authorization');
  const response=await fetcher(`https://api.github.com${path}`,{...init,headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(allowMissing && response.status===404)return null;
  if(!response.ok)throw new Error(failure(path,response.status));
  return response.status===204?null:response.json();
}
