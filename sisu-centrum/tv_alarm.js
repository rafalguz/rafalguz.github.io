'use strict';
// SISU23 0.9.3: wake-up call for apartment 401.
// The TV has no HA or PMS credentials. A wake-up is tied to an opaque,
// server-HMAC reservation identity and is fail-closed on booking changes.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const IDS=Object.freeze({
 due:'input_datetime.sisu_401_budzik_termin',
 active:'input_boolean.sisu_401_budzik_aktywny',
 ringing:'input_boolean.sisu_401_budzik_dzwoni',
 scheduledStay:'input_text.sisu_401_budzik_pobyt',
 currentStay:'input_text.sisu_401_aktualny_pobyt'
});
const TIME=/^([01]\d|2[0-3]):([0-5]\d)$/;
const TZ='Europe/Warsaw';
const localFormatter=new Intl.DateTimeFormat('en-GB',{
 timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
function localStamp(date){
 const parts={};
 for(const p of localFormatter.formatToParts(date))if(p.type!=='literal')parts[p.type]=p.value;
 return parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute;
}
function plannedAt(time,checkout,now=Date.now()){
 if(!TIME.test(time))throw Object.assign(Error('Nieprawidłowa godzina'),{status:400});
 if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(checkout))
   throw Object.assign(Error('Nie ustalono wymeldowania'),{status:409});
 const start=Math.ceil((now+15000)/60000)*60000;
 const limit=now+48*3600000;
 for(let ms=start;ms<limit;ms+=60000){
   const local=localStamp(new Date(ms));
   if(local>=checkout)break;
   if(local.slice(11)===time)return new Date(ms).toISOString();
 }
 throw Object.assign(Error('Ta godzina wypada po wymeldowaniu'),{status:409});
}
module.exports=function createTvAlarm({dataDir,send,jsonBody,resolveDevice,haApi,hotelExpert,logger=console,autoPoll=true}){
 const DB=path.join(dataDir,'sisu-401-wakeup.json');
 const SECRET=path.join(dataDir,'sisu-401-wakeup-key');
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 try{fs.writeFileSync(SECRET,crypto.randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
 catch(e){if(e.code!=='EEXIST')throw e;}
 const key=fs.readFileSync(SECRET,'utf8').trim();
 if(!/^[0-9a-f]{64}$/.test(key))throw Error('Invalid SISU alarm HMAC key');
 function safeLoad(){
   if(!fs.existsSync(DB))return {current:null,alarm:null};
   const s=JSON.parse(fs.readFileSync(DB,'utf8'));
   if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Invalid SISU wake-up database');
   return {current:typeof s.current==='string'?s.current:null,
     alarm:s.alarm&&typeof s.alarm==='object'?s.alarm:null};
 }
 let db=safeLoad();
 let chain=Promise.resolve();
 function serialize(fn){
   const work=chain.then(fn,fn);
   chain=work.catch(()=>{});
   return work;
 }
 function persist(){
   const tmp=DB+'.tmp-'+process.pid;
   fs.writeFileSync(tmp,JSON.stringify(db),{mode:0o600});
   fs.renameSync(tmp,DB);
 }
 function stayKey(reservation){
   const raw=String(reservation&&reservation.id||'');
   if(!/^[a-zA-Z0-9_-]{1,100}$/.test(raw))throw Object.assign(Error('Brak identyfikatora rezerwacji'),{status:503});
   return crypto.createHmac('sha256',key).update('SISU401:'+raw).digest('hex').slice(0,32);
 }
 async function action(domain,service,entity,data={}){
   return haApi('/services/'+domain+'/'+service,'POST',{entity_id:entity,...data});
 }
 async function haStates(){
   const list=await haApi('/states');
   if(!Array.isArray(list))throw Object.assign(Error('Błąd odczytu Home Assistant'),{status:503});
   return new Map(list.map(x=>[x.entity_id,x.state]));
 }
 async function stop(){
   // Clear armed flag first: no time trigger may start a stale wake-up.
   await action('input_boolean','turn_off',IDS.active);
   await action('input_boolean','turn_off',IDS.ringing);
   await action('input_text','set_value',IDS.scheduledStay,{value:''});
   db.alarm=null;
   persist();
 }
 async function reconcile(){
   let booking;
   try{booking=await hotelExpert.alarmGuest(401);}
   catch(e){
     // Fail closed: inability to verify the booking must not wake a former guest.
     if(db.current||db.alarm){
       await stop();
       await action('input_text','set_value',IDS.currentStay,{value:''});
       db.current='';persist();
     }
     throw e;
   }
   const reservation=booking&&booking.reservation||null;
   const current=reservation?stayKey(reservation):'';
   if(db.current!==current){
     await stop();
     await action('input_text','set_value',IDS.currentStay,{value:current});
     db.current=current;
     persist();
   }
   if(db.alarm){
     if(!current||db.alarm.stay!==current){
       await stop();
     }else{
       const checkout=reservation.departure+' '+reservation.departureTime;
       const due=Date.parse(db.alarm.scheduledFor);
       if(!Number.isFinite(due)||localStamp(new Date(due))>=checkout||Date.now()>due+20*60000){
         await stop();
       }
     }
   }
   return {current,reservation};
 }
 async function snapshot(current){
   const states=await haStates();
   const a=db.alarm;
   const mine=!!(a&&current&&a.stay===current);
   const ringing=mine&&states.get(IDS.ringing)==='on'&&a.status!=='done';
   const active=mine&&states.get(IDS.active)==='on'&&a.status==='armed'&&Date.parse(a.scheduledFor)>Date.now();
   return {ok:true,room:'401',active,ringing,time:mine?a.time:'',
     scheduledFor:mine?a.scheduledFor:''};
 }
 const attempts=new Map();
 function quota(device){
   const id=String(device.id||'401'),now=Date.now(),a=attempts.get(id);
   const rec=a&&now-a.since<60000?a:{since:now,n:0};
   rec.n++;
   attempts.set(id,rec);
   return rec.n<=20;
 }
 async function handle(req,res,p){
   if(p!=='/api/tv/alarm'&&p!=='/api/tv/alarm/ack')return false;
   const d=resolveDevice(req);
   if(!d){send(res,401,{ok:false,error:'Telewizor nie jest sparowany'});return true;}
   if(d.mode!=='room'||String(d.room)!=='401'){
     send(res,403,{ok:false,error:'Budzik nie jest skonfigurowany dla tego apartamentu'});return true;
   }
   if(!['GET','PUT','DELETE','POST'].includes(req.method)){
     send(res,405,{ok:false,error:'Niedozwolona metoda'});return true;
   }
   if(req.method!=='GET'&&!quota(d)){
     send(res,429,{ok:false,error:'Zbyt wiele prób'});return true;
   }
   await serialize(async()=>{
     try{
       const ctx=await reconcile();
       if(req.method==='GET'&&p==='/api/tv/alarm'){
         send(res,200,await snapshot(ctx.current));return;
       }
       if(!ctx.current||!ctx.reservation){
         send(res,409,{ok:false,error:'Brak aktywnego pobytu'});return;
       }
       if(req.method==='PUT'&&p==='/api/tv/alarm'){
         const body=await jsonBody(req);
         const requested=String(body.time||'');
         const due=plannedAt(requested,ctx.reservation.departure+' '+ctx.reservation.departureTime);
         await action('input_boolean','turn_off',IDS.active);
         await action('input_boolean','turn_off',IDS.ringing);
         await action('input_text','set_value',IDS.scheduledStay,{value:ctx.current});
         const local=localStamp(new Date(due));
         await action('input_datetime','set_datetime',IDS.due,{datetime:local+':00'});
         await action('input_boolean','turn_on',IDS.active);
         db.alarm={stay:ctx.current,time:requested,scheduledFor:due,status:'armed'};
         persist();
         send(res,200,await snapshot(ctx.current));return;
       }
       if(req.method==='DELETE'&&p==='/api/tv/alarm'){
         await stop();
         send(res,200,await snapshot(ctx.current));return;
       }
       if(req.method==='POST'&&p==='/api/tv/alarm/ack'){
         await jsonBody(req);
         await action('input_boolean','turn_off',IDS.ringing);
         if(db.alarm&&db.alarm.stay===ctx.current){
           db.alarm.status='done';persist();
         }
         send(res,200,await snapshot(ctx.current));return;
       }
       send(res,405,{ok:false,error:'Niedozwolona metoda'});
     }catch(e){
       logger.warn('SISU alarm 401 request error: '+(e&&e.message||'unknown'));
       send(res,Number.isInteger(e.status)?e.status:503,{ok:false,error:e.status?e.message:'Budzik chwilowo niedostępny'});
     }
   });
   return true;
 }
 let lastWakeLaunch=0;
 async function openWakeApp(current){
   if(!db.alarm||!current||db.alarm.stay!==current||db.alarm.status!=='armed')return;
   const at=Date.parse(db.alarm.scheduledFor),now=Date.now();
   if(!Number.isFinite(at)||now<at-2000||now>at+10*60000)return;
   if(now-lastWakeLaunch<45000)return;
   const states=await haStates();
   if(states.get(IDS.ringing)!=='on')return;
   lastWakeLaunch=now;
   // HA already powers the TV on. This LAN fallback starts SISU if HA's
   // Samsung app-launch service is unsupported on this specific model.
   const url='http://192.168.1.238:8001/api/v2/applications/RGKSISU232.Sisu23TV';
   try{
     const check=await fetch(url,{method:'GET',signal:AbortSignal.timeout(4500),redirect:'error'});
     if(!check.ok)return;
     const app=await check.json();
     if(app.running===true&&app.visible===true)return;
     const launched=await fetch(url,{method:'POST',signal:AbortSignal.timeout(4500),redirect:'error'});
     if(!launched.ok)logger.warn('SISU 401 alarm: TV launch HTTP '+launched.status);
   }catch(e){logger.warn('SISU 401 alarm: TV launch retry failed');}
 }
 async function maintenance(){
   try{const ctx=await reconcile();await openWakeApp(ctx.current);}
   catch(e){logger.warn('SISU alarm 401 PMS reconciliation unavailable: '+(e&&e.message||'unknown'));}
 }
 if(autoPoll){
   const timer=setInterval(()=>{void serialize(maintenance);},30000);
   timer.unref?.();
   setTimeout(()=>{void serialize(maintenance);},1800).unref?.();
 }
 return {handle,maintenance:()=>serialize(maintenance),plannedAt,localStamp};
};
module.exports.plannedAt=plannedAt;
module.exports.localStamp=localStamp;
