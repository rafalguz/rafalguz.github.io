'use strict';
// Two-stage arrival: verified guest code at main entrance prewarms the salon TV.
// A separate verified room-door event grants the welcome. No PIN is persisted/logged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAIN='lock.wejscie_glowne', APP='app:RGKSISU232.Sisu23TV';
const PILOT=Object.freeze({
  '401':{power:'media_player.401_salon_401_salon_telewizor',local:'media_player.401_salon_telewizor_ue55u8072huxxh',fallback:'media_player.401_salon_telewizor_smart'},
  '402':{power:'media_player.402_salon_402_salon_telewizor',local:'media_player.apartament_402_402_salon_telewizor_ue55u8072huxxh'},
  '403':{power:'media_player.403_salon_403_salon_telewizor',local:'media_player.403_salon_403_salon_telewizor'},
  '404':{power:'media_player.404_salon_404_salon_telewizor',local:'media_player.404_salon_404_salon_telewizor'},
  '405':{power:'media_player.405_salon_405_salon_telewizor',local:'media_player.405_salon_405_salon_telewizor'},
  '406':{power:'media_player.406_salon_406_salon_telewizor',local:'media_player.406_salon_406_salon_telewizor'}
});
const SIGNALS=Object.freeze({[MAIN]:'input_text.sisu_przyjazd_wejscie','lock.401':'input_text.sisu_przyjazd_401','lock.402':'input_text.sisu_przyjazd_402','lock.403':'input_text.sisu_przyjazd_403','lock.404':'input_text.sisu_przyjazd_404','lock.405':'input_text.sisu_przyjazd_405','lock.406':'input_text.sisu_przyjazd_406'});
const stamp=v=>Date.parse(String(v||''));
const pin=v=>String(v??'');
const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const activeCode=(c,t)=>c?.type==='period'&&c.expired===false&&stamp(c.start_date)<=t&&t<stamp(c.end_date);
function selectCode(rows,value,t){
  if(!Array.isArray(rows)||!value)return null;
  const matches=rows.filter(c=>pin(c.passcode)===value);
  if(matches.some(c=>c.type!=='period'))return null;
  const eligible=matches.filter(c=>activeCode(c,t));
  return eligible.length===1?eligible[0]:null;
}
const same=(a,b)=>!!a&&!!b&&pin(a.passcode)===pin(b.passcode)&&
  stamp(a.start_date)===stamp(b.start_date)&&stamp(a.end_date)===stamp(b.end_date)&&
  !!String(a.name||'').trim()&&String(a.name).trim()===String(b.name||'').trim();
function datesMatch(c,r){return !!r&&day(stamp(c.start_date))===r.arrival&&day(stamp(c.end_date))===r.departure;}
module.exports=function createArrival({dataDir,rooms,haApi,getStay,hasUniqueSalon,launchApp,logger=console,autoPoll=true,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
  const FILE=path.join(dataDir,'sisu-guest-arrival-v2.json');
  fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
  let db={seen:{},pending:{},completed:{},prepared:{}};
  if(fs.existsSync(FILE)){
    const o=JSON.parse(fs.readFileSync(FILE,'utf8'));
    if(!o||typeof o!=='object')throw Error('Invalid arrival state');
    for(const k of Object.keys(db))if(o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k]))db[k]=o[k];
  }
  function save(){const tmp=FILE+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(db),{mode:0o600});fs.renameSync(tmp,FILE)}
  const boot=now();
  const busy=new Set(),signals=new Map(),wakeJobs=new Map();
  async function service(domain,action,id,data={}){return haApi('/services/'+domain+'/'+action,'POST',{entity_id:id,...data});}
  async function readResponse(action,ids,extra={}){
    const x=await haApi('/services/ttlock/'+action+'?return_response','POST',{entity_id:ids,...extra});
    const data=x?.service_response;
    const key=action==='list_passcodes'?'passcodes':'records';
    if(!data||!data[key]||typeof data[key]!=='object')throw Error('TTLock response unavailable');
    for(const id of [].concat(ids))if(!Array.isArray(data[key][id]))throw Error('TTLock response incomplete');
    return data[key];
  }
  const codes=ids=>readResponse('list_passcodes',ids);
  async function recordList(id){return (await readResponse('list_records',id,{page_size:15,page_no:1}))[id];}
  async function state(id){return (await haApi('/states/'+id))?.state;}
  async function verifiedStay(room,code){
    if(!PILOT[room]||!hasUniqueSalon(room))return null;
    const s=await getStay(room);
    if(!s||!s.reservation||!datesMatch(code,s.reservation)||!/^[a-f0-9]{32}$/.test(s.key||'')||
      s.context?.stayStatus!=='active'||!s.context?.stayId)return null;
    return s;
  }
  async function wake(room,key,force=false){
    if(wakeJobs.has(room))return wakeJobs.get(room);
    const job=(async()=>{
      const p=PILOT[room];
      if(!p||db.completed[room]===key||!hasUniqueSalon(room))return false;
      if((await getStay(room))?.key!==key)return false;
      const recent=db.prepared[room];
      let powered=await state(p.local)==='on';
      if(powered&&!force&&recent?.key===key&&now()-recent.at<15*60000)return true;
      if(!powered){
        try{await service('media_player','turn_on',p.power)}catch{}
        if(p.fallback)try{await service('media_player','turn_on',p.fallback)}catch{}
        for(let i=0;i<18;i++){if(await state(p.local)==='on'){powered=true;break}await sleep(2000)}
        if(!powered)return false;
        await sleep(2000);
      }
      if(db.completed[room]===key||(await getStay(room))?.key!==key)return false;
      if(launchApp){if(!await launchApp(room))return false;}
      else await service('media_player','play_media',p.local,{media_content_type:'app',media_content_id:APP});
      db.prepared[room]={key,at:now()};save();
      logger.info('SISU arrival '+room+': TV preparation sent');
      return true;
    })().catch(()=>{logger.warn('SISU arrival '+room+': TV preparation failed');return false}).finally(()=>wakeJobs.delete(room));
    wakeJobs.set(room,job);return job;
  }
  function launch(room,key){void wake(room,key)}
  async function process(source,record){
    const t=stamp(record?.lock_date),value=pin(record?.keyboard_pwd);
    if(record?.record_type!=='PASSWORD_UNLOCK'||record?.success!==true||!value||!Number.isFinite(t)||Math.abs(now()-t)>120000)return false;
    let room,code;
    if(source===MAIN){
      const list=await codes(MAIN);
      const main=selectCode(list[MAIN],value,t);
      if(!main)return false;
      // Only a guest-code event causes a building-wide read. Incomplete/ambiguous mapping fails closed.
      const ids=rooms.map(n=>'lock.'+n);
      const all=await codes(ids);
      const hits=ids.filter(id=>all[id].some(c=>pin(c.passcode)===value&&
        (c.type!=='period'||activeCode(c,t))));
      if(hits.length!==1)return false;
      room=hits[0].slice(5);code=selectCode(all[hits[0]],value,t);
      if(!same(main,code))return false;
    }else{
      room=source.slice(5);
      if(!PILOT[room])return false;
      const list=await codes([source,MAIN]);
      code=selectCode(list[source],value,t);
      if(!same(code,selectCode(list[MAIN],value,t)))return false;
    }
    const stay=await verifiedStay(room,code);
    if(!stay||db.completed[room]===stay.key)return false;
    if(source===MAIN){
      logger.info('SISU arrival '+room+': verified main entrance, prewarm only');
      launch(room,stay.key);return true;
    }
    const old=db.pending[room];
    if(old?.key===stay.key&&now()-old.at<300000)return true;
    db.pending[room]={key:stay.key,at:now(),recordId:String(record.id)};
    save();
    logger.info('SISU arrival '+room+': verified room entrance, welcome armed');
    launch(room,stay.key);return true;
  }
  async function pollOne(source){
    if(busy.has(source))return;
    busy.add(source);
    try{
      const signal=await state(SIGNALS[source]);
      const ts=stamp(signal);
      if(!Number.isFinite(ts)||ts<boot-2000||now()-ts>90000||ts-now()>5000)return;
      const last=signals.get(source);
      if(last?.value===signal&&last.done)return;
      if(last?.value===signal&&now()-last.at<4500)return;
      signals.set(source,{value:signal,at:now(),done:false});
      const list=await recordList(source);
      const recent=list.filter(r=>{
        const st=stamp(r.server_date),lt=stamp(r.lock_date);
        return r.record_type==='PASSWORD_UNLOCK'&&r.success===true&&
          Number.isFinite(st)&&Number.isFinite(lt)&&Math.abs(st-ts)<=18000&&lt>=boot-3000&&now()-lt<=120000;
      }).sort((a,b)=>stamp(a.lock_date)-stamp(b.lock_date));
      if(!recent.length)return;
      const seen=Array.isArray(db.seen[source])?db.seen[source]:[];
      for(const r of recent){
        const id=String(r.id??'');
        if(!/^\d{1,24}$/.test(id)||seen.includes(id))continue;
        await process(source,r);
        seen.push(id);db.seen[source]=seen.slice(-100);save();
      }
      signals.set(source,{value:signal,at:now(),done:true});
    }catch{logger.warn('SISU arrival: temporary read failure ('+source+')')}
    finally{busy.delete(source)}
  }
  async function claim(d){
    const room=String(d?.room||'');
    if(!d||d.mode!=='room'||!d.welcomeSalon||!PILOT[room]||!hasUniqueSalon(room))return null;
    const p=db.pending[room];
    if(!p||now()-p.at>300000||now()<p.at||db.completed[room]===p.key)return null;
    const fresh=await getStay(room).catch(()=>null),ctx=d.welcomeContext;
    if(!fresh||fresh.key!==p.key||fresh.context?.stayStatus!=='active'||
       !ctx||ctx.room!==room||ctx.stayStatus!=='active'||ctx.stayId!==fresh.context.stayId||
       ctx.language!==fresh.context.language||!ctx.stayId)return null;
    if(db.completed[room]===p.key||db.pending[room]?.key!==p.key)return null;
    db.completed[room]=p.key;delete db.pending[room];save();
    logger.info('SISU arrival '+room+': verified welcome issued once');
    return {room,key:p.key,eventId:crypto.randomBytes(16).toString('hex')};
  }
  async function notify(ticket){
    try{
      // These rooms have welcome only: no alarm scheduler writes the verified stay helper.
      if(['403','404','405','406'].includes(ticket.room))await service('input_text','set_value','input_text.sisu_'+ticket.room+'_aktualny_pobyt',{value:ticket.key});
      await service('input_text','set_value','input_text.sisu_'+ticket.room+'_powitanie_gosc',{value:ticket.key});
    }
    catch{logger.warn('SISU arrival '+ticket.room+': light signal failed')}
  }
  async function recover(){
    for(const room of Object.keys(PILOT)){
      const p=db.pending[room];
      if(!p||now()-p.at>300000||now()-p.at<20000||wakeJobs.has(room)||db.completed[room]===p.key)continue;
      const prep=db.prepared[room];
      if(prep?.key===p.key&&now()-prep.at<30000)continue;
      void wake(room,p.key,true);
    }
  }
  async function probe(){await Promise.all([codes(MAIN),recordList(MAIN)]);logger.info('SISU arrival: TTLock read API ready')}
  if(autoPoll){
    let ready=false,probing=false;
    const tick=()=>{
      if(!ready){if(!probing){probing=true;void probe().then(()=>{ready=true}).catch(()=>logger.warn('SISU arrival: TTLock read API not ready')).finally(()=>{probing=false})}return;}
      for(const s of Object.keys(SIGNALS))void pollOne(s);
      void recover();
    };
    tick();const timer=setInterval(tick,2500);timer.unref?.();
  }
  return {claim,notify,process,pollOne,probe,waitForWake:room=>wakeJobs.get(room)||Promise.resolve(true)};
};
