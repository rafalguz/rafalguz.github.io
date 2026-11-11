/* SISU23 TV 0.7.4 — pairing, resilient heartbeats and server-issued one-shot arrivals. */
(function(){
 'use strict';
 var SERVER='https://sisu-panel.tailb375ed.ts.net';
 var APP_VERSION='0.7.4';
 var KEY_ID='sisu23_tv_device_id';
 var KEY_TOKEN='sisu23_tv_pair_token';
 var KEY_ROOM='sisu23_tv_last_room';
 var sessionDismissed=false,pairTimer=null,heartbeatTimer=null,welcomeTimer=null,recoveryTimer=null;
 var pairRequest=null,paired=false,requestingConfig=false,welcomeInFlight=false,heartbeatInFlight=false;
 var layer=document.getElementById('tvPairLayer');
 if(!layer)return;
 function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
 function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
 function del(k){try{localStorage.removeItem(k)}catch(e){}}
 function validRoom(v){return /^(10[1-8]|20[1-8]|30[1-8]|40[1-6])$/.test(String(v||''))}
 function randomId(){
  var bytes=new Uint8Array(16);
  if(window.crypto&&window.crypto.getRandomValues)window.crypto.getRandomValues(bytes);
  else for(var i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  return 'sisu23_'+Array.prototype.map.call(bytes,function(b){return ('0'+b.toString(16)).slice(-2)}).join('');
 }
 var deviceId=get(KEY_ID);
 if(!deviceId||!/^[a-zA-Z0-9_-]{12,100}$/.test(deviceId)){deviceId=randomId();set(KEY_ID,deviceId)}
 function xhr(method,p,body,token,done){
  var req=new XMLHttpRequest(),completed=false;
  function finish(code,data){if(completed)return;completed=true;done(code,data||{})}
  try{
   req.open(method,SERVER+p,true);
   req.timeout=9000;
   req.setRequestHeader('Accept','application/json');
   if(body!==null)req.setRequestHeader('Content-Type','application/json');
   if(token)req.setRequestHeader('Authorization','Bearer '+token);
   req.onreadystatechange=function(){
    if(req.readyState!==4)return;
    var data={};try{data=JSON.parse(req.responseText||'{}')}catch(e){}
    finish(req.status,data);
   };
   req.onerror=req.ontimeout=function(){finish(0,{error:'Server unreachable'})};
   req.send(body===null?null:JSON.stringify(body));
  }catch(e){finish(0,{error:'Request failed'})}
 }
 function status(msg){var el=document.getElementById('tvPairStatus');if(el)el.textContent=msg}
 function hide(){
  layer.classList.add('hidden');layer.setAttribute('aria-hidden','true');
  clearInterval(pairTimer);pairTimer=null;
  if(document.activeElement&&layer.contains(document.activeElement))document.activeElement.blur();
 }
 function show(){
  if(sessionDismissed||paired)return;
  layer.classList.remove('hidden');layer.setAttribute('aria-hidden','false');
  var btn=document.getElementById('tvPairSkip');if(btn)btn.focus();
 }
 function applyRoom(data){
  if(!data||!validRoom(data.room))return;
  set(KEY_ROOM,String(data.room));
  if(window.SISU23&&window.SISU23.setRoom)window.SISU23.setRoom(String(data.room));
  if(window.SISU23Comfort&&window.SISU23Comfort.setRoom)window.SISU23Comfort.setRoom(String(data.room));
 }
 function clearPaired(){
  del(KEY_TOKEN);paired=false;pairRequest=null;
  clearInterval(heartbeatTimer);heartbeatTimer=null;
  clearInterval(welcomeTimer);welcomeTimer=null;
  heartbeatInFlight=false;welcomeInFlight=false;
  if(!sessionDismissed)setTimeout(startPair,3000);
 }
 function checkWelcome(){
  if(!paired||welcomeInFlight||!window.SISU23Arrival||typeof window.SISU23Arrival.playForArrival!=='function')return;
  var token=get(KEY_TOKEN);if(!token||!/^[a-f0-9]{64}$/.test(token))return;
  welcomeInFlight=true;
  xhr('POST','/api/tv/welcome/claim',{},token,function(code,data){
   welcomeInFlight=false;
   if(code===200&&data.welcome===true&&/^[a-f0-9]{32}$/.test(data.eventId||'')){
    window.SISU23Arrival.playForArrival(data.eventId);
   }else if(code===401){clearPaired()}
  });
 }
 function heartbeat(){
  if(!paired||heartbeatInFlight)return;
  var token=get(KEY_TOKEN);if(!token||!/^[a-f0-9]{64}$/.test(token))return;
  heartbeatInFlight=true;
  xhr('POST','/api/tv/heartbeat',{version:APP_VERSION},token,function(code,data){
   heartbeatInFlight=false;
   if(code===200){paired=true;applyRoom(data);checkWelcome()}
   else if(code===401){clearPaired()}
   // Any transient failure is retried by the existing 60-second interval.
  });
 }
 function connected(data){
  paired=true;sessionDismissed=false;
  applyRoom(data);hide();
  if(!heartbeatTimer)heartbeatTimer=setInterval(heartbeat,60000);
  if(!welcomeTimer)welcomeTimer=setInterval(checkWelcome,10000);
  heartbeat();
  checkWelcome();
 }
 function connectExisting(){
  if(paired||requestingConfig)return;
  var token=get(KEY_TOKEN);if(!token||!/^[a-f0-9]{64}$/.test(token))return;
  requestingConfig=true;
  xhr('GET','/api/tv/config',null,token,function(code,data){
   requestingConfig=false;
   if(code===200){connected(data);return}
   if(code===401){clearPaired();return}
   // Keep retrying a network failure; do not show a pairing dialog or restart the TV.
  });
 }
 function finishPair(data){
  if(!data||!/^[a-f0-9]{64}$/.test(data.token||''))return;
  set(KEY_TOKEN,data.token);pairRequest=null;
  connected(data.config);
  var ev=document.createEvent('Event');ev.initEvent('sisu23-tv-paired',false,false);document.dispatchEvent(ev);
 }
 function poll(){
  if(!pairRequest||sessionDismissed)return;
  xhr('POST','/api/tv/pair/poll',{deviceId:deviceId,requestId:pairRequest},null,function(code,data){
   if(code===200&&data.status==='paired'){finishPair(data);return}
   if(code===200&&data.status==='waiting'){status('Oczekiwanie na przypisanie przez administratora...');return}
   if(code===0){status('Brak polaczenia. Ponawiam probe...');return}
   status('Kod wygasl. Wybierz Nowy kod lub tryb testowy.');
   clearInterval(pairTimer);pairTimer=null;
  });
 }
 function startPair(){
  if(paired||sessionDismissed||pairRequest)return;
  clearInterval(pairTimer);pairTimer=null;
  var el=document.getElementById('tvPairCode');if(el)el.textContent='--------';
  status('Laczenie z SISU Centrum...');show();
  xhr('POST','/api/tv/pair/start',{deviceId:deviceId,version:APP_VERSION},null,function(code,data){
   if(sessionDismissed||paired)return;
   if(code===409){status('Telewizor zarejestrowany. Administrator moze usunac stare przypisanie.');return}
   if(code!==200||!data.requestId){status('Serwer jest niedostepny. Mozesz kontynuowac w trybie demonstracyjnym.');return}
   pairRequest=data.requestId;if(el)el.textContent=data.code;
   status('W panelu SISU: Telewizory — wpisz kod i wybierz apartament.');
   pairTimer=setInterval(poll,5000);poll();
  });
 }
 function demoRoom(){
  if(window.SISU23&&window.SISU23.setRoom)window.SISU23.setRoom('401');
  if(window.SISU23Comfort&&window.SISU23Comfort.setRoom)window.SISU23Comfort.setRoom('401');
 }
 var skip=document.getElementById('tvPairSkip');
 if(skip)skip.addEventListener('click',function(){sessionDismissed=true;pairRequest=null;demoRoom();hide()});
 var again=document.getElementById('tvPairAgain');
 if(again)again.addEventListener('click',function(){sessionDismissed=false;pairRequest=null;startPair()});
 var last=get(KEY_ROOM);if(validRoom(last))applyRoom({room:last});
 if(get(KEY_TOKEN)&&/^[a-f0-9]{64}$/.test(get(KEY_TOKEN))){
  connectExisting();
  recoveryTimer=setInterval(function(){if(!paired)connectExisting()},15000);
 }else{
  setTimeout(startPair,4000);
 }
 window.SISU23TVPairing={
  active:function(){return !layer.classList.contains('hidden')},
  skip:function(){sessionDismissed=true;pairRequest=null;demoRoom();hide()},
  start:startPair,
  version:APP_VERSION
 };
})();
