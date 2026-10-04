import * as v from 'valibot';
import {environmentValues,wizardSchema,type WizardValues} from './wizard.ts';
export const automaticSchema=v.strictObject({
  values:wizardSchema,
  vercelToken:v.pipe(v.string(),v.trim(),v.minLength(1),v.maxLength(1000),v.regex(/^[A-Za-z0-9_./+=-]+$/)),
  resumeOnly:v.optional(v.boolean(),false),
});
export type Project={id:string;name:string;link?:{type:string;org?:string;repo?:string;repoId?:number|string;productionBranch?:string}};
export type Environment={key:string;value?:string;target?:string[]};
export type EnvironmentItem={key:string;value:string;target:['production'];type:'plain'|'sensitive';visibility:'config'|'secret'};
export type InstallGateway={
  project:(id:string)=>Promise<Project>;
  env:(id:string)=>Promise<Environment[]>;
  githubOwner:(token:string)=>Promise<{login:string;scopes:string[]}>;
  ensureWorkflow:(token:string,repo:string,branch:string,scopes:string[])=>Promise<void>;
  create:(id:string,items:EnvironmentItem[])=>Promise<void>;
  deploy:(project:Project)=>Promise<{id:string}>;
};
export class InstallationError extends Error {
  readonly canRetryDeploy:boolean;
  constructor(message:string,canRetryDeploy=false){super(message);this.canRetryDeploy=canRetryDeploy;}
}
const REQUIRED=['GITHUB_OWNER','APP_REPO','GITHUB_TOKEN','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET','AUTH_SECRET','AXON_CODE_REPO','AXON_CODE_BRANCH'];
export async function automaticInstall(projectId:string,values:WizardValues,resumeOnly:boolean,gateway:InstallGateway) {
  // Project identity is injected by this deployment, never selected by the caller.
  const entries=environmentValues(values);
  const project=await gateway.project(projectId);
  if(project.id!==projectId || project.link?.type!=='github' || project.link.org?.toLowerCase()!==values.owner.trim().toLowerCase() || project.link.repo?.toLowerCase()!==values.codeRepo.trim().toLowerCase())throw new InstallationError('Bu yayın kendi GitHub kod repona bağlı olmalı. Proje ve hesap bilgilerini kontrol et.');
  if(project.link.productionBranch!==values.codeBranch.trim() || !Number.isSafeInteger(Number(project.link.repoId)) || Number(project.link.repoId)<1)throw new InstallationError('Vercel üretim dalı veya GitHub repo bağlantısı eşleşmiyor.');
  const existing=(await gateway.env(project.id)).filter(e=>e.target?.includes('production'));
  if(resumeOnly){
    if(REQUIRED.some(key=>!existing.some(e=>e.key===key)))throw new InstallationError('Ayarlar eksik. Kendi Vercel env ekranını kontrol et; yeniden yayın henüz başlatılmadı.');
    for(const key of ['GITHUB_OWNER','APP_REPO','AXON_CODE_REPO','AXON_CODE_BRANCH']){
      if(existing.find(e=>e.key===key)?.value?.toLowerCase()!==entries[key]!.toLowerCase())throw new InstallationError('Kaydedilmiş ayarlar bu kurulumla eşleşmiyor. Mevcut değerler değiştirilmedi.');
    }
  }else{
    if(existing.some(e=>Object.keys(entries).includes(e.key)))throw new InstallationError('Bu projede kurulum ayarları zaten var. Mevcut sırların üzerine yazılmadı. Vercel’den yeni yayın başlat veya kaydettiğin ayarları kontrol et.');
  }
  const user=await gateway.githubOwner(values.githubToken.trim());
  if(user.login.toLowerCase()!==values.owner.trim().toLowerCase())throw new InstallationError('GitHub tokenı girilen PT hesabına ait değil.');
  if(!['repo','delete_repo'].every(scope=>user.scopes.includes(scope)))throw new InstallationError('GitHub tokenında repo ve delete_repo izinleri olmalı.');
  await gateway.ensureWorkflow(values.githubToken.trim(),`${project.link.org}/${project.link.repo}`,project.link.productionBranch,user.scopes);
  if(!resumeOnly){
    const items:EnvironmentItem[]=Object.entries(entries).map(([key,value])=>({key,value,target:['production'],type:/TOKEN|SECRET|API_KEY/.test(key)?'sensitive':'plain',visibility:/TOKEN|SECRET|API_KEY/.test(key)?'secret':'config'}));
    await gateway.create(project.id,items);
  }
  try{return await gateway.deploy(project);}
  catch{throw new InstallationError('Ayarlar kaydedildi fakat yeni yayın başlatılamadı. Yeniden yayınlamayı dene veya kendi Vercel projeninden güncel ayarlarla Production yayını başlat.',true);}
}
