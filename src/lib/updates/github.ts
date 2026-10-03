import 'server-only';
import * as v from 'valibot';
import {serverEnv} from '@/lib/env';
import {codeRepository,newerRelease,UPSTREAM,WORKFLOW,RELEASE_PATTERN,validUpdateCommit} from './core';
import pkg from '../../../package.json';
import {githubRequest} from './request';
import {requireUpdateWorkflow} from './readiness';

async function github<T>(path:string, init:RequestInit={}, allowMissing=false):Promise<T|null> {
  return githubRequest<T>(serverEnv().githubToken,path,init,allowMissing);
}
const releaseSchema=v.object({tag_name:v.string(),draft:v.boolean(),prerelease:v.boolean()});
const manifestSchema=v.object({version:v.string(),automaticUpdate:v.boolean(),dataMigration:v.boolean()});
export async function availableRelease() {
  const raw=await githubRequest<unknown>(undefined,`/repos/${UPSTREAM}/releases/latest`,{},true);
  if(!raw)return null;
  const release=v.parse(releaseSchema,raw);
  if(release.draft || release.prerelease || !newerRelease(release.tag_name,pkg.version))return null;
  const content=await githubRequest<{content:string}>(undefined,`/repos/${UPSTREAM}/contents/axon-release.json?ref=${encodeURIComponent(release.tag_name)}`,{},true);
  if(!content)return {tag:release.tag_name,automatic:false};
  const manifest=v.safeParse(manifestSchema,JSON.parse(Buffer.from(content.content,'base64').toString('utf8')));
  return {tag:release.tag_name,automatic:manifest.success && manifest.output.automaticUpdate && !manifest.output.dataMigration && `v${manifest.output.version}`===release.tag_name};
}
export function updateRepo() {const env=serverEnv();return codeRepository(process.env.AXON_CODE_REPO,env.owner,env.appRepo);}
type Run={id:number;status:string;conclusion:string|null;display_title:string;head_branch:string;event:string};
function checkProductionBranch(branch:string) {
  if(process.env.AXON_CODE_BRANCH && process.env.AXON_CODE_BRANCH!==branch)throw new Error('Vercel üretim dalı kod reposunun varsayılan dalıyla aynı değil. Manuel güncelleme kullan.');
}
export async function updateStatus() {
  const repo=updateRepo();
  const metadata=await github<{default_branch:string}>(`/repos/${repo}`);
  checkProductionBranch(metadata!.default_branch);
  await requireUpdateWorkflow(repo,
    async()=>Boolean(await github(`/repos/${repo}/contents/.github/workflows/${WORKFLOW}?ref=${encodeURIComponent(metadata!.default_branch)}`,{},true)),
    ()=>github<{state:string}>(`/repos/${repo}/actions/workflows/${WORKFLOW}`,{},true),
  );
  const result=await github<{workflow_runs:Run[]}>(`/repos/${repo}/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=1`,{},true);
  const run=result?.workflow_runs[0];
  if(!run || run.head_branch!==metadata!.default_branch) return null;
  const tag=run.display_title.replace('Axon update ','');
  if(!RELEASE_PATTERN.test(tag))return null;
  const staged=await github<{object:{sha:string}}>(`/repos/${repo}/git/ref/heads/axon-update-${run.id}`,{},true);
  const head=await github<{object:{sha:string}}>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(metadata!.default_branch)}`);
  return {id:run.id,tag,status:run.status,conclusion:run.conclusion,applied:Boolean(staged && staged.object.sha===head!.object.sha),url:`https://github.com/${repo}/actions/runs/${run.id}`};
}
export async function startUpdate(tag:string) {
  const release=await availableRelease();
  if(!release?.automatic || release.tag!==tag)throw new Error('Bu sürüm otomatik güncelleme için uygun değil.');
  const repo=updateRepo();
  const pending=await updateStatus();
  if(pending && pending.status!=='completed')throw new Error('Bir güncelleme zaten hazırlanıyor.');
  const metadata=await github<{default_branch:string}>(`/repos/${repo}`);
  const branch=metadata!.default_branch;
  const ref=await github<{object:{sha:string}}>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  await github(`/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`,{method:'POST',body:JSON.stringify({ref:branch,inputs:{release:tag,expected_head:ref!.object.sha}})});
  return {url:`https://github.com/${repo}/actions/workflows/${WORKFLOW}`};
}
export async function applyUpdate(runId:number) {
  const repo=updateRepo();
  const run=await updateStatus();
  if(!run || run.id!==runId || run.status!=='completed' || run.conclusion!=='success')throw new Error('Başarılı bir güncelleme hazırlığı bulunamadı.');
  if(run.applied)return;
  const release=await availableRelease();
  if(!release?.automatic || release.tag!==run.tag)throw new Error('Sürüm artık otomatik güncelleme için uygun değil.');
  const metadata=await github<{default_branch:string}>(`/repos/${repo}`);
  const branch=metadata!.default_branch;
  const staged=await github<{object:{sha:string}}>(`/repos/${repo}/git/ref/heads/axon-update-${run.id}`);
  const head=await github<{object:{sha:string}}>(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit=await github<{parents:{sha:string}[];message:string}>(`/repos/${repo}/git/commits/${staged!.object.sha}`);
  if(!validUpdateCommit(commit!,head!.object.sha,run.tag))throw new Error('Kod bu sırada değişmiş. Güncellemeyi yeniden başlat.');
  const backup=`tags/axon-backup-${run.id}`;
  const old=await github<{object:{sha:string}}>(`/repos/${repo}/git/ref/${backup}`,{},true);
  if(old && old.object.sha!==head!.object.sha)throw new Error('Yedek etiketi eşleşmiyor.');
  if(!old)await github(`/repos/${repo}/git/refs`,{method:'POST',body:JSON.stringify({ref:`refs/${backup}`,sha:head!.object.sha})});
  // PT OAuth token moves the production branch, so Vercel receives a normal push.
  // GitHub Actions' temporary token is only used to prepare the staging branch.
  await github(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,{method:'PATCH',body:JSON.stringify({sha:staged!.object.sha,force:false})});
}
export const currentVersion=pkg.version;
