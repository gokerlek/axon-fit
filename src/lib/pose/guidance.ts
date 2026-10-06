import {PROTOCOLS,type PoseTask} from './protocols.ts';
export const MOVEMENT_CUES:Record<PoseTask,{start:string;away:string;back:string}>={
 front:{start:'Kameraya dön; rahat ve sabit dur.',away:'Rahat duruşunu koru.',back:'Rahat duruşunu koru.'},
 side:{start:'Yan dön; rahat ve sabit dur.',away:'Rahat duruşunu koru.',back:'Rahat duruşunu koru.'},
 squat:{start:'Yan dön; ayakta rahat başlangıç konumunu al.',away:'Rahat sınırında yavaşça çömel.',back:'Yavaşça başlangıç konumuna dön.'},
 knee:{start:'Yan dön; kameraya yakın bacağını rahat başlangıç konumuna getir.',away:'Kameraya yakın dizini yavaşça bük.',back:'Bacağını rahat başlangıç konumuna geri getir.'},
 hinge:{start:'Yan dön; ayakta başlangıç konumunu al.',away:'PT’nin gösterdiği gibi kalçandan yavaşça eğil.',back:'Yavaşça başlangıç konumuna dön.'},
 shoulder_flexion:{start:'Yan dön; kameraya yakın kolunu aşağıda rahat tut.',away:'Kolunu önden rahat sınırına doğru kaldır.',back:'Kolunu yavaşça aşağı indir.'},
 shoulder_abduction:{start:'Kameraya dön; iki kolunu aşağıda rahat tut.',away:'Kollarını yanlardan rahat sınırına doğru kaldır.',back:'Kollarını yavaşça aşağı indir.'},
 elbow:{start:'Yan dön; kameraya yakın kolunu rahat başlangıç konumunda tut.',away:'Dirseğini yavaşça bük; üst kolunu sabit tut.',back:'Kolunu rahat başlangıç konumuna geri getir.'},
 sit_stand:{start:'Sandalyenin önünde ayakta başla; kameraya yan dön.',away:'Güvenli sandalyeye yavaşça otur.',back:'Yavaşça ayağa kalkıp başlangıca dön.'},
};
export const METRIC_EXPLANATIONS:Record<string,string>={
 shoulder_tilt:'İki omuz noktasını birleştiren çizginin görüntünün yatayına göre eğimi.',
 hip_tilt:'İki kalça noktasını birleştiren çizginin görüntünün yatayına göre eğimi.',
 trunk_tilt:'Omuz–kalça ekseninin görüntünün dikeyine göre eğimi.',
 near_knee:'Kalça, diz ve ayak bileği noktaları arasındaki diz iç açısı.',
 near_hip:'Omuz, kalça ve diz noktaları arasındaki gövde–bacak iç açısı.',
 near_shoulder:'Üst kolun gövdeye göre kaldırılma açısı; yalnız omuz eklemini izole etmez.',
 near_elbow:'Omuz, dirsek ve el bileği noktaları arasındaki dirsek iç açısı.',
 left_shoulder:'Sol üst kolun gövdeye göre kaldırılma açısı.',
 right_shoulder:'Sağ üst kolun gövdeye göre kaldırılma açısı.',
};
export function measurementMeaning(task:PoseTask):string{
 return PROTOCOLS[task].dynamic?'Değer, tamamlanan tekrarların her birindeki en büyük ve en küçük açı farklarının ortancasıdır. Anlık eklem açısı değildir.':'Değer, sabit duruş boyunca alınan net örneklerin ortanca açısıdır.';
}
