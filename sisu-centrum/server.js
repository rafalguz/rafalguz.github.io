'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8098);
const DATA = process.env.SISU_DATA_DIR || '/data';
const DBFILE = path.join(DATA, 'sisu-accounts.json');
const PUBLIC = path.join(__dirname, 'public');
const HA_URL = 'http://supervisor/core/api';
const HA_TOKEN = process.env.SUPERVISOR_TOKEN;
const SESSION_TTL = 12 * 60 * 60 * 1000;
const ROOMS = [101,102,103,104,105,106,107,108,201,202,203,204,205,206,207,208,301,302,303,304,305,306,307,308,401,402,403,404,405,406];
const STATUSES = ['Nieustalony', 'Oczekuje na przyjazd', 'Zameldowany', 'Do sprzątania', 'Sprzątanie', 'Gotowy'];
const MUSIC_SELECT = 'input_select.sisu_muzyka_holu';
const MUSIC_STATIONS = Object.freeze({
  'Relaxing Piano':{
    url:'https://stream.laut.fm/relaxing-piano',
    description:'Spokojny fortepian i delikatne instrumentalne tło. Najbardziej elegancki, hotelowy klimat.'
  },
  'SomaFM Groove Salad':{
    url:'https://ice2.somafm.com/groovesalad-128-mp3',
    description:'Ambient i downtempo bez agresywnego rytmu. Nowoczesne, bardzo dyskretne tło.'
  },
  'SomaFM Beat Blender':{
    url:'https://ice2.somafm.com/beatblender-128-mp3',
    description:'Łagodny chillout i lekkie beaty. Trochę żywsze, nadal spokojne i premium.'
  },
  "Chante France 60's":{
    url:'https://chantefrance60s.ice.infomaniak.ch/chantefrance60s-128.mp3',
    description:'Francuskie klasyki lat 60.: chanson, retro i największe francuskie przeboje epoki.'
  },
  "Chante France 70's":{
    url:'https://chantefrance70s.ice.infomaniak.ch/chantefrance70s-128.mp3',
    description:'Francuskie klasyki lat 70.: elegancka chanson i popularne francuskie przeboje.'
  },
  'Crooner Radio Frenchy':{
    url:'https://direct.croonerradio.fr/croonerradio-frenchy-midfi.mp3',
    description:'Francuska chanson i stylowe francuskie standardy z różnych dekad. Bardzo hotelowy klimat.'
  },
  'SmoothJazz.com Global':{
    url:'https://smoothjazz.cdnstream1.com/2585_128.mp3',
    description:'Gładki jazz, saksofon, fortepian i spokojny groove. Eleganckie, bardzo dobre tło do holu premium.'
  }
});
const DEVICES = Object.freeze({
  ac:'climate.401_apartament',
  temp:'sensor.401_salon_temperatura_pomiar',
  acTemp:'sensor.401_apartament_room_temperature',
  tv:'media_player.401_salon_telewizor_ue55u8072huxxh',
  tvPower:'media_player.401_salon_401_salon_telewizor',
  hallAudio:'media_player.smart_audio_player_2',
  windows:{
    'Salon prawe':'binary_sensor.contact_sensor_drzwi',
    'Salon lewe':'binary_sensor.contact_sensor_2_drzwi',
    'Sypialnia dachowe':'binary_sensor.contact_sensor_3_drzwi'
  },
  motion:{
    'Salon':'binary_sensor.pir_motion_sensor_3_ruch',
    'Sypialnia':'binary_sensor.pir_motion_sensor_4_ruch',
    'Łazienka':'binary_sensor.pir_motion_sensor_ruch'
  },
  lights:{
    'Salon':'switch.qs_zigbee_sec01_single_gang_4_switch_1',
    'Nad stołem':'switch.qs_zigbee_sec01_single_gang_3_switch_1',
    'Przedpokój':'switch.qs_zigbee_sec01_single_gang_2_switch_1',
    'Łazienka':'switch.qs_zigbee_sec01_single_gang_switch_1'
  },
  heating:{
    'Salon':'climate.zg253_trv_2',
    'Sypialnia':'climate.zg253_trv_3',
    'Łazienka':'climate.zg253_trv'
  }
});
const sessions = new Map();
const attempts = new Map();
let bootstrapCode = null;
let accountDB = { users:[], audit:[] };

function loadAccounts(){
  fs.mkdirSync(DATA,{recursive:true,mode:0o700});
  if(fs.existsSync(DBFILE)){
    const data = JSON.parse(fs.readFileSync(DBFILE,'utf8'));
    if(!Array.isArray(data.users)) throw Error('Uszkodzona baza użytkowników SISU');
    accountDB = {users:data.users,audit:Array.isArray(data.audit)?data.audit:[]};
  } else {
    bootstrapCode = crypto.randomBytes(16).toString('hex');
    console.log('SISU: jednorazowy kod pierwszej konfiguracji: '+bootstrapCode);
    console.log('SISU: otwórz http://IP-SERWERA:8098 w lokalnej sieci. Kod jest widoczny tylko w dzienniku dodatku HA.');
  }
}
function saveAccounts(){
  const name=DBFILE+'.tmp-'+process.pid;
  fs.writeFileSync(name,JSON.stringify(accountDB),{encoding:'utf8',mode:0o600});
  fs.renameSync(name,DBFILE);
}
function audit(actor,action,detail){
  accountDB.audit.unshift({when:new Date().toISOString(),actor,action,detail:detail||null});
  accountDB.audit.length=Math.min(accountDB.audit.length,300);
  saveAccounts();
}
function passwordHash(pass,salt){
  return crypto.scryptSync(pass,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1}).toString('hex');
}
function makeUser(email,password,role){
  const salt=crypto.randomBytes(16).toString('hex');
  return {id:crypto.randomUUID(),email,role,salt,hash:passwordHash(password,salt),active:true,createdAt:new Date().toISOString()};
}
function verifyPass(pass,user){
  const found=passwordHash(pass,user.salt);
  return crypto.timingSafeEqual(Buffer.from(found,'hex'),Buffer.from(user.hash,'hex'));
}
function validEmail(v){
  return typeof v==='string'&&v.length<=254&&/^[^\s@<>]{1,64}@[^\s@<>]+\.[a-z]{2,}$/i.test(v.trim())
    ? v.trim().toLowerCase() : null;
}
function validPassword(v){return typeof v==='string'&&v.length>=14&&v.length<=128;}
function readCookie(req,name){
  const raw=String(req.headers.cookie||'');
  const part=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return part?part.slice(name.length+1):null;
}
function hashToken(v){return crypto.createHash('sha256').update(v).digest('hex');}
function sessionOf(req){
  const raw=readCookie(req,'sisu_sid');
  if(!raw||!/^[a-f0-9]{64}$/.test(raw))return null;
  const record=sessions.get(hashToken(raw));
  if(!record)return null;
  if(record.expires<=Date.now()){sessions.delete(hashToken(raw));return null;}
  const user=accountDB.users.find(x=>x.id===record.userId&&x.active);
  if(!user)return null;
  return {record,user};
}
function issueSession(res,req,user){
  const token=crypto.randomBytes(32).toString('hex');
  const csrf=crypto.randomBytes(24).toString('hex');
  const id=hashToken(token);
  sessions.set(id,{userId:user.id,csrf,expires:Date.now()+SESSION_TTL});
  if(sessions.size>2000) for(const [key,val] of sessions) if(val.expires<=Date.now())sessions.delete(key);
  const secure=isTls(req)?'; Secure':'';
  res.setHeader('Set-Cookie', 'sisu_sid='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+secure);
  return csrf;
}
function isTls(req){
  return !!(req.socket.encrypted || String(req.headers['x-forwarded-proto']||'').split(',')[0].trim()==='https');
}
function clearSession(req,res){
  const sid=readCookie(req,'sisu_sid');if(sid)sessions.delete(hashToken(sid));
  res.setHeader('Set-Cookie','sisu_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(isTls(req)?'; Secure':''));
}
function send(res,code,data){
  res.statusCode=code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(data));
}
function securityHeaders(res,req){
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(isTls(req))res.setHeader('Strict-Transport-Security','max-age=31536000');
}
function safeOrigin(req){
  const origin=req.headers.origin;
  if(!origin)return true;
  try{
    const u=new URL(origin);
    return (u.protocol==='https:'||u.protocol==='http:') && u.host===req.headers.host;
  }catch{return false;}
}
function jsonBody(req){
  return new Promise((resolve,reject)=>{
    if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')){
      reject(Object.assign(Error('Wymagany Content-Type application/json'),{status:415}));return;
    }
    let raw='',n=0;
    req.on('data',chunk=>{n+=chunk.length;if(n>32768){reject(Object.assign(Error('Zbyt duży formularz'),{status:413}));req.destroy();return;}raw+=chunk.toString('utf8')});
    req.on('end',()=>{try{const obj=JSON.parse(raw);if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error();resolve(obj)}catch{reject(Object.assign(Error('Nieprawidłowy JSON'),{status:400}))}});
    req.on('error',reject);
  });
}
function requireUser(req,res,roles){
  const ctx=sessionOf(req);
  if(!ctx){send(res,401,{error:'Wymagane logowanie'});return null;}
  if(roles && !roles.includes(ctx.user.role)){send(res,403,{error:'Brak uprawnień'});return null;}
  return ctx;
}
function csrfOk(req,res,ctx){
  if(!safeOrigin(req)){send(res,403,{error:'Nieprawidłowe pochodzenie żądania'});return false;}
  const t=req.headers['x-sisu-csrf'];
  if(typeof t!=='string' || t!==ctx.record.csrf){send(res,403,{error:'Wygasła sesja strony. Odśwież widok.'});return false;}
  return true;
}
function briefUser(user){return {id:user.id,email:user.email,role:user.role,active:user.active};}
function clientKey(req){
  // Only direct peer is trusted; never trust user-controlled X-Forwarded-For.
  return req.socket.remoteAddress||'unknown';
}
function blockedLogin(req){
  const now=Date.now(),key=clientKey(req), entry=attempts.get(key);
  if(entry&&entry.until>now)return true;
  if(entry&&entry.until<=now)attempts.delete(key);
  return false;
}
function recordFailedLogin(req){
  const key=clientKey(req),now=Date.now(),prev=attempts.get(key)||{count:0,until:now+15*60000};
  const entry=prev.until<now?{count:1,until:now+15*60000}:{count:prev.count+1,until:prev.until};
  if(entry.count>=8)entry.until=now+15*60000;
  attempts.set(key,entry);
  if(attempts.size>1000)for(const [id,r] of attempts)if(r.until<now)attempts.delete(id);
}
let overviewCache = null;
let overviewInFlight = null;
const OVERVIEW_TTL_MS = 4000;
function invalidateOverview(){ overviewCache=null; }
async function getOverview(fresh=false){
  const now=Date.now();
  if(!fresh&&overviewCache&&now-overviewCache.at<OVERVIEW_TTL_MS)return overviewCache.data;
  if(overviewInFlight)return overviewInFlight;
  overviewInFlight=(async()=>{
    const data=extractStates(await haApi('/states'));
    overviewCache={at:Date.now(),data};
    return data;
  })();
  try{return await overviewInFlight;}finally{overviewInFlight=null;}
}
async function haApi(endpoint,method='GET',payload){
  if(!HA_TOKEN)throw Object.assign(Error('Brak połączenia serwerowego z Home Assistant'),{status:503});
  if(!/^\/(states|services\/[a-z_]+\/[a-z_]+)$/.test(endpoint))throw Object.assign(Error('Niedozwolone żądanie HA'),{status:400});
  let response;
  try{
    response=await fetch(HA_URL+endpoint,{
      method, headers:{Authorization:'Bearer '+HA_TOKEN,Accept:'application/json','Content-Type':'application/json'},
      ...(payload?{body:JSON.stringify(payload)}:{}),
      signal:AbortSignal.timeout(9000),
      redirect:'manual'
    });
  }catch{throw Object.assign(Error('Serwer Home Assistant nie odpowiada'),{status:503});}
  if(!response.ok)throw Object.assign(Error('Home Assistant odrzucił polecenie ('+response.status+')'),{status:502});
  return response.json().catch(()=>null);
}
function roomId(n){return 'input_select.sisu_'+n+'_status_obslugi';}
function statusOf(entity){
  return entity&&entity.state!=='unavailable'&&entity.state!=='unknown'?entity.state:null;
}
function extractStates(states){
  if(!Array.isArray(states))throw Object.assign(Error('Nieprawidłowy odczyt HA'),{status:502});
  const map=new Map(states.map(x=>[x.entity_id,x]));
  const state=id=>map.get(id)||null;
  const one=id=>{const s=state(id);return s?{state:s.state,temperature:s.attributes?.current_temperature??null,target:s.attributes?.temperature??null,available:!['unknown','unavailable'].includes(s.state)}:{state:'unavailable',temperature:null,target:null,available:false};};
  const list=items=>Object.entries(items).map(([name,id])=>({name,...one(id)}));
  const rooms=ROOMS.map(n=>({number:n,floor:Math.floor(n/100),status:statusOf(state(roomId(n)))||'Nieustalony',connected:n===401}));
  // Samsung TV exposes reliable LAN power state; SmartThings is a fallback when the LAN entity drops.
  const tvNative=one(DEVICES.tv);
  const tv=tvNative.available?tvNative:one(DEVICES.tvPower);
  const audio=state(DEVICES.hallAudio);
  const audioAttrs=audio?.attributes||{};
  const musicLabel=v=>typeof v==='string'&&v.trim()?v.trim().slice(0,200):null;
  const audioVolume=audioAttrs.volume_level;
  return {
    checkedAt:new Date().toISOString(),
    rooms,
    hallMusic:{
      state:audio?.state||'unavailable',
      title:musicLabel(audioAttrs.media_title),
      artist:musicLabel(audioAttrs.media_artist),
      album:musicLabel(audioAttrs.media_album_name),
      source:musicLabel(audioAttrs.source),
      selected:statusOf(state(MUSIC_SELECT))||'Relaxing Piano',
      stations:Object.entries(MUSIC_STATIONS).map(([name,s])=>({name,description:s.description,preview:s.url})),
      volume:typeof audioVolume==='number'&&Number.isFinite(audioVolume)?Math.max(0,Math.min(1,audioVolume)):null,
      muted:audioAttrs.is_volume_muted===true,
      lastReported:audio?.last_reported||null
    },
    room401:{
      temperature:state(DEVICES.temp)&&Number.isFinite(Number(state(DEVICES.temp).state))?Number(state(DEVICES.temp).state):null,
      ac:one(DEVICES.ac),tv,windows:list(DEVICES.windows),motion:list(DEVICES.motion),lights:list(DEVICES.lights),heating:list(DEVICES.heating)
    }
  };
}
function choiceMap(group,name){
  return typeof name==='string' && Object.prototype.hasOwnProperty.call(group,name)?group[name]:null;
}
function halfStep(v,min,max){
  const n=Number(v);
  return Number.isFinite(n)&&n>=min&&n<=max&&Math.abs(n*2-Math.round(n*2))<1e-8?n:null;
}
async function control401(body){
  const kind=body.kind, name=body.name, value=body.value;
  let domain,action,entity,data={};
  if(kind==='light'&&['on','off'].includes(value)&&(entity=choiceMap(DEVICES.lights,name))){
    domain='switch';action=value==='on'?'turn_on':'turn_off';
  }else if(kind==='trv'&&(entity=choiceMap(DEVICES.heating,name))){
    const n=halfStep(value,8,28);if(n===null)throw Object.assign(Error('Temperatura grzejnika: 8–28°C co 0,5°C'),{status:400});
    domain='climate';action='set_temperature';data.temperature=n;
  }else if(kind==='ac'&&['off','heat','cool','dry','fan_only'].includes(value)){
    domain='climate';action='set_hvac_mode';entity=DEVICES.ac;data.hvac_mode=value;
  }else if(kind==='ac_temp'){
    const n=halfStep(value,16,30);if(n===null)throw Object.assign(Error('Temperatura Mitsubishi: 16–30°C co 0,5°C'),{status:400});
    domain='climate';action='set_temperature';entity=DEVICES.ac;data.temperature=n;
  }else if(kind==='tv'&&['on','off'].includes(value)){
    domain='media_player';action=value==='on'?'turn_on':'turn_off';entity=DEVICES.tvPower;
  }else throw Object.assign(Error('Nieobsługiwane polecenie'),{status:400});
  if(kind==='ac_temp'||(kind==='ac'&&value!=='off')){
    const states=await haApi('/states');
    const values=new Map(states.map(s=>[s.entity_id,s.state]));
    const safe=Object.values(DEVICES.windows).every(id=>values.get(id)==='off');
    if(!safe)throw Object.assign(Error('Klimatyzacja zablokowana: okno otwarte lub czujnik okna niedostępny'),{status:409});
  }
  await haApi('/services/'+domain+'/'+action,'POST',{entity_id:entity,...data});
  return {kind,name:name||null,value,entity};
}
const tvRegistry=require('./tv_registry')({
  dataDir:DATA,rooms:ROOMS,send,requireUser,csrfOk,jsonBody,audit,clientKey
});
const tvContent=require('./tv_content')({
  dataDir:DATA,rooms:ROOMS,send,requireUser,csrfOk,jsonBody,audit,resolveDevice:tvRegistry.resolveDevice
});

async function handle(req,res){
  securityHeaders(res,req);
  const url=new URL(req.url||'/', 'http://local.invalid');
  const p=url.pathname;
  if(await tvContent.handle(req,res,p))return;
  if(await tvRegistry.handle(req,res,p))return;
  if(req.method==='GET'&&['/','/app.js','/app.css','/tv_updates_admin.js','/tv_updates_admin.css'].includes(p)){
    const file=p==='/'?'index.html':p.slice(1);
    const type=p==='/'?'text/html; charset=utf-8':p.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8';
    return fs.readFile(path.join(PUBLIC,file),(err,bytes)=>{
      if(err){send(res,404,{error:'Nie znaleziono strony'});return;}
      res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');res.end(bytes);
    });
  }
  if(req.method==='GET'&&p==='/api/health')return send(res,200,{ok:true,configured:accountDB.users.length>0});
  if(req.method==='GET'&&p==='/api/session'){
    const ctx=sessionOf(req);
    return send(res,200,ctx?{configured:true,authenticated:true,user:briefUser(ctx.user),csrf:ctx.record.csrf}:{configured:accountDB.users.length>0,authenticated:false});
  }
  if(req.method==='POST'&&p==='/api/setup'){
    if(accountDB.users.length)return send(res,409,{error:'System jest już skonfigurowany'});
    if(!safeOrigin(req))return send(res,403,{error:'Nieprawidłowa domena'});
    if(blockedLogin(req))return send(res,429,{error:'Zbyt wiele prób; spróbuj później'});
    const body=await jsonBody(req);
    const email=validEmail(body.email);
    if(!email||!validPassword(body.password))return send(res,400,{error:'Podaj prawidłowy e-mail i hasło minimum 14 znaków'});
    const provided=typeof body.code==='string'?body.code:'';
    if(!bootstrapCode||provided.length!==bootstrapCode.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(bootstrapCode))){
      recordFailedLogin(req);return send(res,403,{error:'Niepoprawny kod pierwszej konfiguracji'});
    }
    const admin=makeUser(email,body.password,'admin');
    accountDB.users.push(admin);saveAccounts();
    bootstrapCode=null;
    const csrf=issueSession(res,req,admin);
    audit(admin.id,'setup','Konto administratora');
    return send(res,200,{ok:true,user:briefUser(admin),csrf});
  }
  if(req.method==='POST'&&p==='/api/login'){
    if(!accountDB.users.length)return send(res,409,{error:'Najpierw przeprowadź konfigurację'});
    if(!safeOrigin(req))return send(res,403,{error:'Nieprawidłowa domena'});
    if(blockedLogin(req))return send(res,429,{error:'Zbyt wiele prób logowania; spróbuj później'});
    const body=await jsonBody(req);
    const email=validEmail(body.email);
    const user=email&&accountDB.users.find(x=>x.email===email&&x.active);
    let good=false;
    if(typeof body.password==='string'&&body.password.length<=128 && user){
      good=verifyPass(body.password,user);
    }
    if(!good){recordFailedLogin(req);return send(res,401,{error:'Nieprawidłowy login lub hasło'});}
    attempts.delete(clientKey(req));
    const csrf=issueSession(res,req,user);
    return send(res,200,{ok:true,user:briefUser(user),csrf});
  }
  if(req.method==='POST'&&p==='/api/logout'){
    const ctx=requireUser(req,res);if(!ctx)return;
    if(!csrfOk(req,res,ctx))return;
    clearSession(req,res);return send(res,200,{ok:true});
  }
  if(req.method==='GET'&&p==='/api/overview'){
    const ctx=requireUser(req,res);if(!ctx)return;
    return send(res,200,{ok:true,...await getOverview(url.searchParams.get('fresh')==='1')});
  }
  if(req.method==='POST'&&p==='/api/room-status'){
    const ctx=requireUser(req,res,['admin','manager']);if(!ctx)return;
    if(!csrfOk(req,res,ctx))return;
    const body=await jsonBody(req);
    const n=Number(body.room);
    if(!Number.isInteger(n)||!ROOMS.includes(n)||!STATUSES.includes(body.status))return send(res,400,{error:'Nieprawidłowy lokal lub status'});
    await haApi('/services/input_select/select_option','POST',{entity_id:roomId(n),option:body.status});
    invalidateOverview();
    audit(ctx.user.id,'room_status',{room:n,status:body.status});
    return send(res,200,{ok:true,room:n,status:body.status});
  }
  if(req.method==='POST'&&p==='/api/control'){
    const ctx=requireUser(req,res,['admin','manager']);if(!ctx)return;
    if(!csrfOk(req,res,ctx))return;
    const body=await jsonBody(req);
    if(Number(body.room)!==401)return send(res,400,{error:'Sterowanie dostępne tylko dla podłączonego apartamentu 401'});
    const action=await control401(body);
    invalidateOverview();
    audit(ctx.user.id,'control_401',action);
    return send(res,200,{ok:true,accepted:true,action});
  }
  if(req.method==='POST'&&p==='/api/music'){
    const ctx=requireUser(req,res,['admin','manager']);if(!ctx)return;
    if(!csrfOk(req,res,ctx))return;
    const body=await jsonBody(req);
    const station=typeof body.station==='string'?body.station:'';
    const selected=MUSIC_STATIONS[station];
    if(!selected)return send(res,400,{error:'Nieznana stacja radiowa'});
    await haApi('/services/input_select/select_option','POST',{entity_id:MUSIC_SELECT,option:station});
    await haApi('/services/media_player/play_media','POST',{entity_id:DEVICES.hallAudio,media_content_id:selected.url,media_content_type:'music'});
    invalidateOverview();
    audit(ctx.user.id,'hall_music',{station});
    return send(res,200,{ok:true,station});
  }
  if(req.method==='POST'&&p==='/api/music/volume'){
   const ctx=requireUser(req,res,['admin','manager']);if(!ctx)return;
   if(!csrfOk(req,res,ctx))return;
   const body=await jsonBody(req);
   const volume=body.volume;
   if(typeof volume!=='number'||!Number.isInteger(volume)||volume<0||volume>100)
     return send(res,400,{error:'Głośność musi być liczbą od 0 do 100%'});
   await haApi('/services/media_player/volume_set','POST',{entity_id:DEVICES.hallAudio,volume_level:volume/100});
   await haApi('/services/input_number/set_value','POST',{entity_id:'input_number.sisu_glosnosc_holu',value:volume});
   invalidateOverview();
   audit(ctx.user.id,'hall_volume',{volume});
   return send(res,200,{ok:true,volume});
 }
 if(req.method==='POST'&&p==='/api/music/mute'){
   const ctx=requireUser(req,res,['admin','manager']);if(!ctx)return;
   if(!csrfOk(req,res,ctx))return;
   const body=await jsonBody(req);
   if(typeof body.muted!=='boolean')
     return send(res,400,{error:'Nieprawidłowa komenda wyciszenia'});
   await haApi('/services/media_player/volume_mute','POST',{entity_id:DEVICES.hallAudio,is_volume_muted:body.muted});
   invalidateOverview();
   audit(ctx.user.id,'hall_mute',{muted:body.muted});
   return send(res,200,{ok:true,muted:body.muted});
 }
 if(req.method==='GET'&&p==='/api/users'){
    const ctx=requireUser(req,res,['admin']);if(!ctx)return;
    return send(res,200,{ok:true,users:accountDB.users.map(briefUser),audit:accountDB.audit.slice(0,40)});
  }
  if(req.method==='POST'&&p==='/api/users'){
    const ctx=requireUser(req,res,['admin']);if(!ctx)return;
    if(!csrfOk(req,res,ctx))return;
    const body=await jsonBody(req);
    const email=validEmail(body.email);
    if(!email||!validPassword(body.password)||body.role!=='manager')return send(res,400,{error:'Podaj e-mail, rolę manager i hasło minimum 14 znaków'});
    if(accountDB.users.some(x=>x.email===email))return send(res,409,{error:'Konto z tym adresem już istnieje'});
    const user=makeUser(email,body.password,'manager');
    accountDB.users.push(user);
    audit(ctx.user.id,'create_manager',{user:user.email});
    return send(res,200,{ok:true,user:briefUser(user)});
  }
  if(req.method==='POST'&&p==='/api/users/disable'){
    const ctx=requireUser(req,res,['admin']);if(!ctx)return;
    if(!csrfOk(req,res,ctx))return;
    const body=await jsonBody(req);
    const member=accountDB.users.find(x=>x.id===body.id);
    if(!member||member.role==='admin'||member.id===ctx.user.id)return send(res,403,{error:'Nie można zablokować administratora'});
    member.active=!member.active;
    for(const [key,session] of sessions)if(session.userId===member.id)sessions.delete(key);
    audit(ctx.user.id,'toggle_manager',{user:member.email,active:member.active});
    return send(res,200,{ok:true,active:member.active});
  }
  return send(res,404,{error:'Nie znaleziono zasobu'});
}
loadAccounts();
// Diagnostics only: one outbound HTTPS request at startup. Never modifies router or DNS.
(async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {signal: AbortSignal.timeout(7000)});
    if (!response.ok) throw Error('upstream status');
    const data = await response.json();
    const ip = typeof data.ip === 'string' ? data.ip.trim() : '';
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip))
      console.log('SISU: egress public IPv4: ' + ip);
    else console.log('SISU: public IPv4 unavailable');
  } catch (err) {
    console.log('SISU: public IPv4 probe failed');
  }
})();
http.createServer((req,res)=>{
  Promise.resolve(handle(req,res)).catch(err=>{
    console.error('SISU request failed:',err?.message||'unknown');
    if(!res.writableEnded)send(res,Number.isInteger(err?.status)?err.status:500,{error:err?.status?err.message:'Błąd serwera SISU'});
  });
}).listen(PORT,process.env.SISU_BIND_HOST||'0.0.0.0',()=>console.log('SISU panel działa na porcie '+PORT));