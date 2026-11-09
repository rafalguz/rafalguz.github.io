'use strict';
// Only repairs an already visible SISU23 app on the explicitly allowlisted TV 401.
// Never powers a TV on, changes input, or interrupts another app.
module.exports=function startTvWatchdog({targets}) {
  const TV_HOST='192.168.1.238';
  const APP_ID='RGKSISU232.Sisu23TV';
  const URL='http://'+TV_HOST+':8001/api/v2/applications/'+APP_ID;
  const CHECK_MS=60*1000;
  const STALE_MS=5*60*1000;
  const GRACE_MS=3*60*1000;
  const COOLDOWN_MS=30*60*1000;
  const boot=Date.now();
  let busy=false,consecutive=0,lastAttempt=0;
  async function request(method) {
    const response=await fetch(URL,{method,signal:AbortSignal.timeout(4500),redirect:'error'});
    if(!response.ok)throw Error('Samsung REST returned '+response.status);
    return method==='GET'?response.json():null;
  }
  async function check(){
    if(busy||Date.now()-boot<GRACE_MS)return;
    busy=true;
    try{
      // Never use a user-supplied host or room in the request URL.
      const records=targets().filter(x=>x.room===401&&x.mode==='room');
      const tv=records[0];
      if(!tv||!tv.lastSeen){consecutive=0;return;}
      const ago=Date.now()-Date.parse(tv.lastSeen);
      if(!Number.isFinite(ago)||ago<STALE_MS||ago>7*24*60*60*1000){consecutive=0;return;}
      if(Date.now()-lastAttempt<COOLDOWN_MS)return;
      const status=await request('GET');
      if(!status||status.id!==APP_ID||status.running!==true||status.visible!==true){
        consecutive=0;
        return; // TV off, guest watching something else, or app not visible
      }
      consecutive++;
      if(consecutive<2)return;
      consecutive=0;
      lastAttempt=Date.now();
      // Only a visibly stuck SISU23 gets relaunched. A restart can replay its greeting,
      // hence the conservative 5-minute delay, two probes, and 30-minute cooldown.
      console.warn('SISU TV 401: no app heartbeat for '+Math.floor(ago/1000)+'s; repairing visible SISU23');
      await request('DELETE');
      await new Promise(resolve=>setTimeout(resolve,1500));
      await request('POST');
      console.info('SISU TV 401: app restart sent; awaiting heartbeat');
    }catch(e){
      consecutive=0;
      console.warn('SISU TV 401 watchdog: '+e.message);
    }finally{busy=false;}
  }
  const timer=setInterval(()=>void check(),CHECK_MS);
  if(timer.unref)timer.unref();
  return {check};
};
