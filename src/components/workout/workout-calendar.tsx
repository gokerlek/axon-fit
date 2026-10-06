'use client';
import {useId,useState} from 'react';
import Link from 'next/link';
import {CaretLeft,CaretRight,Trophy} from '@phosphor-icons/react';
import {Button} from '@/components/ui/button';
import {calendarMonth,shiftMonth} from '@/lib/workout-calendar';
import type {HistoryMonth} from '@/lib/session-history';
import {cn} from '@/lib/utils';
const WEEKDAYS=['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
const label=(date:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('tr-TR',{...options,timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`));
export function WorkoutCalendar({months,today,hrefPrefix='/me/gecmis'}:{months:HistoryMonth[];today:string;hrefPrefix?:string}){
 const id=useId();const [month,setMonth]=useState(today.slice(0,7));const [selected,setSelected]=useState<string|null>(null);
 const data=calendarMonth(months,month),picked=data.cells.find(cell=>cell?.date===selected);
 const earliest=months.reduce((min,item)=>item.key<min?item.key:min,today.slice(0,7));
 function move(offset:number){setMonth(value=>shiftMonth(value,offset));setSelected(null);}
 return <section aria-labelledby={`${id}-title`} className="rounded-xl border bg-card p-4 sm:p-5">
  <div className="flex items-center justify-between gap-2"><div><h2 id={`${id}-title`} className="font-heading text-lg font-semibold">Antrenman takvimi</h2><p className="text-xs text-muted-foreground">Kaydedilen günler · Güne dokunarak ayrıntıyı aç.</p></div><Button variant="ghost" size="sm" disabled={month===today.slice(0,7)} onClick={()=>{setMonth(today.slice(0,7));setSelected(today);}}>Bu ay</Button></div>
  <div className="mt-4 flex items-center justify-between gap-2"><Button variant="ghost" className="size-11" aria-label="Önceki ay" disabled={month<=earliest} onClick={()=>move(-1)}><CaretLeft/></Button><h3 className="font-medium" aria-live="polite">{label(`${month}-01`,{month:'long',year:'numeric'})}</h3><Button variant="ghost" className="size-11" aria-label="Sonraki ay" disabled={month>=today.slice(0,7)} onClick={()=>move(1)}><CaretRight/></Button></div>
  <div className="mt-2 grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden>{WEEKDAYS.map(day=><span className="py-2" key={day}>{day}</span>)}</div>
  <div className="grid grid-cols-7 gap-1" role="group" aria-label="Ayın günleri">{data.cells.map((cell,index)=>cell?<button key={cell.date} type="button" aria-label={`${label(cell.date,{day:'numeric',month:'long',year:'numeric',weekday:'long'})} · ${cell.rows.length?`${cell.rows.length} antrenman`:'kayıt yok'}${cell.date===today?' · bugün':''}`} aria-pressed={selected===cell.date} aria-controls={`${id}-details`} onClick={()=>setSelected(cell.date)} className={cn('relative flex min-h-11 flex-col items-center justify-center rounded-lg text-sm tabular-nums outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',cell.rows.length>0 && 'bg-primary/10 font-semibold text-primary-text',cell.date===today && 'ring-1 ring-primary/50',selected===cell.date && 'bg-primary text-primary-foreground hover:bg-primary/90')}><span>{cell.day}</span><span aria-hidden className={cn('mt-1 h-1 w-1 rounded-full',cell.rows.length>0?'bg-current':'bg-transparent')}/></button>:<span key={`blank-${index}`} aria-hidden/>)}</div>
  <p className="mt-4 text-sm text-muted-foreground">Bu ay {data.days} gün · {data.sessions} antrenman. Dinlenme günleri de sürecin bir parçası.</p>
  <div id={`${id}-details`} className="mt-4 border-t pt-4" aria-live="polite">{picked?<><h3 className="text-sm font-medium">{label(picked.date,{day:'numeric',month:'long'})}</h3>{picked.rows.length?<ul className="mt-2 flex flex-col gap-2">{picked.rows.map(row=><li key={row.id}><Link href={`${hrefPrefix}/${row.id}`} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><span className="min-w-0"><span className="block text-sm font-medium">{row.title}{row.unfinished?' · erken bitirildi':''}</span><span className="block text-xs text-muted-foreground">{row.meta}</span></span>{row.prs>0?<span className="flex shrink-0 items-center gap-1 text-xs text-primary-text"><Trophy aria-hidden/>{row.prs} rekor</span>:<CaretRight aria-hidden/>}</Link></li>)}</ul>:<p className="mt-2 text-sm text-muted-foreground">Bu gün için kaydedilmiş antrenman yok.</p>}</>:<p className="text-sm text-muted-foreground">İşaretli bir günü seçerek antrenmanlarını görebilirsin.</p>}</div>
 </section>;
}
