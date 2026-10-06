'use client';
import { useEffect, useState, type RefObject } from 'react';
import { analyzePose, type Analysis, type Landmark, type PoseTask } from '@/lib/pose/geometry';
export type Detection = { state: 'loading'|'tracking'|'error'; poses: Landmark[][]; sampledAt:number; width:number; height:number; analysis:Analysis };
const initial:Detection={state:'loading',sampledAt:0,poses:[],width:0,height:0,analysis:{quality:'no_person',metrics:[]}};
export function usePoseDetection(videoRef:RefObject<HTMLVideoElement|null>,enabled:boolean,task:PoseTask,stream:MediaStream|null):Detection|null {
  const [detection,setDetection]=useState<{stream:MediaStream|null;task:PoseTask;value:Detection}|null>(null);
  useEffect(()=>{
    if(!enabled) return;
    let disposed=false,ready=false,busy=false,lastFrame=-1;
    let frameTimer:ReturnType<typeof setTimeout>;
    let watchdog:ReturnType<typeof setTimeout>;
    let staleTimer:ReturnType<typeof setTimeout>;
    let worker:Worker;
    const fail=()=>{
      if(disposed)return;
      ready=false;
      clearTimeout(frameTimer);clearTimeout(watchdog);clearTimeout(staleTimer);
      worker?.terminate();
      setDetection({stream,task,value:{...initial,state:'error'}});
    };
    try {worker=new Worker('/pose/pose-worker.js');} catch {fail();return;}
    const armWatchdog=()=>{clearTimeout(watchdog);watchdog=setTimeout(fail,30_000);};
    async function tick(){
      if(disposed || !ready) return;
      const video=videoRef.current;
      if(!busy && video && video.readyState>=2 && video.videoWidth>0 && video.currentTime!==lastFrame){
        busy=true;lastFrame=video.currentTime;
        try {
          const bitmap=await createImageBitmap(video);
          if(disposed || !ready){bitmap.close();return;}
          try{worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);armWatchdog();}
          catch{bitmap.close();fail();}
        } catch{fail();}
      }
      if(!disposed && ready)frameTimer=setTimeout(tick,120);
    }
    worker.onerror=fail;
    worker.onmessage=({data})=>{
      if(disposed)return;
      clearTimeout(watchdog);
      if(data.type==='ready') {ready=true;setDetection({stream,task,value:initial});void tick();}
      else if(data.type==='error')fail();
      else if(data.type==='result') {
        busy=false;
        clearTimeout(staleTimer);
        staleTimer=setTimeout(()=>{if(!disposed)setDetection({stream,task,value:{...initial,state:'tracking',analysis:{quality:'uncertain',metrics:[]}}});},Math.max(0,1500-(performance.now()-data.timestamp)));
        setDetection({stream,task,value:{state:'tracking',sampledAt:data.timestamp,poses:data.poses,width:data.width,height:data.height,analysis:performance.now()-data.timestamp>1500 ? {quality:'uncertain',metrics:[]} : analyzePose(data.poses,data.width,data.height,task)}});
      }
    };
    worker.postMessage({type:'init'});armWatchdog();
    return()=>{disposed=true;ready=false;clearTimeout(frameTimer);clearTimeout(watchdog);clearTimeout(staleTimer);worker.terminate();};
  },[enabled,task,videoRef,stream]);
  // Old results cannot appear after stopping/restarting or switching tasks.
  return enabled && detection?.stream===stream && detection.task===task?detection.value:null;
}
