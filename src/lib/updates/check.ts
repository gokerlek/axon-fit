export async function checkUpdates<Release,Run>(current:string,releaseCheck:()=>Promise<Release>,statusCheck:()=>Promise<Run>) {
  // A private installation's permissions must not hide a public release.
  const release=await releaseCheck();
  try{return {current,release,run:await statusCheck(),automationError:null};}
  catch(error){return {current,release,run:null,automationError:error instanceof Error?error.message:'Otomatik güncelleme durumu kontrol edilemedi.'};}
}
