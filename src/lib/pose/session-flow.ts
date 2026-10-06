import type {PoseTask} from './protocols.ts';
export type SessionStage='list'|'prepare'|'capture'|'result'|'complete';
export type SessionFlow={queue:PoseTask[];index:number;stage:SessionStage;results:Partial<Record<PoseTask,{id:string;saved:boolean}>>;skipped:PoseTask[]};
export const initialSession:SessionFlow={queue:[],index:0,stage:'list',results:{},skipped:[]};
export type SessionEvent={type:'start';tasks:PoseTask[]}|{type:'result';id:string}|{type:'saved';id:string}|{type:'list'|'resume'|'capture'|'repeat'|'next'|'skip'|'finish'};
export function sessionReducer(state:SessionFlow,event:SessionEvent):SessionFlow{
 const task=state.queue[state.index];
 switch(event.type){
  case 'start':return event.tasks.length?{...initialSession,queue:[...new Set(event.tasks)],stage:'prepare'}:state;
  case 'result':return task?{...state,stage:'result',results:{...state.results,[task]:{id:event.id,saved:false}}}:state;
  case 'saved':return {...state,results:Object.fromEntries(Object.entries(state.results).map(([key,value])=>[key,value?.id===event.id?{...value,saved:true}:value]))};
  case 'list':return {...state,stage:'list'};
  case 'resume':{
   const index=state.queue.findIndex(id=>!state.results[id] && !state.skipped.includes(id));
   return {...state,index:index<0?state.index:index,stage:index<0?'complete':'prepare'};
  }
  case 'capture':return task?{...state,stage:'capture'}:state;
  case 'repeat':return task?{...state,stage:'prepare'}:state;
  case 'finish':return {...state,stage:'complete'};
  case 'skip':case 'next':return {...state,index:state.index+1<state.queue.length?state.index+1:state.index,stage:state.index+1<state.queue.length?'prepare':'complete',skipped:event.type==='skip' && task?[...new Set([...state.skipped,task])]:state.skipped};
 }
}
