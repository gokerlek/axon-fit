/** Server records override stale saved drafts; confirmed local trash edits bridge refresh latency. */
export function authoritativeRecords<T extends {id:string;deletedAt?:string}>(server:T[],drafts:T[],changes:Record<string,boolean>={}):T[]{
 const records=new Map(drafts.map(record=>[record.id,record]));
 server.forEach(record=>records.set(record.id,record));
 return [...records.values()].map(record=>record.id in changes?{...record,deletedAt:changes[record.id]?(record.deletedAt??new Date().toISOString()):undefined}:record);
}
