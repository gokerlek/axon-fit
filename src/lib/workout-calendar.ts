import type {HistoryMonth,HistoryRow} from './session-history.ts';
export function shiftMonth(month:string,offset:number):string{
 const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);
}
export function calendarMonth(months:readonly HistoryMonth[],month:string){
 const start=new Date(`${month}-01T00:00:00Z`),length=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();
 const offset=(start.getUTCDay()+6)%7;
 const rows=months.find(item=>item.key===month)?.rows??[];
 const cells:Array<{date:string;day:number;rows:HistoryRow[]}|null>=Array.from({length:Math.ceil((offset+length)/7)*7},(_,index)=>{
  const day=index-offset+1;if(day<1 || day>length)return null;
  return {date:`${month}-${String(day).padStart(2,'0')}`,day,rows:rows.filter(row=>Number(row.dayOfMonth)===day)};
 });
 return {cells,days:cells.filter(cell=>cell?.rows.length).length,sessions:rows.length};
}
