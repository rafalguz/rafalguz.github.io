'use strict';
// SISU TV pairing and room isolation. No guest -> HA service calls exposed here.
// All access to room data comes from a server-side allowlist, never a TV supplied room.
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

module.exports=function makeTvRegistry({dataDir,rooms,send,requireUser,csrfOk,jsonBody,audit,clientKey}) {
  const allowed=new Set(rooms.map(Number));
  const dbPath=path.join(dataDir,'sisu-tvs.json');
  const PAIR_TTL=10*60*1000;
  const ONLINE_TTL=2*60*1000;
  const pending=new Map();
  const seen=new Map();
  const rate=new Map();
  let db={devices:[]};

  if(fs.existsSync(dbPath)){
    const parsed=JSON.parse(fs.readFileSync(dbPath,'utf8'));
    if(!parsed||!Array.isArray(parsed.devices))throw Error('SISU TV: invalid stored pairing file');
    db={devices:parsed.devices};
  }
  function reply(res,status,data){send(res,status,data);return true;}
  function digest(s){return crypto.createHash('sha256').update(s).digest('hex')}
  function persist(){
    fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
    const tmp=dbPath+'.tmp-'+process.pid;
    fs.writeFileSync(tmp,JSON.stringify(db),{mode:0o600});
    fs.renameSync(tmp,dbPath);
  }
  function expire(){
    const now=Date.now();
    for(const [k,v] of pending) if(v.expires<=now)pending.delete(k);
    for(const [k,v] of rate) if(v.until<=now)rate.delete(k);
    if(pending.size>160)for(const [k,v] of pending) if(v.expires<=now)pending.delete(k);
  }
  function asRoom(v){
    const n=Number(v);
    return Number.isInteger(n)&&allowed.has(n)?n:null;
  }
  function asId(v){return typeof v==='string'&&/^[a-zA-Z0-9_-]{12,100}$/.test(v)?v:null}
  function version(v){return typeof v==='string'?v.slice(0,32).replace(/[^a-zA-Z0-9. -]/g,''):''}
  function withCors(req,res){
    // Tizen file:// apps have Origin:null. TV endpoints use bearer credentials only, never cookies.
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    res.setHeader('Vary','Origin');
  }
  function tokenDevice(req){
    const h=String(req.headers.authorization||'');
    const m=/^Bearer ([a-f0-9]{64})$/i.exec(h);
    if(!m)return null;
    const hash=digest(m[1]);
    return db.devices.find(x=>x.tokenHash===hash)||null;
  }
  function view(d){
    const last=seen.get(d.id)||d.lastSeen||null;
    return {id:d.id,deviceId:d.deviceId.slice(0,12),name:d.name||'Samsung TV',
      room:d.room,mode:d.mode,version:d.version||'—',lastSeen:last,
      online:!!(last&&Date.now()-new Date(last).getTime()<ONLINE_TTL),
      registeredAt:d.registeredAt};
  }
  function config(d){
    return {ok:true,deviceId:d.id,room:String(d.room),mode:d.mode,
      appVersion:d.version||'',controlsEnabled:false,capabilities:{lights:[],climate:[]},
      notice:d.mode==='demo'?'Tryb testowy — bez sterowania urządzeniami':'Sterowanie nieaktywne do czasu przypisania urządzeń przez administratora'};
  }
  function quota(key,max,period=10*60000){
    // Per pairing request; 30 televisions may share a single Funnel proxy IP.
    const now=Date.now(),s=rate.get(key)||{n:0,until:now+period};
    if(s.until<now){s.n=0;s.until=now+period}
    s.n++;
    rate.set(key,s);
    if(rate.size>3000)for(const [k,v] of rate)if(v.until<now)rate.delete(k);
    return s.n<=max;
  }
  async function handle(req,res,p){
    expire();
    if(p.startsWith('/api/tv/')){
      withCors(req,res);
      if(req.method==='OPTIONS'){res.statusCode=204;res.end();return true}
    }
    if(req.method==='POST'&&p==='/api/tv/pair/start'){
      if(!quota('start:'+clientKey(req),180))return reply(res,429,{error:'Limit prób parowania'});
      if(pending.size>=100)return reply(res,503,{error:'Limit oczekujących telewizorów'});
      const body=await jsonBody(req);
      const deviceId=asId(body.deviceId);
      if(!deviceId)return reply(res,400,{error:'Nieprawidłowy identyfikator urządzenia'});
      if(db.devices.some(x=>x.deviceId===deviceId))return reply(res,409,{error:'Telewizor jest już przypisany. Poproś administratora o odłączenie starego wpisu.'});
      for(const [k,v] of pending)if(v.deviceId===deviceId)pending.delete(k);
      let code;
      do{code=String(crypto.randomInt(0,100000000)).padStart(8,'0')}while([...pending.values()].some(x=>x.code===code));
      const requestId=crypto.randomBytes(24).toString('hex');
      pending.set(requestId,{requestId,code,deviceId,version:version(body.version),created:Date.now(),expires:Date.now()+PAIR_TTL,room:null,mode:null});
      return reply(res,200,{ok:true,requestId,code,expiresIn:600});
    }
    if(req.method==='POST'&&p==='/api/tv/pair/poll'){
      const body=await jsonBody(req);
      const id=typeof body.requestId==='string'?body.requestId:'';
      if(!/^[a-f0-9]{48}$/.test(id))return reply(res,404,{error:'Parowanie wygasło'});
      if(!quota('poll:'+id,145))return reply(res,429,{error:'Zbyt wiele prób odczytu kodu'});
      const rec=pending.get(id);
      if(!/^[a-f0-9]{48}$/.test(id)||!rec||rec.deviceId!==body.deviceId)return reply(res,404,{error:'Parowanie wygasło'});
      if(!rec.room)return reply(res,200,{ok:true,status:'waiting',expiresIn:Math.max(0,Math.floor((rec.expires-Date.now())/1000))});
      if(db.devices.some(x=>x.deviceId===rec.deviceId))return reply(res,409,{error:'Telewizor już przypisany'});
      if(rec.mode==='room'&&db.devices.some(x=>x.room===rec.room&&x.mode==='room'))return reply(res,409,{error:'Apartament zajęty'});
      const token=crypto.randomBytes(32).toString('hex');
      const d={id:crypto.randomUUID(),deviceId:rec.deviceId,tokenHash:digest(token),name:'Samsung TV',room:rec.room,mode:rec.mode,version:rec.version,registeredAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
      db.devices.push(d);
      persist();pending.delete(id);
      seen.set(d.id,new Date().toISOString());
      return reply(res,200,{ok:true,status:'paired',token,config:config(d)});
    }
    if(req.method==='GET'&&p==='/api/tv/config'){
      const d=tokenDevice(req);
      if(!d)return reply(res,401,{error:'Telewizor nieprzypisany'});
      return reply(res,200,config(d));
    }
    if(req.method==='POST'&&p==='/api/tv/heartbeat'){
      const d=tokenDevice(req);
      if(!d)return reply(res,401,{error:'Telewizor nieprzypisany'});
      const body=await jsonBody(req);
      const v=version(body.version);
      if(v)d.version=v;
      const now=new Date().toISOString();
      seen.set(d.id,now);
      if(!d.lastSeen||Date.now()-new Date(d.lastSeen).getTime()>10*60000||v!==d.lastVersion){
        d.lastSeen=now;d.lastVersion=v;persist();
      }
      return reply(res,200,config(d));
    }
    if(p==='/api/tvs'&&req.method==='GET'){
      const ctx=requireUser(req,res,['admin']);if(!ctx)return true;
      return reply(res,200,{ok:true,devices:db.devices.map(view),pending:[...pending.values()].map(x=>({code:x.code,deviceId:x.deviceId.slice(0,12),version:x.version,created:x.created,expires:x.expires,approved:!!x.room})),rooms:[...allowed].sort((a,b)=>a-b)});
    }
    if(p.startsWith('/api/tvs/')&&req.method==='POST'){
      const ctx=requireUser(req,res,['admin']);if(!ctx)return true;
      if(!csrfOk(req,res,ctx))return true;
      const body=await jsonBody(req);
      if(p==='/api/tvs/approve'){
        const code=String(body.code||'');
        const room=asRoom(body.room);
        const mode=body.mode==='demo'?'demo':body.mode==='room'?'room':null;
        if(!/^\d{8}$/.test(code)||!room||!mode)return reply(res,400,{error:'Niepoprawny kod, apartament lub tryb'});
        const rec=[...pending.values()].find(x=>x.code===code);
        if(!rec||rec.expires<=Date.now()||rec.room)return reply(res,404,{error:'Kod wygasł lub został już użyty'});
        if(mode==='room'&&db.devices.some(x=>x.room===room&&x.mode==='room'))return reply(res,409,{error:'Do tego apartamentu przypisano już telewizor. Najpierw go odłącz.'});
        rec.room=room;rec.mode=mode;
        audit(ctx.user.id,'tv_pair_approved',{deviceId:rec.deviceId.slice(0,12),room,mode});
        return reply(res,200,{ok:true,room,mode,status:'approved'});
      }
      if(p==='/api/tvs/revoke'){
        const i=db.devices.findIndex(x=>x.id===body.id);
        if(i<0)return reply(res,404,{error:'Nie znaleziono telewizora'});
        const d=db.devices.splice(i,1)[0];
        seen.delete(d.id);persist();
        audit(ctx.user.id,'tv_revoked',{device:d.id,room:d.room});
        return reply(res,200,{ok:true});
      }
      if(p==='/api/tvs/reassign'){
        const d=db.devices.find(x=>x.id===body.id);
        const room=asRoom(body.room);
        if(!d||!room)return reply(res,404,{error:'Nie znaleziono telewizora lub apartamentu'});
        if(d.mode==='room'&&db.devices.some(x=>x.id!==d.id&&x.room===room&&x.mode==='room'))return reply(res,409,{error:'Apartament zajęty'});
        d.room=room;persist();
        audit(ctx.user.id,'tv_reassigned',{device:d.id,room});
        return reply(res,200,{ok:true,room});
      }
      return reply(res,404,{error:'Nie znaleziono akcji TV'});
    }
    return false;
  }
  return {handle,resolveDevice:(req)=>{const d=tokenDevice(req);return d?{room:d.room,mode:d.mode}:null}};
};