import{NextResponse}from'next/server';
import{readAnySession}from'@/lib/session';
import{readClient}from'@/lib/clients';
import{canRecordHealth}from'@/lib/client-status';
import{updateHealth}from'@/lib/health';
import{withCameraMeasurement,withCameraTrash}from'@/lib/schemas/camera-measurement';
import{saveCameraRoute,trashCameraRoute}from'@/lib/pose/camera-route';
import{origin}from'@/lib/urls';
import{failed}from'@/lib/health-respond';
import{GithubError}from'@/lib/github/client';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
 const result=await saveCameraRoute({session:readAnySession,loadClient:async id=>(await readClient(id))?.client??null,allowed:client=>canRecordHealth(client,'screening'),now:()=>new Date(),save:async(id,entry)=>{
  await updateHealth(id,'screening',record=>{
   try{return withCameraMeasurement(record,entry);}catch(error){
    if(error instanceof Error && error.message==='CAMERA_ID_CONFLICT')throw new GithubError('Bu ölçüm kimliği farklı bir kayıt için kullanılmış. Yeniden ölçüm yap.',409);
    if(error instanceof Error && error.message==='CAMERA_LIMIT')throw new GithubError('Kamera ölçümü kayıt sınırına ulaşıldı.',409);
    throw error;
   }
  },'Kamera ölçümü kaydedildi');
 }},request.headers,origin(request),(await params).id,await request.json().catch(()=>null));
 return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
 }catch(error){return failed(error,'Kamera ölçümü kaydedilemedi.');}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const result=await trashCameraRoute({session:readAnySession,loadClient:async id=>(await readClient(id))?.client??null,allowed:client=>canRecordHealth(client,'screening'),now:()=>new Date(),trash:async(clientId,id,deleted,at)=>{
   await updateHealth(clientId,'screening',record=>{
    try{return withCameraTrash(record,id,deleted,at);}catch(error){
     if(error instanceof Error && error.message==='CAMERA_NOT_FOUND')throw new GithubError('Ölçüm bulunamadı. Sayfayı yenileyip tekrar dene.',404);
     throw error;
    }
   },deleted?'Kamera ölçümü çöp kutusuna taşındı':'Kamera ölçümü geri yüklendi');
  }},request.headers,origin(request),(await params).id,await request.json().catch(()=>null));
  return NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'no-store'}});
 }catch(error){return failed(error,'Ölçüm işlemi tamamlanamadı.');}
}
