import template from './axon-update-workflow.json' with {type:'json'};
export class WorkflowSetupError extends Error {}

export async function ensureUpdateWorkflow(token:string,repo:string,branch:string,scopes:string[],fetcher:typeof fetch=fetch):Promise<void> {
  const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'};
  const request=(path:string,init:RequestInit={})=>fetcher(`https://api.github.com${path}`,{...init,headers,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const repository=await request(`/repos/${repo}`);
  if(!repository.ok)throw new WorkflowSetupError(`Güncelleme dosyası için ${repo} kod reposuna erişilemiyor (${repository.status}). GitHub anahtarının kod reposuna erişimini kontrol et.`);
  const metadata=await repository.json() as {full_name?:string};
  if(metadata.full_name?.toLowerCase()!==repo.toLowerCase())throw new WorkflowSetupError('GitHub kod reposu kurulumla eşleşmiyor.');
  const path=`/repos/${repo}/contents/.github/workflows/axon-update.yml`;
  async function exists() {
    const response=await request(`${path}?ref=${encodeURIComponent(branch)}`);
    if(response.status===404)return false;
    if(!response.ok)throw new WorkflowSetupError(`Güncelleme dosyası kontrol edilemedi (${response.status}). GitHub repo erişimini kontrol et.`);
    const file=await response.json() as {type?:string};
    if(file.type!=='file')throw new WorkflowSetupError('Güncelleme dosyasının yolu bir dosya değil. Kod reposunu kontrol et.');
    return true;
  }
  if(await exists())return;
  if(!scopes.includes('workflow'))throw new WorkflowSetupError('Güncelleme dosyasını otomatik oluşturmak için GitHub anahtarında workflow izni gerekiyor. GitHub anahtarını repo, delete_repo ve workflow seçenekleriyle oluşturup kurulumu tekrar dene.');
  const created=await request(path,{method:'PUT',body:JSON.stringify({message:'Set up Axon Fit automatic updates',branch,content:Buffer.from(template.content).toString('base64')})});
  // No SHA is sent: GitHub refuses to replace a file created concurrently.
  if([409,422].includes(created.status)&&await exists())return;
  if(!created.ok)throw new WorkflowSetupError(`Güncelleme dosyası oluşturulamadı (${created.status}). GitHub workflow iznini ve ${branch} dalının yazma kurallarını kontrol et.`);
}
