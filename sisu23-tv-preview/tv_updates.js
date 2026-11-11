/* SISU23 0.7.1 – versioned data-only updates for Samsung Tizen.
   HTTPS server provides JSON, not executable scripts; keep local fallback. */
(function(){
 'use strict';
 var SERVER='https://sisu-panel.tailb375ed.ts.net';
 var KEY='sisu23_content_cache_v1';
 var TOKEN='sisu23_tv_pair_token';
 var ROOM='sisu23_tv_last_room';
 var lastVersion=0,currentContent=null,busy=false,lastCheck=0;
 function get(key){try{return localStorage.getItem(key)}catch(e){return null}}
 function put(key,val){try{localStorage.setItem(key,val)}catch(e){}}
 function text(selector,value){
  if(typeof value!=='string')return;
  var el=document.querySelector(selector);
  if(el)el.textContent=value;
 }
 function asset(ref){
  if(typeof ref!=='string')return null;
  if(/^assets\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp|mp3)$/i.test(ref))return ref;
  if(/^\/api\/tv\/content\/assets\/[0-9a-f]{24}\.(jpg|png|webp|mp3)$/.test(ref))return SERVER+ref;
  return null;
 }
 function valid(payload){
  if(!payload||typeof payload!=='object'||!(payload.version>=1)||!payload.content)return false;
  var c=payload.content;
  if(!c.welcome||!c.appearance||!c.home||typeof c.welcome.title!=='string')return false;
  if(c.room){
   var actual=get(ROOM);
   if(String(c.room)!==String(actual||''))return false;
   if(!/^[a-f0-9]{64}$/.test(get(TOKEN)||''))return false;
  }
  if(!/^#[a-fA-F0-9]{6}$/.test(c.appearance.accent||''))return false;
  return !!(asset(c.welcome.background)&&asset(c.welcome.audio));
 }
 function apply(payload){
  if(!valid(payload))return false;
  var c=payload.content,w=c.welcome,a=c.appearance,h=c.home;
  currentContent=c;lastVersion=payload.version;
  text('#sw-demo .hero-tag',w.eyebrow);
  text('#sw-demo h1',w.title);
  text('#sw-demo .hero-content p',w.subtitle);
  text('#sw-demo .hero-foot span:first-child',w.footerLeft);
  text('#sw-demo .hero-foot span:last-child',w.footerRight);
  text('#view-home .sisu-copy-welcome',h.intro);
  text('#view-home .hero-copy p',h.note);
  var layer=document.getElementById('sw-demo');
  if(layer){
   layer.style.backgroundImage='url("'+asset(w.background)+'")';
   if(a.layout==='editorial')layer.classList.add('sw-editorial');
   else layer.classList.remove('sw-editorial');
  }
  if(document.documentElement&&document.documentElement.style)
   document.documentElement.style.setProperty('--sisu-accent',a.accent);
  var audio=asset(w.audio);
  window.SISU23OnlineAudio=audio;
  window.SISU23ContentVersion=lastVersion;
  if(window.SISU23Welcome&&window.SISU23Welcome.setAudioSource)
   window.SISU23Welcome.setAudioSource(audio);
  return true;
 }
 function refresh(force){
  if(busy)return;
  if(!force&&Date.now()-lastCheck<30000)return;
  lastCheck=Date.now();
  busy=true;
  var xhr=new XMLHttpRequest();
  xhr.open('GET',SERVER+'/api/tv/content',true);
  xhr.timeout=8000;
  try{
   xhr.setRequestHeader('Accept','application/json');
   var token=get(TOKEN);
   if(token&&/^[a-f0-9]{64}$/.test(token))xhr.setRequestHeader('Authorization','Bearer '+token);
  }catch(e){}
  xhr.onreadystatechange=function(){
   if(xhr.readyState!==4)return;
   busy=false;
   if(xhr.status!==200)return;
   try{
    var incoming=JSON.parse(xhr.responseText||'{}');
    if(valid(incoming)){
     var data=JSON.stringify(incoming);
     if(data.length<=25000){put(KEY,data);apply(incoming)}
    }
   }catch(e){}
  };
  xhr.onerror=xhr.ontimeout=function(){busy=false};
  try{xhr.send()}catch(e){busy=false}
 }
 try{
  var cached=get(KEY);
  if(cached&&cached.length<=25000)apply(JSON.parse(cached));
 }catch(e){}
 window.SISU23Updates={version:'0.7.1',refresh:refresh,getVersion:function(){return lastVersion},current:function(){return currentContent}};
 document.addEventListener('sisu23-tv-paired',function(){refresh(true)});
 document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh(true)});
 setInterval(function(){refresh(false)},5*60000);
 refresh(true);
})();
