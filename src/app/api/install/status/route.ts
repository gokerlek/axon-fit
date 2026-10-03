import {NextResponse} from 'next/server';
import {environmentStatus} from '@/lib/installation/readiness';
export const dynamic='force-dynamic';
export async function GET(){return NextResponse.json({status:environmentStatus(process.env)},{headers:{'Cache-Control':'no-store'}});}
