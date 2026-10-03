import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authSecret,environmentFile,initialWizardValues,validateStep,type WizardValues} from './wizard.ts';
import {environmentStatus} from './readiness.ts';
const input:WizardValues={owner:'coach',codeRepo:'coach-app',appRepo:'coach-data',codeBranch:'main',githubToken:'ghp_test_only',clientId:'test-id',clientSecret:'test-secret',geminiKey:'',authSecret:'a'.repeat(64)};
test('setup derives repo defaults, always uses main and starts without sample credentials',()=>{
  const values=initialWizardValues('coach','renamed-copy');
  assert.equal(values.codeRepo,'renamed-copy');assert.equal(values.codeBranch,'main');
  assert.equal(values.appRepo,'axon-fit-data');assert.equal(values.githubToken,'');assert.equal(values.clientSecret,'');
  assert.notEqual(initialWizardValues('coach','AXON-FIT-DATA').appRepo.toLowerCase(),'axon-fit-data');
});
test('standalone setup exports only trainer credentials and update repo without installer keys',()=>{
  const output=environmentFile(input);
  assert.match(output,/GITHUB_OWNER=coach/);
  assert.match(output,/AXON_CODE_REPO=coach\/coach-app/);
  assert.doesNotMatch(output,/VERCEL_TOKEN|BOOTSTRAP|INSTALLER|INTEGRATION|gokerlek|GEMINI_API_KEY/);
  assert.match(environmentFile({...input,geminiKey:'optional-key'}),/GEMINI_API_KEY=optional-key/);
});
test('wizard validates one step at a time without requiring future credentials',()=>{
  assert.deepEqual(validateStep(0,{...input,clientId:'',clientSecret:'',authSecret:''}),{});
  assert.ok(validateStep(1,{...input,clientSecret:''}).clientSecret);
  assert.deepEqual(validateStep(2,{...input,geminiKey:''}),{});
});
test('dotenv injection and ambiguous data repos are rejected',()=>{
  for(const githubToken of ['token\nOTHER=value','${GITHUB_SECRET}','token value','token"'])assert.throws(()=>environmentFile({...input,githubToken}));
  for(const appRepo of ['COACH-APP','Client-c_test','..','.'])assert.throws(()=>environmentFile({...input,appRepo}));
});
test('auth secret encodes all 32 crypto-random bytes without truncation',()=>{
  assert.equal(authSecret(new Uint8Array(32).fill(255)),'ff'.repeat(32));
  assert.throws(()=>authSecret(new Uint8Array(16)));
});
test('readiness cannot be bypassed by old bootstrap credentials',()=>{
  const env={GITHUB_OWNER:'coach',APP_REPO:'data',AUTH_SECRET:'a'.repeat(64),GITHUB_CLIENT_ID:'id',GITHUB_CLIENT_SECRET:'secret'};
  assert.equal(environmentStatus({...env,GITHUB_TOKEN:'token'}),'ready');
  assert.equal(environmentStatus({...env,AXON_BOOTSTRAP:'old'}),'missing');
  assert.equal(environmentStatus({...env,AUTH_SECRET:'short',GITHUB_TOKEN:'token'}),'missing');
});
