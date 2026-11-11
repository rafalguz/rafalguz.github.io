'use strict';
const fs=require('node:fs');
const path=require('node:path');

module.exports=function createHotelExpert({dataDir,send,resolveDevice}){
  const OPTIONS=path.join(dataDir,'options.json');
  const cache=new Map();
  const TTL=60000;
  function opts(){
    try{
      const o=JSON.parse(fs.readFileSync(OPTIONS,'utf8'));
      return {
        enabled:o.hotel_expert_enabled===true,
        base:String(o.hotel_expert_base_url||'').replace(/\/$/,''),
        key:String(o.hotel_expert_api_key||''),
        room401:String(o.hotel_expert_room_401||'')
      };
    }catch{return {enabled:false,base:'',key:'',room401:''};}
  }
  function device(req,res){
    const tv=resolveDevice(req);
    if(!tv){send(res,401,{error:'Telewizor nie jest sparowany'});return null;}
    if(tv.mode!=='room'||String(tv.room)!=='401'){
      send(res,403,{error:'Dane pobytu dostępne tylko dla przypisanego apartamentu'});return null;
    }
    return tv;
  }
  async function api(cfg,route){
    if(!cfg.enabled||!cfg.base||!cfg.key)throw Object.assign(Error('Integracja HotelowyExpert nie jest skonfigurowana'),{status:503});
    const sep=cfg.base.includes('?')?'&':'?';
    let r;
    try{
      r=await fetch(cfg.base+sep+'rest_route='+encodeURIComponent('/agency-xl/v1'+route),{
        headers:{'X-AXL-Key':cfg.key,Accept:'application/json'},
        signal:AbortSignal.timeout(9000),redirect:'manual'
      });
    }catch{throw Object.assign(Error('HotelowyExpert nie odpowiada'),{status:503});}
    if(!r.ok)throw Object.assign(Error('HotelowyExpert odrzucił odczyt ('+r.status+')'),{status:502});
    return r.json().catch(()=>{throw Object.assign(Error('Nieprawidłowa odpowiedź HotelowyExpert'),{status:502});});
  }
  async function guest(room){
    const cfg=opts(),key=String(room),hit=cache.get(key),now=Date.now();
    if(hit&&now-hit.at<TTL)return hit.data;
    const properties=await api(cfg,'/properties');
    const list=Array.isArray(properties)?properties:(Array.isArray(properties&&properties.value)?properties.value:[]);
    const code=room===401?cfg.room401:'';
    const property=list.find(x=>String(x&&x.code)===code);
    if(!property)throw Object.assign(Error('Brak mapowania apartamentu 401 w HotelowyExpert'),{status:404});
    const rdata=await api(cfg,'/reservations');
    const reservations=Array.isArray(rdata)?rdata:(Array.isArray(rdata&&rdata.rezerwacje)?rdata.rezerwacje:[]);
    const today=new Date().toISOString().slice(0,10);
    const active=reservations.filter(x=>String(x&&x.apartament)===String(property.id)&&x.status!=='cancelled'&&x.przyjazd<=today&&x.wyjazd>today)
      .sort((a,b)=>String(b.przyjazd).localeCompare(String(a.przyjazd)))[0]||null;
    const data={ok:true,room:String(room),source:'HotelowyExpert',reservation:active?{
      id:active.id,
      guestName:typeof active.gosc==='string'?active.gosc:null,
      arrival:active.przyjazd||null,
      departure:active.wyjazd||null,
      persons:Number(active.osob)||1,
      children:Number(active.dzieci)||0,
      status:active.status||null,
      channel:active.kanal||null,
      contactReady:!!((active.email||active.e_mail)&&(active.phone||active.telefon))
    }:null};
    cache.set(key,{at:now,data});
    return data;
  }
  async function handle(req,res,p){
    if(p!=='/api/tv/hotel/guest')return false;
    if(req.method!=='GET'){send(res,405,{error:'Metoda nieobsługiwana'});return true;}
    const tv=device(req,res);if(!tv)return true;
    try{send(res,200,await guest(Number(tv.room)));}
    catch(e){send(res,Number.isInteger(e.status)?e.status:500,{error:e.message||'Błąd HotelowyExpert'});}
    return true;
  }
  return {handle};
};