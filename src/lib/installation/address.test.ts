import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installationHomepage} from './address.ts';

test('renamed production domain overrides the previous deployment production URL',()=>{
  const headers=new Headers({'host':'internal.vercel.app','x-forwarded-host':'gokerfit-test.vercel.app','x-forwarded-proto':'https'});
  const home=installationHomepage(headers,{VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'fit-old-name.vercel.app'});
  assert.equal(home,'https://gokerfit-test.vercel.app');
  assert.equal(new URL('/api/auth/github/callback',home).href,'https://gokerfit-test.vercel.app/api/auth/github/callback');
});
test('preview uses the canonical production address instead of its transient hostname',()=>{
  assert.equal(installationHomepage(new Headers({'host':'fit-preview.vercel.app'}),{VERCEL_ENV:'preview',VERCEL_PROJECT_PRODUCTION_URL:'coach.example.com'}),'https://coach.example.com');
});
test('custom production domain and local development use the current host',()=>{
  assert.equal(installationHomepage(new Headers({'host':'coach.example.com'}),{VERCEL_ENV:'production'}),'https://coach.example.com');
  assert.equal(installationHomepage(new Headers({'host':'localhost:3001'}),{}),'http://localhost:3001');
});
