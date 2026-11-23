'use strict';
// Room-scoped device allowlist. The TV receives only safe ids/names/states; HA entity ids stay server-side.
// Add lights for another apartment here (or move them to the management UI later) — the TV UI needs no rebuild.
// Pilot only: room 401. Select switches only when their entity_id clearly represents lighting.
// Additional 401 lighting relays named with the same convention become visible automatically.
const LIGHT_NAMES=Object.freeze({
  salon_swiatlo:['salon','Salon'],
  salon_nad_stolem_swiatlo:['stol','Nad stołem'],
  przedpokoj_oswietlenie:['kuchnia','Przedpokój'],
  lazienka_oswietlenie:['lazienka','Łazienka'],
  sypialnia_swiatlo:['sypialnia','Sypialnia']
});
function roomLights(room,states){
  if(String(room)!=='401'||!states)return [];
  return [...states.keys()].filter(entity=>
    /^switch\.401_[a-z0-9_]+_(swiatlo|oswietlenie)$/.test(entity)
  ).map(entity=>{
    const slug=entity.slice('switch.401_'.length),def=LIGHT_NAMES[slug];
    return {id:def?def[0]:slug,name:def?def[1]:slug.replace(/_(swiatlo|oswietlenie)$/,'').replace(/_/g,' '),entity};
  }).sort((a,b)=>a.name.localeCompare(b.name,'pl'));
}
function roomLight(room,id,states){return roomLights(room,states).find(x=>x.id===id)||null;}
const CLIMATE=Object.freeze({
  ac:'climate.401_apartament',
  salon:'climate.401_salon_termostat',
  sypialnia:'climate.401_sypialnia_termostat',
  lazienka:'climate.401_lazienka_termostat'
});
const WINDOWS=Object.freeze({
  salon:['binary_sensor.401_salon_okno_prawe_kontaktron_1_contact','binary_sensor.401_salon_okno_prawe_kontaktron_2_contact',
    'binary_sensor.401_salon_okno_lewe_kontaktron_1_contact','binary_sensor.401_salon_okno_lewe_kontaktron_2_contact'],
  sypialnia:['binary_sensor.401_sypialnia_okno_dachowe_kontaktron_1_contact']
});
const BASE=Object.freeze({ac:22,salon:22,sypialnia:22,lazienka:22});
const RANGE=Object.freeze({ac:[21,23],salon:[19,23],sypialnia:[19,23],lazienka:[19,23]});
const ALL_WINDOWS=Object.freeze([...WINDOWS.salon,...WINDOWS.sypialnia]);
function seasonalMode(){const m=new Date().getMonth()+1;return m>=5&&m<=9?'cool':'heat';}
function seasonLabel(){return seasonalMode()==='cool'?'Lato':'Zima';}
const FANS=new Set(['auto','1','2','3','4','5']);
function err(status,message){return Object.assign(new Error(message),{status});}
function validTarget(value,zone){
  if(typeof value!=='number'||!Number.isFinite(value))return null;
  const limits=RANGE[zone];
  if(!limits||value<limits[0]||value>limits[1]||Math.abs(value*2-Math.round(value*2))>1e-7)return null;
  return value;
}
function usable(s){return !!s && !['unavailable','unknown'].includes(s.state);}
function numeric(v){return typeof v==='number' && Number.isFinite(v) ? v : null;}
module.exports=function createTvComfort({haApi,send,jsonBody,resolveDevice,audit}){
  const attempts=new Map();
  function device(req,res){
    const tv=resolveDevice(req);
    if(!tv){send(res,401,{error:'Telewizor nie jest sparowany'});return null;}
    if(tv.mode!=='room'){
      send(res,403,{error:'Sterowanie dostępne wyłącznie w przypisanym apartamencie'});return null;
    }
    const room=String(tv.room);
    if(room!=='401'){
      send(res,403,{error:'Urządzenia tego apartamentu nie są jeszcze skonfigurowane'});return null;
    }
    return tv;
  }
  function limit(tv){
    const key=String(tv.id||tv.room),now=Date.now(),p=attempts.get(key);
    const item=(!p||now-p.since>=60000)?{since:now,n:1}:{since:p.since,n:p.n+1};
    attempts.set(key,item);
    if(attempts.size>250)for(const [k,v] of attempts)if(now-v.since>=60000)attempts.delete(k);
    return item.n<=45;
  }
  async function load(){
    const list=await haApi('/states');
    if(!Array.isArray(list))throw err(502,'Nie można odczytać stanów urządzeń');
    return new Map(list.map(s=>[s.entity_id,s]));
  }
  function anyWindowNotClosed(states,ids){
    return ids.some(id=>states.get(id)?.state!=='off');
  }
  function climateState(states,zone){
    const s=states.get(CLIMATE[zone]);
    return {
      available:usable(s),
      mode:usable(s)?s.state:'unavailable',
      current:numeric(s?.attributes?.current_temperature),
      target:numeric(s?.attributes?.temperature),
      base:BASE[zone],min:RANGE[zone][0],max:RANGE[zone][1],
      fan:typeof s?.attributes?.fan_mode==='string'?s.attributes.fan_mode:null
    };
  }
  function stateView(states,room){
    const lights={},lightList=[];
    for(const item of roomLights(room,states)){
      const s=states.get(item.entity),available=usable(s),on=available&&s.state==='on';
      lights[item.id]={available,on,name:item.name};
      lightList.push({id:item.id,name:item.name,available,on});
    }
    const climate={};
    if(String(room)==='401')for(const zone of Object.keys(CLIMATE))climate[zone]=climateState(states,zone);
    return {
      ok:true,room:String(room),mode:'room',checkedAt:new Date().toISOString(),
      seasonal:{season:seasonLabel(),mode:seasonalMode()},lights,lightList,climate,
      windows:String(room)==='401'?{acBlocked:anyWindowNotClosed(states,ALL_WINDOWS),
        salonOpen:anyWindowNotClosed(states,WINDOWS.salon),
        sypialniaOpen:anyWindowNotClosed(states,WINDOWS.sypialnia)}:
        {acBlocked:false,salonOpen:false,sypialniaOpen:false}
    };
  }
  async function action(room,body,states){
    const kind=body.kind,zone=body.zone,value=body.value;
    let domain,service,entity,data={};
    if(kind==='heating_target'){
      if(String(room)!=='401')throw err(403,'Ogrzewanie tego apartamentu nie jest jeszcze skonfigurowane');
      const n=validTarget(value,'salon');
      if(n===null)throw err(400,'Nastawa ogrzewania musi być w zakresie 19–23°C co 0,5°C');
      const applied=[];
      for(const z of ['salon','sypialnia','lazienka']){
        const id=CLIMATE[z];
        if(!usable(states.get(id)))continue;
        if(WINDOWS[z]&&anyWindowNotClosed(states,WINDOWS[z]))continue;
        await haApi('/services/climate/set_temperature','POST',{entity_id:id,temperature:n});
        applied.push(z);
      }
      if(!applied.length)throw err(409,'Ogrzewanie jest chwilowo niedostępne lub okna są otwarte');
      return {ok:true,kind,zone:'heating',value:n,applied};
    }
    if(kind==='light'){
      const item=roomLight(room,zone,states);entity=item&&item.entity;
      if(!entity||!['on','off'].includes(value))throw err(400,'Nieprawidłowe sterowanie światłem');
      domain='switch';service=value==='on'?'turn_on':'turn_off';
    }else if(kind==='mode'&&zone==='ac'){
      if(String(room)!=='401')throw err(403,'Klimatyzacja tego apartamentu nie jest jeszcze skonfigurowana');
      const allowed=seasonalMode();
      if(value!=='off'&&value!==allowed)throw err(400,'Dostępny jest tylko tryb sezonowy: '+allowed);
      entity=CLIMATE.ac;domain='climate';service='set_hvac_mode';data.hvac_mode=value;
      if(value!=='off'&&anyWindowNotClosed(states,ALL_WINDOWS))throw err(409,'Zamknij wszystkie okna przed włączeniem klimatyzacji');
      if(value!=='off'){
        const previous=states.get(CLIMATE.ac)?.attributes?.temperature;
        if(!numeric(previous)||previous<RANGE.ac[0]||previous>RANGE.ac[1]){
          // Keep the physical AC target inside the 401 guest range even when reactivated from an old 24°C setpoint.
          await haApi('/services/climate/set_temperature','POST',{entity_id:CLIMATE.ac,temperature:BASE.ac});
        }
      }
    }else if(kind==='target'){
      if(String(room)!=='401')throw err(403,'Temperatura tego apartamentu nie jest jeszcze skonfigurowana');
      entity=Object.prototype.hasOwnProperty.call(CLIMATE,zone)?CLIMATE[zone]:null;
      const n=validTarget(value,zone);
      if(!entity||n===null)throw err(400,'Nastawa przekracza dozwolony zakres obiektu (co 0,5°C)');
      if(zone!=='ac'&&!Number.isInteger(n))throw err(400,'Termostaty 401 obsługują nastawy co 1°C');
      if(zone==='ac'&&anyWindowNotClosed(states,ALL_WINDOWS))throw err(409,'Klimatyzacja zablokowana przez otwarte okno');
      if(zone!=='ac'&&WINDOWS[zone]&&anyWindowNotClosed(states,WINDOWS[zone]))
        throw err(409,'Zamknij okno przed zmianą temperatury grzejnika');
      domain='climate';service='set_temperature';data.temperature=n;
    }else if(kind==='fan'&&zone==='ac'){
      if(String(room)!=='401')throw err(403,'Nawiew tego apartamentu nie jest jeszcze skonfigurowany');
      if(!FANS.has(value))throw err(400,'Nieprawidłowy poziom nawiewu');
      if(anyWindowNotClosed(states,ALL_WINDOWS))throw err(409,'Klimatyzacja zablokowana przez otwarte okno');
      entity=CLIMATE.ac;domain='climate';service='set_fan_mode';data.fan_mode=value;
    }else throw err(400,'Nieobsługiwane polecenie');
    if(!usable(states.get(entity)))throw err(409,'Urządzenie chwilowo niedostępne');
    await haApi('/services/'+domain+'/'+service,'POST',{entity_id:entity,...data});
    return {ok:true,kind,zone,value};
  }
  async function handle(req,res,p){
    if(p!=='/api/tv/comfort')return false;
    if(req.method!=='GET'&&req.method!=='POST'){
      send(res,405,{error:'Metoda nieobsługiwana'});return true;
    }
    const tv=device(req,res);if(!tv)return true;
    const room=String(tv.room);
    if(req.method==='GET'){
      send(res,200,stateView(await load(),room));return true;
    }
    if(!limit(tv)){send(res,429,{error:'Za dużo poleceń. Spróbuj za chwilę.'});return true;}
    const body=await jsonBody(req);
    const result=await action(room,body,await load());
    audit('tv:'+String(tv.id||room),'tv_comfort',{room:Number(room),kind:result.kind,zone:result.zone,value:result.value});
    send(res,200,result);
    return true;
  }
  return {handle};
};
