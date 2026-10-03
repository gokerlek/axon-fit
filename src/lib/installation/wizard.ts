import * as v from 'valibot';

const secret = v.pipe(v.string(),v.trim(),v.minLength(1,'Bu alanı doldur.'),v.maxLength(1000),v.regex(/^[A-Za-z0-9_./+=-]+$/,'Anahtarın tamamını boşluksuz yapıştır.'));
export const githubTokenSchema=secret;
const repository = v.pipe(v.string(),v.trim(),v.regex(/^[\w.-]{1,100}$/,'Geçerli bir repo adı yaz.'),v.check(name=>!['.','..'].includes(name),'Geçerli bir repo adı yaz.'));
const accountSchema = v.object({
  owner:v.pipe(v.string(),v.trim(),v.regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i,'GitHub kullanıcı adını yaz.')),
  codeRepo:repository,
  appRepo:v.pipe(repository,v.check(name=>!name.toLowerCase().startsWith('client-'),'Veri reposu client- ile başlamamalı.')),
  codeBranch:v.pipe(v.string(),v.trim(),v.minLength(1,'Üretim dalını yaz.'),v.maxLength(250),v.regex(/^[\w./-]+$/,'Geçerli bir dal adı yaz.')),
  githubToken:secret,
});
const oauthSchema=v.object({clientId:secret,clientSecret:secret});
const optionalSchema=v.object({geminiKey:v.optional(v.union([v.literal(''),secret]),'')});
export const wizardSchema=v.object({...accountSchema.entries,...oauthSchema.entries,...optionalSchema.entries,authSecret:v.pipe(secret,v.minLength(32))});
const schema=wizardSchema;
export type WizardValues=v.InferInput<typeof schema>;
export type WizardErrors=Partial<Record<keyof WizardValues,string>>;
export function initialWizardValues(owner:string,codeRepo:string):WizardValues {
  return {owner,codeRepo,codeBranch:'main',appRepo:codeRepo.toLowerCase()==='axon-fit-data'?'axon-fit-private-data':'axon-fit-data',githubToken:'',clientId:'',clientSecret:'',geminiKey:'',authSecret:''};
}
function fieldErrors(issues:v.BaseIssue<unknown>[]):WizardErrors {
  const errors:WizardErrors={};
  for(const issue of issues){const key=issue.path?.[0]?.key as keyof WizardValues|undefined;if(key && !errors[key])errors[key]=issue.message;}
  return errors;
}
export function validateStep(step:number,values:WizardValues):WizardErrors {
  const selected=step===0?accountSchema:step===1?oauthSchema:step===2?optionalSchema:schema;
  const parsed=v.safeParse(selected,values);
  const errors=parsed.success?{}:fieldErrors(parsed.issues);
  if(step===0 || step===3){if(values.appRepo.trim().toLowerCase()===values.codeRepo.trim().toLowerCase())errors.appRepo='Veri reposu kod reposundan farklı olmalı.';}
  return errors;
}
export function environmentValues(input:WizardValues):Record<string,string> {
  const errors=validateStep(3,input);
  if(Object.keys(errors).length)throw new Error('Önce gerekli bilgileri tamamla.');
  const values=v.parse(schema,input);
  const entries:Record<string,string>={
    GITHUB_OWNER:values.owner,APP_REPO:values.appRepo,GITHUB_TOKEN:values.githubToken,
    GITHUB_CLIENT_ID:values.clientId,GITHUB_CLIENT_SECRET:values.clientSecret,AUTH_SECRET:values.authSecret,
    AXON_CODE_REPO:`${values.owner}/${values.codeRepo}`,AXON_CODE_BRANCH:values.codeBranch,
  };
  if(values.geminiKey)entries.GEMINI_API_KEY=values.geminiKey;
  return entries;
}
export function environmentFile(input:WizardValues):string {
  return '# Axon Fit — kendi Vercel projenin Production ortamına ekle.\n# Bu dosya sır içerir; GitHub reposuna ekleme.\n'+Object.entries(environmentValues(input)).map(([key,value])=>`${key}=${value}`).join('\n')+'\n';
}
export function authSecret(bytes:Uint8Array):string {
  if(bytes.length!==32)throw new Error('32 bayt rastgele veri gerekir.');
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
