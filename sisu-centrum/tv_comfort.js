'use strict';
// Explicit TV guest allowlist for pilot apartment 401. No HA credentials leave this server.
const LIGHTS=Object.freeze({
  salon:'switch.qs_zigbee_sec01_single_gang_4_switch_1',
  stol:'switch.qs_zigbee_sec01_single_gang_3_switch_1',
  kuchnia:'switch.qs_zigbee_sec01_single_gang_2_switch_1',
  lazienka:'switch.qs_zigbee_sec01_single_gang_switch_1',
  sypialnia:'switch.qs_zigbee_sec01_single_gang_5_switch'
});
const CLIMATE=Object.freeze({
  ac:'climate.401_apartament',
  salon:'climate.zg253_trv_2',
  sypialnia:'climate.zg253_trv_3',
  lazienka:'climate.zg253_trv'
});
const WINDOWS=Object.freeze({
  salon:['binary_sensor.contact_sensor_drzwi','binary_sensor.contact_sensor_2_drzwi',
    'binary_sensor.contact_sensor_4_drzwi','binary_sensor.contact_sensor_5_drzwi'],
  sypialnia:['binary_sensor.contact_sensor_3_drzwi']
});
const BASE=Object.freeze({ac:23,salon:22,sypialnia:22,lazienka:22});
const RANGE=Object.freeze({ac:[21,25],salon:[20,24],sypialnia:[20,24],lazienka:[20,24]});
const ALL_WINDOWS=Object.freeze([...WINDOWS.salon,...WINDOWS.sypialnia]);
const MODES=new Set(['off','heat','cool','dry','fan_only']);
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
    if(tv.mode!=='room'||String(tv.room)!=='401'){
      send(res,403,{error:'Sterowanie dostępne wyłącznie w przypisanym apartamencie 401'});return null;
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
  function stateView(states){
    const lights={};
    for(const [zone,id] of Object.entries(LIGHTS)){
      const s=states.get(id);
      lights[zone]={available:usable(s),on:usable(s)&&s.state==='on'};
    }
    const climate={};
    for(const zone of Object.keys(CLIMATE))climate[zone]=climateState(states,zone);
    return {
      ok:true,room:'401',mode:'room',checkedAt:new Date().toISOString(),
      lights,climate,
      windows:{acBlocked:anyWindowNotClosed(states,ALL_WINDOWS),
        salonOpen:anyWindowNotClosed(states,WINDOWS.salon),
        sypialniaOpen:anyWindowNotClosed(states,WINDOWS.sypialnia)}
    };
  }
  async function action(body,states){
    const kind=body.kind,zone=body.zone,value=body.value;
    let domain,service,entity,data={};
    if(kind==='light'){
      entity=Object.prototype.hasOwnProperty.call(LIGHTS,zone)?LIGHTS[zone]:null;
      if(!entity||!['on','off'].includes(value))throw err(400,'Nieprawidłowe sterowanie światłem');
      domain='switch';service=value==='on'?'turn_on':'turn_off';
    }else if(kind==='mode'&&zone==='ac'){
      if(!MODES.has(value))throw err(400,'Nieprawidłowy tryb klimatyzacji');
      entity=CLIMATE.ac;domain='climate';service='set_hvac_mode';data.hvac_mode=value;
      if(value!=='off'&&anyWindowNotClosed(states,ALL_WINDOWS))throw err(409,'Zamknij wszystkie okna przed włączeniem klimatyzacji');
    }else if(kind==='target'){
      entity=Object.prototype.hasOwnProperty.call(CLIMATE,zone)?CLIMATE[zone]:null;
      const n=validTarget(value,zone);
      if(!entity||n===null)throw err(400,'Nastawa przekracza dozwolony zakres obiektu (co 0,5°C)');
      if(zone==='ac'&&anyWindowNotClosed(states,ALL_WINDOWS))throw err(409,'Klimatyzacja zablokowana przez otwarte okno');
      if(zone!=='ac'&&WINDOWS[zone]&&anyWindowNotClosed(states,WINDOWS[zone]))
        throw err(409,'Zamknij okno przed zmianą temperatury grzejnika');
      domain='climate';service='set_temperature';data.temperature=n;
    }else if(kind==='fan'&&zone==='ac'){
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
    if(req.method==='GET'){
      send(res,200,stateView(await load()));return true;
    }
    if(!limit(tv)){send(res,429,{error:'Za dużo poleceń. Spróbuj za chwilę.'});return true;}
    const body=await jsonBody(req);
    const result=await action(body,await load());
    audit('tv:'+String(tv.id||'401'),'tv_comfort',{room:401,kind:result.kind,zone:result.zone,value:result.value});
    send(res,200,result);
    return true;
  }
  return {handle};
};
