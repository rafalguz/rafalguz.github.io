'use strict';
// Server-authorized, at-most-once welcome ticket for a newly used TTLock code.
// No access to the raw PIN: Home Assistant stores only a salted SHA-256 digest.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
module.exports=function makeWelcome({dataDir,haApi,resolveDevice,send,jsonBody}) {
  const FILE=path.join(dataDir,'sisu-welcome-claims.json');
  const HASH_ENTITY='input_text.401_kod_uzyty_do_powitania_skrot_sha_256';
  const MAX_AGE_MS=5*60*1000;
  let claims={};
  if(fs.existsSync(FILE)) {
    const stored=JSON.parse(fs.readFileSync(FILE,'utf8'));
    if(stored&&typeof stored==='object'&&!Array.isArray(stored))claims=stored;
  }
  // Isolated manual test path: only a paired TV in apartment 401 can poll.
  // A Home Assistant input_button triggers an explicit one-shot request.
  // It never changes TTLock arrival claims, room status, or guest reservations.
  const TEST_TRIGGER='input_button.sisu_401_test_powitania_tv';
  const TEST_STATUS='input_text.sisu_401_test_powitania_status';
  const TEST_DB=path.join(dataDir,'sisu-welcome-manual-tests.json');
  let lastTestPress='';
  let pendingTest=null;
  try{
    const old=JSON.parse(fs.readFileSync(TEST_DB,'utf8'));
    if(typeof old.lastTestPress==='string')lastTestPress=old.lastTestPress;
  }catch(e){if(e.code!=='ENOENT')console.warn('SISU welcome test state unavailable:',e.message);}
  function saveTestClaim(){
    const tmp=TEST_DB+'.tmp-'+process.pid;
    fs.writeFileSync(tmp,JSON.stringify({lastTestPress}),{mode:0o600});
    fs.renameSync(tmp,TEST_DB);
  }
  async function testStatus(value){
    try{await haApi('/services/input_text/set_value','POST',{entity_id:TEST_STATUS,value:value.slice(0,240)});}
    catch(e){console.warn('SISU welcome test report:',e.message);}
  }
  async function handleManual(req,res,p){
    if(p!=='/api/tv/welcome/test/poll'&&p!=='/api/tv/welcome/test/ack')return false;
    const d=resolveDevice(req);
    if(!d||d.mode!=='room'||String(d.room)!=='401'){
      send(res,403,{ok:false,error:'Test only for paired TV 401'});return true;
    }
    if(p==='/api/tv/welcome/test/poll'){
      if(req.method!=='GET'){send(res,405,{ok:false});return true;}
      const states=await haApi('/states');
      if(!Array.isArray(states))throw Error('Home Assistant unavailable');
      const entry=states.find(x=>x.entity_id===TEST_TRIGGER);
      const press=String(entry?.state||'');
      const age=Date.now()-Date.parse(press);
      if(!Number.isFinite(age)||age<(-15000)||age>150000||lastTestPress===press){
        send(res,200,{ok:true,play:false});return true;
      }
      // Claim before sending: no duplicate replay after TV or server restart.
      lastTestPress=press;saveTestClaim();
      const eventId=crypto.randomBytes(16).toString('hex');
      pendingTest={eventId,deviceId:d.id,created:Date.now()};
      await testStatus('TV 401: polecenie testowe dostarczone do aplikacji');
      send(res,200,{ok:true,play:true,eventId});return true;
    }
    if(req.method!=='POST'){send(res,405,{ok:false});return true;}
    const body=await jsonBody(req);
    const stage=String(body?.stage||'');
    const eventId=String(body?.eventId||'');
    if(!pendingTest||pendingTest.eventId!==eventId||pendingTest.deviceId!==d.id
        ||Date.now()-pendingTest.created>120000){
      send(res,409,{ok:false,error:'Test event expired'});return true;
    }
    const labels={opened:'ekran powitania otwarty',playing:'MP3: zdarzenie playing',
      ended:'MP3: odtwarzanie zakończone',error:'MP3: błąd odtwarzania',blocked:'MP3: odtwarzanie zablokowane'};
    if(!Object.hasOwn(labels,stage)){send(res,400,{ok:false,error:'Invalid stage'});return true;}
    await testStatus('TV 401: '+labels[stage]);
    if(stage==='ended'||stage==='error'||stage==='blocked')pendingTest=null;
    send(res,200,{ok:true});return true;
  }
  function persist() {
    fs.mkdirSync(dataDir,{recursive:true,mode:0o700});
    const tmp=FILE+'.tmp-'+process.pid;
    fs.writeFileSync(tmp,JSON.stringify(claims),{mode:0o600});
    fs.renameSync(tmp,FILE);
  }
  // Upgrade existing claims before any new arrival is processed. Prior versions
  // stored only the PIN digest; record its current timestamp so that an explicit
  // manual reset with the same PIN is a distinct, one-shot arrival.
  const migration=(async()=>{
    const old=claims['401'];
    if(!/^[a-f0-9]{64}$/.test(old||''))return;
    try{
      const states=await haApi('/states');
      if(!Array.isArray(states))return;
      const entry=states.find(x=>x.entity_id===HASH_ENTITY);
      if(entry?.state===old&&Number.isFinite(Date.parse(entry.last_changed||''))){
        claims['401']=old+':'+entry.last_changed;
        persist();
        console.info('SISU TV 401: migrated legacy arrival claim');
      }
    }catch(err){
      console.warn('SISU TV 401: legacy claim migration deferred:',err.message);
    }
  })();
  async function handle(req,res,p) {
    if(await handleManual(req,res,p))return true;
    if(p!=='/api/tv/welcome/claim')return false;
    if(req.method!=='POST'){send(res,405,{error:'Method not allowed'});return true;}
    const d=resolveDevice(req);
    if(!d||d.mode!=='room'||d.room!==401){
      send(res,403,{error:'TV not paired with apartment 401'});return true;
    }
    await jsonBody(req);
    await migration;
    const states=await haApi('/states');
    if(!Array.isArray(states))throw Error('Unavailable Home Assistant states');
    const entry=states.find(x=>x.entity_id===HASH_ENTITY);
    const current=entry?.state||'';
    const changed=Date.parse(entry?.last_changed||'');
    const age=Date.now()-changed;
    if(!/^[a-f0-9]{64}$/.test(current)||!Number.isFinite(age)||age<(-15000)||age>MAX_AGE_MS){
      send(res,200,{ok:true,welcome:false});return true;
    }
    const key='401';
    // Identify the actual arrival, not just the PIN. A manual new-stay reset
    // clears the HA helper, so reusing the same PIN creates a NEW last_changed.
    // Regular repeat entries leave the helper unchanged and never replay.
    const arrival=current+':'+entry.last_changed;
    if(claims[key]===arrival){
      send(res,200,{ok:true,welcome:false});return true;
    }
    // Migrate existing installations: older claims contain only the PIN hash.
    // Suppress the already-served arrival on the first request after upgrade.
    if(claims[key]===current){
      claims[key]=arrival;
      persist();
      send(res,200,{ok:true,welcome:false});return true;
    }
    // Commit BEFORE replying, so replays, app crashes and retries cannot claim twice.
    claims[key]=arrival;
    persist();
    const eventId=crypto.randomBytes(16).toString('hex');
    console.info('SISU TV 401: issued one-time arrival event '+eventId.slice(0,8));
    send(res,200,{ok:true,welcome:true,eventId});
    return true;
  }
  return {handle};
};
