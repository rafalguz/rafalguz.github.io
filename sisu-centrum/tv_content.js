'use strict';
// SISU23 TV content distribution. Strict JSON templates, never downloadable code.
// Public television clients receive only display-safe fields, not HA credentials.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

module.exports=function makeTvContent({dataDir,rooms,send,requireUser,csrfOk,jsonBody,audit,resolveDevice}) {
 const validRooms=new Set(rooms.map(String));
 const file=path.join(dataDir,'sisu-tv-content.json');
 const assetsDir=path.join(dataDir,'sisu-tv-assets');
 const DEFAULT=Object.freeze({
  welcome:{
   eyebrow:'BOUTIQUE RESIDENCES · WROCŁAW',
   title:'Witamy w SISU23',
   subtitle:'Wyjątkowy pobyt we Wrocławiu zaczyna się tutaj.',
   status:'Witamy Państwa w naszych apartamentach.',
   footerLeft:'WŁODKOWICA 23 · WROCŁAW',
   footerRight:'ODKRYJ WYJĄTKOWY KOMFORT',
   background:'assets/sisu23_night_wide.jpg',
   audio:'assets/welcome_sisu.mp3'
  },
  appearance:{accent:'#D8B87C',layout:'classic'},
  home:{intro:'Witaj w SISU23',note:'Odkryj wyjątkowy komfort pobytu.'},
  rooms:{}
 });
 const copy=x=>JSON.parse(JSON.stringify(x));
 let state={published:{version:1,publishedAt:new Date().toISOString(),content:copy(DEFAULT)},draft:copy(DEFAULT),history:[]};
 fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
 fs.mkdirSync(assetsDir,{recursive:true,mode:0o700});
 if(fs.existsSync(file)){
  const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!parsed||!parsed.published||!Number.isSafeInteger(parsed.published.version)||!parsed.published.content)throw Error('SISU TV content: damaged persistent state');
  state=parsed;
 }
 function persist(){
  const temp=file+'.tmp-'+process.pid;
  fs.writeFileSync(temp,JSON.stringify(state),{mode:0o600});
  fs.renameSync(temp,file);
 }
 function bad(message){throw Object.assign(Error(message),{status:400})}
 function text(x,n=200,optional=false){
  if(optional&&(x===undefined||x===null))return '';
  if(typeof x!=='string'||x.length>n)bad('Nieprawidłowy tekst (maksymalnie '+n+' znaków)');
  return x.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
 }
 function asset(x,kind){
  if(typeof x!=='string'||x.length>140)bad('Nieprawidłowa ścieżka pliku');
  const pattern=kind==='audio'?/\.(?:mp3)$/i:/\.(?:png|jpg|jpeg|webp)$/i;
  if(!pattern.test(x))bad('Niedozwolony typ pliku');
  if(/^assets\/[a-zA-Z0-9_.-]+$/.test(x))return x;
  if(/^\/api\/tv\/content\/assets\/[0-9a-f]{24}\.(?:jpg|png|webp|mp3)$/.test(x))return x;
  bad('Plik musi pochodzić z aplikacji lub biblioteki SISU');
 }
 function welcome(input,partial=false){
  const d=DEFAULT.welcome;
  if(!input||typeof input!=='object'||Array.isArray(input))bad('Nieprawidłowy ekran powitalny');
  const out={};
  const lens={eyebrow:70,title:85,subtitle:220,status:160,footerLeft:90,footerRight:90};
  for(const [key,n] of Object.entries(lens)){
   if(partial&&input[key]===undefined)continue;
   out[key]=text(input[key]===undefined?d[key]:input[key],n);
  }
  for(const key of ['background','audio']){
   if(partial&&input[key]===undefined)continue;
   out[key]=asset(input[key]===undefined?d[key]:input[key],key==='audio'?'audio':'image');
  }
  return out;
 }
 function validate(input){
  if(!input||typeof input!=='object'||Array.isArray(input))bad('Brak treści aktualizacji');
  const a=input.appearance||{},h=input.home||{},r=input.rooms||{};
  if(!a||typeof a!=='object'||Array.isArray(a)||!h||typeof h!=='object'||Array.isArray(h)||!r||typeof r!=='object'||Array.isArray(r))bad('Nieprawidłowa konfiguracja');
  const accent=a.accent===undefined?DEFAULT.appearance.accent:String(a.accent);
  if(!/^#[0-9a-fA-F]{6}$/.test(accent))bad('Kolor musi mieć postać #RRGGBB');
  const layout=a.layout===undefined?'classic':a.layout;
  if(!['classic','editorial'].includes(layout))bad('Niedozwolony układ');
  const output={welcome:welcome(input.welcome||{}),appearance:{accent,layout},
   home:{intro:text(h.intro===undefined?DEFAULT.home.intro:h.intro,110),note:text(h.note===undefined?DEFAULT.home.note:h.note,180)},rooms:{}};
  if(Object.keys(r).length>30)bad('Przekroczono liczbę apartamentów');
  for(const [room,override] of Object.entries(r)){
   if(!validRooms.has(room))bad('Nieprawidłowy numer apartamentu');
   if(!override||typeof override!=='object'||Array.isArray(override))bad('Nieprawidłowy wyjątek apartamentu');
   output.rooms[room]={welcome:override.welcome===undefined?{}:welcome(override.welcome,true)};
  }
  return output;
 }
 function respond(res,status,body){send(res,status,body);return true}
 function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,If-None-Match');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
 }
 function viewContent(req){
  const d=typeof resolveDevice==='function'?resolveDevice(req):null;
  const base=copy(state.published.content);
  const overrides=base.rooms||{};
  delete base.rooms;
  if(d&&d.mode==='room'&&validRooms.has(String(d.room))){
   const ov=overrides[d.room];
   if(ov&&ov.welcome)base.welcome=Object.assign(base.welcome,ov.welcome);
   base.room=String(d.room);
  }
  return base;
 }
 function upload(req,res,ctx){
  const type=String(req.headers['content-type']||'').split(';')[0].toLowerCase().trim();
  const extMap={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','audio/mpeg':'mp3'};
  if(!extMap[type])return respond(res,415,{error:'Dozwolone JPG, PNG, WEBP i MP3'});
  const max=12*1024*1024;
  const chunks=[];
  let size=0,tooLarge=false;
  return new Promise((resolve,reject)=>{
   req.on('data',chunk=>{size+=chunk.length;if(size>max){tooLarge=true;chunks.length=0;}else if(!tooLarge)chunks.push(chunk)});
   req.on('end',()=>{
    if(tooLarge)return resolve(respond(res,413,{error:'Plik większy niż 12 MB'}));
    if(!size)return resolve(respond(res,400,{error:'Pusty plik'}));
    const buf=Buffer.concat(chunks);
    const magic=type==='image/jpeg'?(buf[0]===255&&buf[1]===216&&buf[2]===255):
     type==='image/png'?(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))):
     type==='image/webp'?(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP'):
     (buf.toString('ascii',0,3)==='ID3'||(buf[0]===255&&(buf[1]&224)===224));
    if(!magic)return resolve(respond(res,415,{error:'Nieprawidłowy format pliku'}));
    const name=crypto.createHash('sha256').update(buf).digest('hex').slice(0,24)+'.'+extMap[type];
    const dst=path.join(assetsDir,name);
    if(!fs.existsSync(dst))fs.writeFileSync(dst,buf,{flag:'wx',mode:0o644});
    audit(ctx.user.id,'tv_content_asset_uploaded',{name,bytes:buf.length});
    resolve(respond(res,200,{ok:true,asset:'/api/tv/content/assets/'+name,bytes:buf.length,type}));
   });
   req.on('error',reject);
  });
 }
 async function handle(req,res,p){
  if(p.startsWith('/api/tv/content')){
   cors(res);
   if(req.method==='OPTIONS'){res.statusCode=204;res.end();return true}
   if(req.method==='GET'&&p==='/api/tv/content'){
    const content=viewContent(req);
    const etag='"sisu-tv-'+state.published.version+'-'+(content.room||'global')+'"';
    res.setHeader('ETag',etag);
    if(req.headers['if-none-match']===etag){res.statusCode=304;res.end();return true}
    return respond(res,200,{ok:true,version:state.published.version,publishedAt:state.published.publishedAt,content});
   }
   if(req.method==='GET'&&p.startsWith('/api/tv/content/assets/')){
    const name=p.slice('/api/tv/content/assets/'.length);
    if(!/^[0-9a-f]{24}\.(jpg|png|webp|mp3)$/.test(name))return respond(res,404,{error:'Nie znaleziono pliku'});
    const filePath=path.join(assetsDir,name);
    if(!fs.existsSync(filePath))return respond(res,404,{error:'Nie znaleziono pliku'});
    const types={jpg:'image/jpeg',png:'image/png',webp:'image/webp',mp3:'audio/mpeg'};
    res.setHeader('Content-Type',types[name.split('.').pop()]);
    res.setHeader('Cache-Control','public,max-age=31536000,immutable');
    res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
    fs.createReadStream(filePath).pipe(res);
    return true;
   }
   return respond(res,404,{error:'Nie znaleziono zasobu TV'});
  }
  if(p==='/api/tvs/content'&&req.method==='GET'){
   const ctx=requireUser(req,res,['admin']);if(!ctx)return true;
   return respond(res,200,{ok:true,published:state.published,draft:state.draft,history:state.history.map(x=>({version:x.version,publishedAt:x.publishedAt})),assets:fs.readdirSync(assetsDir).filter(x=>/^[0-9a-f]{24}\.(jpg|png|webp|mp3)$/.test(x)).sort().slice(-40).map(x=>({path:'/api/tv/content/assets/'+x,size:fs.statSync(path.join(assetsDir,x)).size}))});
  }
  if(p.startsWith('/api/tvs/content/')&&req.method==='POST'){
   const ctx=requireUser(req,res,['admin']);if(!ctx)return true;
   if(!csrfOk(req,res,ctx))return true;
   if(p==='/api/tvs/content/assets')return upload(req,res,ctx);
   const body=await jsonBody(req);
   if(p==='/api/tvs/content/draft'){
    state.draft=validate(body.content);
    persist();
    audit(ctx.user.id,'tv_content_draft_saved',{});
    return respond(res,200,{ok:true,draft:state.draft});
   }
   if(p==='/api/tvs/content/publish'){
    if(!Number.isInteger(body.expectedVersion)||body.expectedVersion!==state.published.version)return respond(res,409,{error:'Publikacja zmieniła się. Odśwież panel.'});
    const draft=validate(state.draft);
    state.history.unshift(copy(state.published));
    state.history=state.history.slice(0,12);
    state.published={version:state.published.version+1,publishedAt:new Date().toISOString(),content:draft};
    state.draft=copy(draft);persist();
    audit(ctx.user.id,'tv_content_published',{version:state.published.version});
    return respond(res,200,{ok:true,version:state.published.version});
   }
   if(p==='/api/tvs/content/rollback'){
    const version=body.version;
    const former=state.history.find(x=>x.version===version);
    if(!former)return respond(res,404,{error:'Wersja nie istnieje w historii'});
    state.history=state.history.filter(x=>x.version!==version);
    state.history.unshift(copy(state.published));
    state.history=state.history.slice(0,12);
    const content=validate(former.content);
    state.published={version:state.published.version+1,publishedAt:new Date().toISOString(),content};
    state.draft=copy(content);persist();
    audit(ctx.user.id,'tv_content_rolled_back',{fromVersion:version,newVersion:state.published.version});
    return respond(res,200,{ok:true,version:state.published.version,restoredFrom:version});
   }
  }
  return false;
 }
 return {handle};
};
