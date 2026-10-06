import type { PoseLandmarker } from '@mediapipe/tasks-vision';
declare const Vision: typeof import('@mediapipe/tasks-vision');
const scope = self as unknown as {
  location: Location; importScripts(...urls:string[]):void;
  postMessage(data:unknown):void;
  onmessage: ((event: MessageEvent) => void) | null;
};
let detector: PoseLandmarker | null = null;
let initializing = false;
scope.onmessage=async ({data})=>{
  if(data.type==='init' && !initializing && !detector) {
    initializing=true;
    try {
      const base=new URL('/pose/',scope.location.href).href;
      scope.importScripts(`${base}runtime/1.0.1/vision_bundle.js`);
      const files=await Vision.FilesetResolver.forVisionTasks(`${base}runtime/1.0.1/wasm`,false);
      detector=await Vision.PoseLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:`${base}models/pose_landmarker_lite-v1.task`,delegate:'CPU'},
        runningMode:'VIDEO',numPoses:2,outputSegmentationMasks:false,
      });
      scope.postMessage({type:'ready'});
    } catch { scope.postMessage({type:'error'}); }
  } else if(data.type==='frame') {
    const bitmap=data.bitmap as ImageBitmap;
    try {
      if(!detector) throw new Error('not ready');
      const result=detector.detectForVideo(bitmap,data.timestamp);
      scope.postMessage({type:'result',timestamp:data.timestamp,width:bitmap.width,height:bitmap.height,poses:result.landmarks.map(p=>p.map(({x,y,visibility})=>({x,y,visibility})))});
    } catch {scope.postMessage({type:'error'});}
    finally {bitmap.close();}
  }
};
