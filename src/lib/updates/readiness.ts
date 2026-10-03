export async function requireUpdateWorkflow(repo:string,fileExists:()=>Promise<boolean>,loadWorkflow:()=>Promise<{state:string}|null>) {
  if(!(await fileExists()))throw new Error(`${repo}: .github/workflows/axon-update.yml dosyası varsayılan dalda eksik. Otomatik güncelleme için bu dosyayı ana Axon Fit reposundan kendi kod repona ekle. Kurulum adımları: https://github.com/gokerlek/axon-fit/blob/main/docs/UPDATES.md`);
  const workflow=await loadWorkflow();
  if(!workflow)throw new Error(`${repo}: workflow dosyası var fakat GitHub Actions üzerinden erişilemiyor. Reponun Actions ekranını ve GITHUB_TOKEN anahtarının Actions erişimini kontrol et.`);
  if(workflow.state!=='active')throw new Error(`${repo}: Axon update workflow’u devre dışı. GitHub → Actions → Axon update → Enable workflow ile etkinleştir.`);
}
