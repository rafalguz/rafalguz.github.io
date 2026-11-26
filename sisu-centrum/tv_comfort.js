'use strict';
// Room-scoped device allowlist. The TV receives only safe ids/names/states; HA entity ids stay server-side.
// Add lights for another apartment here (or move them to the management UI later) — the TV UI needs no rebuild.
// Room 401 preserves its existing light discovery; room 402 uses an explicit allowlist.
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
// Explicit allowlist for 402. Never accept entity ids from the TV.
const ROOM402=Object.freeze({
  lights:[
    {id:'salon',name:'Salon',entity:'switch.402_salon_oswietlenie'},
    {id:'kuchnia',name:'Kuchnia',entity:'switch.402_kuchnia_oswietlenie'},
    {id:'przedpokoj',name:'Przedpokój',entity:'switch.402_przedpokoj_oswietlenie'},
    {id:'sypialnia',name:'Sypialnia',entity:'switch.402_sypialnia_oswietlenie'},
    {id:'lazienka',name:'Łazienka',entity:'switch.402_lazienka_swiatlo'}
  ],
  climate:{
    ac:['climate.402'],
    salon:['climate.402_salon_termostat'],
    sypialnia:['climate.402_sypialnia_termostat','climate.402_sypialnia_termostat_2'],
    przedpokoj:['climate.402_przedpokoj_termostat'],
    lazienka:[]
  },
  windows:{
    salon:['binary_sensor.402_salon_okno_1_kontaktron_contact','binary_sensor.402_salon_okno_3_kontaktron_contact'],
    sypialnia:['binary_sensor.402_sypialnia_okno_1_kontaktron_contact','binary_sensor.402_sypialnia_okno_2_kontaktron_contact','binary_sensor.402_sypialnia_okno_3_kontaktron_contact']
  }
});
// Only actual room-owned HA entities, including the three registered 404 window contacts.
const ROOM404=Object.freeze({
  lights:[
    {id:'salon',name:'Salon',entity:'switch.0xa4c1382f74f6fac9'},
    {id:'przedpokoj',name:'Przedpokój',entity:'switch.404_przedpokoj_oswietlenie'},
    {id:'sypialnia',name:'Sypialnia',entity:'switch.404_sypialnia_oswietlenie'},
    {id:'lazienka',name:'Łazienka',entity:'switch.404_lazienka_oswietlenie'}
  ],
  climate:{
    ac:['climate.404'], salon:['climate.404_salon_termostat'],
    sypialnia:['climate.404_sypialnia_termostat'], lazienka:['climate.404_lazienka_termostat'],
    przedpokoj:[]
  },
  windows:{
    salon:['binary_sensor.404_salon_okno_1_dachowe_kontaktron_contact','binary_sensor.404_salon_okno_3_kontaktron_contact'],
    sypialnia:['binary_sensor.404_sypialnia_okno_1_kontaktron_contact']
  }
});
const MAPPED_ROOMS=Object.freeze({'402':ROOM402,'404':ROOM404});

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
    if(room!=='401'&&!Object.hasOwn(MAPPED_ROOMS,room)){
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
  function stateViewMapped(states,room,plan){
    const allWindows=Object.values(plan.windows).flat();
    const lights={},lightList=[];
    for(const item of plan.lights){
      const s=states.get(item.entity),available=usable(s),on=available&&s.state==='on';
      lights[item.id]={available,on,name:item.name};
      lightList.push({id:item.id,name:item.name,available,on});
    }
    const climate={};
    for(const zone of ['ac','salon','sypialnia','lazienka','przedpokoj']){
      const ss=plan.climate[zone].map(id=>states.get(id));
      const available=ss.length>0&&ss.every(usable);
      const values=ss.map(s=>numeric(s?.attributes?.current_temperature)).filter(v=>v!==null);
      const targets=ss.map(s=>numeric(s?.attributes?.temperature));
      const target=available&&targets.every(v=>v!==null&&v===targets[0])?targets[0]:null;
      const range=RANGE[zone]||RANGE.salon;
      climate[zone]={available,mode:available?ss[0].state:'unavailable',
        current:values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10:null,
        target,base:BASE[zone]||BASE.salon,min:range[0],max:range[1],
        fan:typeof ss[0]?.attributes?.fan_mode==='string'?ss[0].attributes.fan_mode:null};
    }
    return {ok:true,room:String(room),mode:'room',checkedAt:new Date().toISOString(),
      seasonal:{season:seasonLabel(),mode:seasonalMode()},lights,lightList,climate,
      windows:{acBlocked:anyWindowNotClosed(states,allWindows),
        salonOpen:anyWindowNotClosed(states,plan.windows.salon),
        sypialniaOpen:anyWindowNotClosed(states,plan.windows.sypialnia)}};
  }
  async function actionMapped(body,states,plan){
    const allWindows=Object.values(plan.windows).flat();
    if(!body||typeof body!=='object')throw err(400,'Nieprawidłowe polecenie');
    const {kind,zone,value}=body;
    if(typeof kind!=='string'||(kind!=='heating_target'&&typeof zone!=='string'))throw err(400,'Nieprawidłowe polecenie');
    const climate=plan.climate;
    const blocked=z=>z==='ac'?anyWindowNotClosed(states,allWindows):
      !!plan.windows[z]&&Array.isArray(plan.windows[z])&&anyWindowNotClosed(states,plan.windows[z]);
    const available=ids=>ids.length>0&&ids.every(id=>usable(states.get(id)));
    const setTemp=async(ids,n)=>{
      for(const id of ids)await haApi('/services/climate/set_temperature','POST',{entity_id:id,temperature:n});
    };
    if(kind==='light'){
      const item=plan.lights.find(x=>x.id===zone);
      if(!item||!['on','off'].includes(value))throw err(400,'Nieprawidłowe sterowanie światłem');
      if(!usable(states.get(item.entity)))throw err(409,'Urządzenie chwilowo niedostępne');
      await haApi('/services/switch/'+(value==='on'?'turn_on':'turn_off'),'POST',{entity_id:item.entity});
    }else if(kind==='heating_target'){
      const n=validTarget(value,'salon');
      if(n===null||!Number.isInteger(n))throw err(400,'Nastawa ogrzewania musi być w zakresie 19–23°C co 1°C');
      const applied=[];
      for(const z of Object.keys(climate).filter(z=>z!=='ac'&&climate[z].length)){
        if(!available(climate[z])||blocked(z))continue;
        await setTemp(climate[z],n);applied.push(z);
      }
      if(!applied.length)throw err(409,'Ogrzewanie jest chwilowo niedostępne lub okna są otwarte');
      return {ok:true,kind,zone:'heating',value:n,applied};
    }else if(kind==='target'){
      const ids=Object.prototype.hasOwnProperty.call(climate,zone)?climate[zone]:[];
      const n=validTarget(value,zone==='przedpokoj'?'salon':zone);
      if(!ids.length||n===null||(zone!=='ac'&&!Number.isInteger(n)))throw err(400,'Nieprawidłowa strefa lub nastawa temperatury');
      if(!available(ids))throw err(409,'Urządzenie chwilowo niedostępne');
      if(blocked(zone))throw err(409,'Zamknij okna przed zmianą temperatury');
      await setTemp(ids,n);
    }else if(kind==='mode'&&zone==='ac'){
      if(value!=='off'&&value!==seasonalMode())throw err(400,'Dostępny jest tylko tryb sezonowy: '+seasonalMode());
      if(!available(climate.ac))throw err(409,'Klimatyzacja chwilowo niedostępna');
      if(value!=='off'){
        if(blocked('ac'))throw err(409,'Zamknij wszystkie okna przed włączeniem klimatyzacji');
        const previous=numeric(states.get(climate.ac[0])?.attributes?.temperature);
        if(previous===null||previous<RANGE.ac[0]||previous>RANGE.ac[1])await setTemp(climate.ac,BASE.ac);
      }
      await haApi('/services/climate/set_hvac_mode','POST',{entity_id:climate.ac[0],hvac_mode:value});
    }else if(kind==='fan'&&zone==='ac'){
      if(!FANS.has(value))throw err(400,'Nieprawidłowy poziom nawiewu');
      if(!available(climate.ac)||blocked('ac'))throw err(409,'Klimatyzacja niedostępna lub zablokowana przez okno');
      await haApi('/services/climate/set_fan_mode','POST',{entity_id:climate.ac[0],fan_mode:value});
    }else throw err(400,'Nieobsługiwane polecenie');
    return {ok:true,kind,zone,value};
  }

  function stateView(states,room){
    if(Object.hasOwn(MAPPED_ROOMS,room))return stateViewMapped(states,room,MAPPED_ROOMS[room]);
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
    if(Object.hasOwn(MAPPED_ROOMS,room))return actionMapped(body,states,MAPPED_ROOMS[room]);
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

// Registry advertises exactly the devices accepted by the comfort endpoints.
module.exports.capabilities=function capabilities(room){
  const key=String(room);
  if(key==='401')return {lights:['salon','stol','kuchnia','lazienka','sypialnia'],climate:Object.keys(CLIMATE)};
  const plan=Object.hasOwn(MAPPED_ROOMS,key)?MAPPED_ROOMS[key]:null;
  return plan?{lights:plan.lights.map(x=>x.id),climate:Object.keys(plan.climate).filter(z=>plan.climate[z].length)}:{lights:[],climate:[]};
};
