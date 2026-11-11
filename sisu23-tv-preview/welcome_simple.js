/* SISU23 TV 0.7.4 — only a fresh, server-issued TTLock arrival ticket may play welcome. */
(function(){
 'use strict';
 var layer=document.getElementById('sw-demo');
 if(!layer)return;
 var play=document.getElementById('heroPlay');
 var skip=document.getElementById('heroSkip');
 var status=document.getElementById('heroAudioStatus');
 var audio=document.createElement('audio');
 audio.src=window.SISU23OnlineAudio||'assets/welcome_sisu.mp3';
 audio.preload='auto';
 audio.volume=1;
 document.body.appendChild(audio);
 var active=false,finished=true,started=false,watchdog=null,usedFallback=false;
 var pendingAudio=null,activeEventId='';
 var storageKey='sisu23_last_welcome_event_401';
 function get(key){try{return localStorage.getItem(key)}catch(e){return null}}
 function set(key,value){try{localStorage.setItem(key,value)}catch(e){}}
 function clearWatchdog(){if(watchdog){clearTimeout(watchdog);watchdog=null}}
 function finish(){
  if(finished)return;
  finished=true;active=false;started=false;clearWatchdog();
  try{audio.pause()}catch(e){}
  layer.className='sw-hidden';layer.setAttribute('aria-hidden','true');
  var ev=document.createEvent('Event');ev.initEvent('sisu23-welcome-finished',false,false);document.dispatchEvent(ev);
 }
 function setAudioSource(url){
  if(typeof url!=='string'||!url)return;
  if(active){pendingAudio=url;return}
  audio.src=url;usedFallback=false;
 }
 function beginVoice(){
  if(!active||finished)return;
  try{
   var promise=audio.play();
   if(promise&&promise.catch)promise.catch(function(){
    if(finished||started)return;
    play.style.display='inline-block';
    status.textContent='Nacisnij OK, aby uslyszec powitanie.';
    try{play.focus()}catch(e){}
   });
  }catch(e){play.style.display='inline-block';status.textContent='Nacisnij OK, aby uslyszec powitanie.'}
 }
 function playForArrival(eventId){
  if(!/^[a-f0-9]{32}$/.test(String(eventId||'')))return false;
  if(eventId===activeEventId||eventId===get(storageKey))return false;
  // Store BEFORE playback; the same event cannot replay after an app crash or TV reboot.
  activeEventId=eventId;set(storageKey,eventId);
  if(!finished)finish();
  if(pendingAudio){audio.src=pendingAudio;pendingAudio=null;usedFallback=false}
  try{audio.currentTime=0}catch(e){}
  active=true;finished=false;started=false;
  play.style.display='none';
  status.textContent='Witamy Panstwa w apartamentach SISU23.';
  layer.className='';layer.setAttribute('aria-hidden','false');
  beginVoice();
  return true;
 }
 audio.addEventListener('playing',function(){
  if(finished)return;
  started=true;play.style.display='none';
  status.textContent='Zyczymy Panstwu wyjatkowego pobytu.';
  clearWatchdog();watchdog=setTimeout(finish,39000);
 });
 audio.addEventListener('ended',finish);
 audio.addEventListener('error',function(){
  if(finished)return;
  if(!usedFallback&&audio.src.indexOf('welcome_sisu.mp3')===-1){
   usedFallback=true;audio.src='assets/welcome_sisu.mp3';beginVoice();return;
  }
  status.textContent='Nagranie jest chwilowo niedostepne. Mozna kontynuowac.';
  play.style.display='inline-block';
 });
 play.addEventListener('click',beginVoice);
 skip.addEventListener('click',finish);
 document.addEventListener('keydown',function(e){
  if(finished)return;
  var key=e.keyCode||e.which;
  if(key===10009){e.preventDefault();e.stopPropagation();finish();return}
  if(key===13||key===23){
   e.preventDefault();e.stopPropagation();
   if(!started)beginVoice();else finish();
  }
 },true);
 // No automatic welcome on app startup, watchdog restart, focus or visibility resume.
 document.addEventListener('visibilitychange',function(){
  if(document.hidden&&!finished)finish();
 },false);
 layer.className='sw-hidden';layer.setAttribute('aria-hidden','true');
 window.SISUHomeWelcomeDemo={finish:finish,version:'0.7.4'};
 window.SISU23Welcome={setAudioSource:setAudioSource,playForArrival:playForArrival};
 window.SISU23Arrival={playForArrival:playForArrival};
})();
