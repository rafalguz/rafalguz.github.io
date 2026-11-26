'use strict';
const {isIPv4}=require('node:net');
// Fixed LAN endpoints; bounded launch, verify foreground, no continuous force or power-on.
module.exports=function createTvAutostart({haApi,host403,host404,host405,logger=console,autoPoll=true,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),requestImpl}){
  const app='RGKSISU232.Sisu23TV';
  const isSisuLan=host=>typeof host==='string'&&isIPv4(host)&&/^192\.168\.1\./.test(host)&&!/[.](?:0|255)$/.test(host);
  const lan403=isSisuLan(host403),lan404=isSisuLan(host404),lan405=isSisuLan(host405);
  const devices=Object.freeze({
    '401_salon':{host:'192.168.1.238',local:'media_player.401_salon_telewizor_ue55u8072huxxh'},
    '402_salon':{host:'192.168.1.210',local:'media_player.apartament_402_402_salon_telewizor_ue55u8072huxxh'},
    '402_sypialnia':{host:'192.168.1.230',local:'media_player.apartament_402_402_sypialnia_telewizja_ue55u8072huxxh'},
    ...(lan403?{'403_salon':{host:host403,local:'media_player.403_salon_403_salon_telewizor'}}:{}),
    ...(lan405?{'405_salon':{host:host405,local:'media_player.405_salon_405_salon_telewizor'}}:{}),
    ...(lan404?{'404_salon':{host:host404,local:'media_player.404_salon_404_salon_telewizor'}}:{})
  });
  const boot=now(),seen=new Map(),jobs=new Map(),polling=new Set(),ready=new Set();
  const read=id=>haApi('/states/'+id).then(x=>x?.state);
  const isOn=async tv=>(await read(tv.local))==='on';
  async function request(tv,method){
    if(requestImpl)return requestImpl(tv.host,method);
    const response=await fetch('http://'+tv.host+':8001/api/v2/applications/'+app,{method,signal:AbortSignal.timeout(4500),redirect:'error'});
    if(!response.ok)throw Error('Samsung HTTP '+response.status);
    return method==='GET'?response.json():null;
  }
  const visible=x=>x?.id===app&&x.running===true&&x.visible===true;
  function launch(name){
    if(!Object.hasOwn(devices,name))return Promise.resolve(false);
    if(jobs.has(name))return jobs.get(name);
    const tv=devices[name],deadline=now()+30000;
    const task=(async()=>{
      for(let i=0;i<3&&now()<deadline;i++){
        try{
          if(!await isOn(tv))return false;
          const status=await request(tv,'GET');
          if(visible(status)){logger.info('SISU autostart '+name+': verified visible');return true;}
          if(status?.id!==app)throw Error('Unexpected application status');
          if(now()>=deadline||!await isOn(tv))return false;
          await request(tv,'POST');
          await sleep(1800);
          if(visible(await request(tv,'GET'))&&await isOn(tv)){logger.info('SISU autostart '+name+': launched and verified visible');return true;}
        }catch(e){logger.warn('SISU autostart '+name+': attempt '+(i+1)+' failed: '+String(e?.message||'unavailable'));}
        if(i<2&&now()<deadline)await sleep(2000);
      }
      logger.warn('SISU autostart '+name+': app visibility not confirmed');
      return false;
    })().finally(()=>jobs.delete(name));
    jobs.set(name,task);
    return task;
  }
  async function pollOne(name){
    if(!Object.hasOwn(devices,name)||polling.has(name))return;
    polling.add(name);
    try{
      const signal=await read('input_button.sisu_autostart_'+name);
      if(!ready.has(name)){ready.add(name);logger.info('SISU autostart '+name+': signal ready');}
      const ts=Date.parse(signal);
      if(!Number.isFinite(ts)||ts<boot-2000||now()-ts>45000||ts>now()+5000||seen.get(name)===signal)return;
      seen.set(name,signal);
      await launch(name);
    }catch(e){if(ready.delete(name))logger.warn('SISU autostart '+name+': signal read unavailable');}
    finally{polling.delete(name);}
  }
  if(autoPoll){
    const tick=()=>{for(const name of Object.keys(devices))void pollOne(name);};
    tick();
    const timer=setInterval(tick,2500);timer.unref?.();
  }
  return {launch,pollOne};
};
