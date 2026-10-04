import {WorkflowSetupError} from './update-workflow.ts';
type GithubAccount={login:string;scopes:string[]};
export class InstallationAccountError extends Error {}
export async function identifyGithubAccount(token:string,expectedOwner:string|undefined,lookup:(token:string)=>Promise<GithubAccount>,requireWorkflow=false):Promise<string> {
  const account=await lookup(token);
  if(!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(account.login))throw new InstallationAccountError('GitHub hesabı doğrulanamadı.');
  if(!['repo','delete_repo'].every(scope=>account.scopes.includes(scope)))throw new InstallationAccountError('GitHub’da repo ve delete_repo seçeneklerini işaretleyip yeniden anahtar oluştur.');
  if(requireWorkflow&&!account.scopes.includes('workflow'))throw new InstallationAccountError('Otomatik kurulum için workflow izni de gerekiyor. GitHub anahtarını repo, delete_repo ve workflow seçenekleriyle oluştur.');
  if(expectedOwner&&account.login.toLowerCase()!==expectedOwner.toLowerCase())throw new InstallationAccountError('Anahtarı bu uygulamayı kopyaladığın GitHub hesabında oluştur.');
  return account.login;
}
export async function connectGithubAccount(token:string,expectedOwner:string|undefined,codeRepo:string|undefined,automatic:boolean,lookup:(token:string)=>Promise<GithubAccount>,prepare:(token:string,repo:string,branch:string,scopes:string[])=>Promise<void>):Promise<string> {
  const account=await lookup(token);
  const owner=await identifyGithubAccount(token,expectedOwner,async()=>account,automatic);
  if(expectedOwner&&codeRepo){
    try{await prepare(token,`${expectedOwner}/${codeRepo}`,'main',account.scopes);}
    catch(error){if(error instanceof WorkflowSetupError)throw new InstallationAccountError(error.message);throw error;}
  }
  return owner;
}
