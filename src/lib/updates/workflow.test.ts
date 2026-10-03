import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

// Exercise the shipped shell workflow against local Git repos, never user repos.
test('updater prepares an exact release tree, keeps workflows, and never advances production',()=>{
  const root=mkdtempSync(join(tmpdir(),'axon-workflow-'));
  const source=join(root,'upstream');const work=join(root,'work');const origin=join(root,'origin.git');
  const git=(cwd:string,...args:string[])=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  const init=(path:string)=>{mkdirSync(path);git(path,'init','-b','main');git(path,'config','user.name','Test Coach');git(path,'config','user.email','test@example.invalid');};
  try{
    init(source);mkdirSync(join(source,'.github/workflows'),{recursive:true});
    writeFileSync(join(source,'app.txt'),'release');
    writeFileSync(join(source,'axon-release.json'),JSON.stringify({version:'0.2.0',automaticUpdate:true,dataMigration:false}));
    writeFileSync(join(source,'.github/workflows/axon-update.yml'),'new workflow');
    git(source,'add','.');git(source,'commit','-m','release');git(source,'tag','v0.2.0');
    init(work);mkdirSync(join(work,'.github/workflows'),{recursive:true});
    writeFileSync(join(work,'app.txt'),'custom code');writeFileSync(join(work,'custom.txt'),'local feature');
    writeFileSync(join(work,'.github/workflows/axon-update.yml'),'old workflow');
    git(work,'add','.');git(work,'commit','-m','existing');const head=git(work,'rev-parse','HEAD');
    git(root,'clone','--bare',work,origin);git(work,'remote','add','origin',origin);
    const yaml=readFileSync(new URL('../../../.github/workflows/axon-update.yml',import.meta.url),'utf8');
    const script=yaml.split('        run: |\n')[1]!.split('\n').map(line=>line.slice(10)).join('\n').replace('https://github.com/gokerlek/axon-fit.git',source);
    const env={...process.env,RELEASE:'v0.2.0',EXPECTED_HEAD:head,DEFAULT_BRANCH:'main',GITHUB_REF_NAME:'main',REPOSITORY_OWNER:'coach',OWNER_ID:'1',GITHUB_RUN_ID:'42',GITHUB_STEP_SUMMARY:join(root,'summary')};
    const result=spawnSync('bash',['-c',script],{cwd:work,env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const staged=git(origin,'rev-parse','refs/heads/axon-update-42');
    assert.equal(git(origin,'rev-parse','refs/heads/main'),head);
    assert.equal(git(origin,'show',`${staged}:app.txt`),'release');
    assert.equal(git(origin,'show',`${staged}:.github/workflows/axon-update.yml`),'old workflow');
    assert.equal(git(origin,'rev-parse',`${staged}^`),head);
    assert.equal(git(origin,'show','-s','--format=%B',staged),'Axon update v0.2.0');
    assert.throws(()=>git(origin,'show',`${staged}:custom.txt`));
    const invalid=spawnSync('bash',['-c',script],{cwd:work,env:{...env,RELEASE:'main; touch injected'},encoding:'utf8'});
    assert.notEqual(invalid.status,0);
    const stale=spawnSync('bash',['-c',script],{cwd:work,env:{...env,EXPECTED_HEAD:'a'.repeat(40)},encoding:'utf8'});
    assert.notEqual(stale.status,0);
    assert.equal(git(origin,'rev-parse','refs/heads/main'),head);
  }finally{rmSync(root,{recursive:true,force:true});}
});
