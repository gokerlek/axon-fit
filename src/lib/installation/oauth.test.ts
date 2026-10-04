import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyGithubOAuth} from './oauth.ts';

test('checks OAuth credentials without a real authorization code or retaining a token',async()=>{
  const fake:typeof fetch=async(input,init)=>{
    assert.equal(String(input),'https://github.com/login/oauth/access_token');
    const body=JSON.parse(String(init?.body));
    assert.equal(body.client_id,'client');assert.equal(body.client_secret,'test-secret');
    assert.equal(body.redirect_uri,'https://coach.example/api/auth/github/callback');
    assert.equal(body.code,'axon-fit-setup-invalid-code');
    return Response.json({error:'bad_verification_code'});
  };
  await verifyGithubOAuth('client','test-secret','https://coach.example/api/auth/github/callback',fake);
});
test('wrong client credentials, callback mismatch and upstream failures stop setup with no secret echo',async()=>{
  for(const [code,message] of [['incorrect_client_credentials',/Client ID.*Client Secret/],['redirect_uri_mismatch',/callback/],['unexpected',/doğrulanamadı/]] as const){
    await assert.rejects(verifyGithubOAuth('id','test-secret',undefined,async()=>Response.json({error:code,error_description:'test-secret'})),error=>error instanceof Error&&message.test(error.message)&&!error.message.includes('test-secret'));
  }
  await assert.rejects(verifyGithubOAuth('id','test-secret',undefined,async()=>new Response('test-secret',{status:500})),/doğrulanamadı/);
  await assert.rejects(verifyGithubOAuth('id','test-secret',undefined,async()=>{throw new Error('test-secret');}),error=>error instanceof Error&&!error.message.includes('test-secret'));
});
