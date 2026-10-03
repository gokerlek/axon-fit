type GithubAccount={login:string;scopes:string[]};
export async function identifyGithubAccount(token:string,expectedOwner:string|undefined,lookup:(token:string)=>Promise<GithubAccount>):Promise<string> {
  const account=await lookup(token);
  if(!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(account.login))throw new Error('GitHub hesabı doğrulanamadı.');
  if(!['repo','delete_repo'].every(scope=>account.scopes.includes(scope)))throw new Error('GitHub’da repo ve delete_repo seçeneklerini işaretleyip yeniden anahtar oluştur.');
  if(expectedOwner&&account.login.toLowerCase()!==expectedOwner.toLowerCase())throw new Error('Anahtarı bu uygulamayı kopyaladığın GitHub hesabında oluştur.');
  return account.login;
}
