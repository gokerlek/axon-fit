/** Probe with a deliberately invalid code: no user's authorization code is consumed. */
class OAuthSetupError extends Error {}
export async function verifyGithubOAuth(clientId:string,clientSecret:string,callback:string|undefined,fetcher:typeof fetch=fetch):Promise<void> {
  try{
  const response=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,code:'axon-fit-setup-invalid-code',...(callback?{redirect_uri:callback}:{})}),cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new OAuthSetupError('GitHub giriş bilgileri doğrulanamadı. Bağlantıyı kontrol edip tekrar dene.');
  const result=await response.json() as {error?:string};
  if(result.error==='incorrect_client_credentials')throw new OAuthSetupError('Client ID veya Client Secret yanlış. GitHub OAuth App ekranındaki iki değeri yeniden kopyala.');
  if(result.error==='redirect_uri_mismatch')throw new OAuthSetupError('GitHub OAuth App callback adresi uyuşmuyor. Sihirbazdaki Authorization callback URL değerini GitHub’a aynen kopyala.');
  if(result.error!=='bad_verification_code')throw new OAuthSetupError('GitHub giriş bilgileri doğrulanamadı. OAuth App ayarlarını kontrol edip tekrar dene.');
  }catch(error){
    if(error instanceof OAuthSetupError)throw error;
    throw new OAuthSetupError('GitHub giriş bilgileri doğrulanamadı. Bağlantıyı kontrol edip tekrar dene.');
  }
}
