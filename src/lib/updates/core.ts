export const UPSTREAM = 'gokerlek/axon-fit';
export const WORKFLOW = 'axon-update.yml';
export function sameOrigin(request:Request) {return request.headers.get('origin')===new URL(request.url).origin;}
export const RELEASE_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function newerRelease(tag:string,current:string) {
  if (!RELEASE_PATTERN.test(tag) || !RELEASE_PATTERN.test(`v${current}`)) return false;
  const incoming = tag.slice(1).split('.').map(Number);
  const installed = current.split('.').map(Number);
  for (let i=0;i<3;i++) { if(incoming[i]!==installed[i]) return incoming[i]! > installed[i]!; }
  return false;
}
export function codeRepository(value:string|undefined,owner:string,dataRepo:string) {
  if (!value || !/^[\w-]+\/[\w.-]+$/.test(value)) throw new Error('Kod reposu tanımlı değil. AXON_CODE_REPO değişkenini kullanıcı/repo biçiminde ekle.');
  const [account,repo] = value.split('/');
  if(account!.toLowerCase()!==owner.toLowerCase() || repo!.toLowerCase()===dataRepo.toLowerCase() || repo!.toLowerCase().startsWith('client-') || ['.','..'].includes(repo!) || value.toLowerCase()===UPSTREAM.toLowerCase()) throw new Error('Yalnız kendi ayrı kod repon güncellenebilir.');
  return value;
}
export function validUpdateCommit(commit:{parents:{sha:string}[];message:string},head:string,tag:string) {
  return RELEASE_PATTERN.test(tag) && commit.parents.length===1 && commit.parents[0]?.sha===head && commit.message===`Axon update ${tag}`;
}
