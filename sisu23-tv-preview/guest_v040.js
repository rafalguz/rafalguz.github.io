/* SISU23 TV 0.7.3 — live, per-apartment controls via SISU server.
   No Home Assistant tokens or passwords are stored on television. */
(function(){
'use strict';
var SERVER='https://sisu-panel.tailb375ed.ts.net';
var KEY='sisu23_tv_pair_token';
var room=(window.SISU23&&window.SISU23.room)||'401';
var config=window.SISU23_GUEST_CONFIG||{};
var base={ac:23,salon:22,sypialnia:22,lazienka:22};
var limits={ac:[21,25],salon:[20,24],sypialnia:[20,24],lazienka:[20,24]};
var labels={salon:'Salon',stol:'Nad stołem',kuchnia:'Kuchnia i przedpokój',lazienka:'Łazienka',sypialnia:'Sypialnia'};
var live=null,ready=false,busy=false,notice='Oczekiwanie na sparowanie TV z apartamentem';
var lastRefresh=0,lastRequest=0;
function $(id){return document.getElementById(id)}
function text(id,v){var el=$(id);if(el)el.textContent=String(v)}
function fmt(n){return typeof n==='number'&&isFinite(n)?n.toFixed(1).replace('.0','').replace('.',','):'—'}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function token(){try{var x=localStorage.getItem(KEY);return /^[0-9a-f]{64}$/.test(x||'')?x:null}catch(e){return null}}
function xhr(method,path,body,done){
 var t=token();
 if(!t){done(0,{error:'Telewizor nie został jeszcze sparowany z SISU'});return}
 var x=new XMLHttpRequest(),completed=false;
 function finish(code,data){if(completed)return;completed=true;done(code,data||{})}
 x.open(method,SERVER+path,true);x.timeout=9000;
 x.setRequestHeader('Authorization','Bearer '+t);
 x.setRequestHeader('Accept','application/json');
 if(body!==null)x.setRequestHeader('Content-Type','application/json');
 x.onreadystatechange=function(){
  if(x.readyState!==4)return;
  var data={};try{data=JSON.parse(x.responseText||'{}')}catch(e){}
  finish(x.status,data);
 };
 x.onerror=x.ontimeout=function(){finish(0,{error:'Nie można połączyć się z serwerem SISU'})};
 try{x.send(body===null?null:JSON.stringify(body))}
 catch(e){finish(0,{error:'Nie udało się wysłać polecenia'})}
}
function toast(message){
 var el=$('toast');if(!el)return;
 el.textContent=message;el.classList.add('show');
 clearTimeout(window.__sisuComfortToast);
 window.__sisuComfortToast=setTimeout(function(){el.classList.remove('show')},3400);
}
function syncStay(){
 var f=config.checkin,t=config.checkout;
 function date(s){if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s))return '—';var a=s.split('-');return a[2]+'.'+a[1]+'.'+a[0]}
 text('infoCheckin',date(f));text('infoCheckout',date(t));
 text('infoStayHint',f&&t?'Termin pobytu przypisany do apartamentu.':'Daty pobytu poda obsługa SISU23.');
}
function render(){
 text('infoRoom',room);
 text('infoFloor',(['1','2','3','4'].indexOf(room.charAt(0))>=0?room.charAt(0)+'. piętro':'—'));
 syncStay();text('guestNotice',notice);
 Object.keys(labels).forEach(function(z){
  var item=live&&live.lights&&live.lights[z],button=$('lightBtn'+z);
  if(!button)return;
  var on=!!(ready&&item&&item.on);
  button.classList.toggle('is-on',on);
  button.disabled=busy||!ready||!item||!item.available;
  button.setAttribute('aria-pressed',on?'true':'false');
  text('lightState'+z,!ready?'—':!item||!item.available?'Niedostępne':on?'Włączone':'Wyłączone');
 });
 var ac=live&&live.climate&&live.climate.ac;
 var acOn=!!(ready&&ac&&ac.available&&ac.mode!=='off');
 var acBtn=$('acToggle');
 if(acBtn){
  acBtn.disabled=busy||!ready||!ac||!ac.available;
  acBtn.classList.toggle('is-on',acOn);
  acBtn.textContent=acOn?'● Włączona':'○ Wyłączona';
  acBtn.setAttribute('aria-pressed',acOn?'true':'false');
 }
 Object.keys(base).forEach(function(z){
  var c=live&&live.climate&&live.climate[z];
  var target=c&&typeof c.target==='number'?c.target:base[z];
  text('target'+z,fmt(target));
  text('base'+z,fmt(base[z])+'°C');
  text('range'+z,fmt(limits[z][0])+'–'+fmt(limits[z][1])+'°C');
  if(z==='ac')text('acMeasured',c&&typeof c.current==='number'?fmt(c.current)+'°C':'—');
  else text('measured'+z,c&&typeof c.current==='number'?fmt(c.current)+'°C':'—');
 });
 var steps=document.querySelectorAll('[data-temp-zone]');
 for(var i=0;i<steps.length;i++){
  var b=steps[i],z=b.getAttribute('data-temp-zone'),step=Number(b.getAttribute('data-step'));
  var c=live&&live.climate&&live.climate[z];
  var target=c&&typeof c.target==='number'?c.target:base[z];
  b.disabled=busy||!ready||!c||!c.available||(z==='ac'&&!acOn)||
    (step<0&&target<=limits[z][0])||(step>0&&target>=limits[z][1]);
 }
 var modes=document.querySelectorAll('[data-ac-mode]');
 for(var m=0;m<modes.length;m++){
  var node=modes[m],value=node.getAttribute('data-ac-mode');
  node.disabled=busy||!ready||!ac||!ac.available;
  node.classList.toggle('is-selected',acOn&&ac.mode===value);
  node.setAttribute('aria-pressed',acOn&&ac.mode===value?'true':'false');
 }
 var fans=document.querySelectorAll('[data-ac-fan]');
 for(var j=0;j<fans.length;j++){
  var f=fans[j],fan=f.getAttribute('data-ac-fan');
  f.disabled=busy||!ready||!acOn;
  f.classList.toggle('is-selected',acOn&&ac.fan===fan);
  f.setAttribute('aria-pressed',acOn&&ac.fan===fan?'true':'false');
 }
 var guard=$('sisuWindowGuard');
 if(guard)guard.textContent=live&&live.windows&&live.windows.acBlocked?'Otwarte okno — klimatyzacja zablokowana':'Zabezpieczenie okien aktywne';
}
function refresh(force){
 if(busy||(!force&&Date.now()-lastRequest<7000))return;
 lastRequest=Date.now();
 if(!token()){
  ready=false;live=null;notice='POŁĄCZ TELEWIZOR Z APARTAMENTEM W PANELU SISU';
  render();return;
 }
 xhr('GET','/api/tv/comfort',null,function(code,data){
  if(code===200&&data&&data.ok&&data.room==='401'){
   room='401';live=data;ready=true;lastRefresh=Date.now();
   notice='POŁĄCZONO · APARTAMENT 401 · DANE NA ŻYWO';
  }else{
   ready=false;
   if(code===403)notice='STEROWANIE W TYM APARTAMENCIE NIE JEST JESZCZE AKTYWNE';
   else if(code===401)notice='WYMAGANE PONOWNE SPAROWANIE TELEWIZORA';
   else notice='BRAK POŁĄCZENIA Z SISU · PONAWIAM ODCZYT';
  }
  render();
 });
}
function sendAction(payload,successText){
 if(busy||!ready){toast('Sterowanie chwilowo niedostępne');return}
 busy=true;render();
 xhr('POST','/api/tv/comfort',payload,function(code,result){
  busy=false;
  if(code===200&&result&&result.ok){
   toast(successText);
   refresh(true);
  }else{
   toast((result&&result.error)||'Nie można wykonać polecenia');
   refresh(true);
  }
 });
}
function findControl(start){
 var n=start;
 while(n&&n!==document){
  if(n.getAttribute&&(n.hasAttribute('data-light-toggle')||n.hasAttribute('data-ac-toggle')||
     n.hasAttribute('data-temp-zone')||n.hasAttribute('data-ac-mode')||n.hasAttribute('data-ac-fan')))return n;
  n=n.parentNode;
 }
 return null;
}
document.addEventListener('click',function(ev){
 var el=findControl(ev.target);if(!el||el.disabled)return;
 if(el.hasAttribute('data-light-toggle')){
  var zone=el.getAttribute('data-light-toggle');
  if(!Object.prototype.hasOwnProperty.call(labels,zone))return;
  var old=live&&live.lights&&live.lights[zone];
  if(!old||!old.available)return;
  var value=old.on?'off':'on';
  sendAction({kind:'light',zone:zone,value:value},labels[zone]+': '+(value==='on'?'włączone':'wyłączone'));
 }else if(el.hasAttribute('data-ac-toggle')){
  var ac=live&&live.climate&&live.climate.ac,on=ac&&ac.mode!=='off';
  sendAction({kind:'mode',zone:'ac',value:on?'off':'heat'},on?'Klimatyzacja wyłączona':'Klimatyzacja: grzanie');
 }else if(el.hasAttribute('data-ac-mode')){
  var mode=el.getAttribute('data-ac-mode');
  sendAction({kind:'mode',zone:'ac',value:mode},'Klimatyzacja — zmieniono tryb');
 }else if(el.hasAttribute('data-ac-fan')){
  var fan=el.getAttribute('data-ac-fan');
  sendAction({kind:'fan',zone:'ac',value:fan},'Nawiew — zaktualizowano');
 }else if(el.hasAttribute('data-temp-zone')){
  var z=el.getAttribute('data-temp-zone'),step=Number(el.getAttribute('data-step'));
  if(!Object.prototype.hasOwnProperty.call(base,z)||!isFinite(step))return;
  var c=live&&live.climate&&live.climate[z];
  var old=c&&typeof c.target==='number'?c.target:base[z];
  var target=clamp(Math.round((old+step)*2)/2,limits[z][0],limits[z][1]);
  sendAction({kind:'target',zone:z,value:target},'Ustawiono '+fmt(target)+'°C');
 }
 ev.preventDefault();
},false);
document.addEventListener('sisu23-tv-paired',function(){setTimeout(function(){refresh(true)},350)});
document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh(true)});
window.addEventListener('focus',function(){refresh(true)});
window.SISU23Comfort={version:'0.7.3',setRoom:function(n){room=String(n);render();refresh(true)},
  refresh:function(){refresh(true)},getState:function(){return {room:room,connected:ready,updated:lastRefresh,lights:live&&live.lights||null,climate:live&&live.climate||null}}};
render();setTimeout(function(){refresh(true)},1100);setInterval(function(){refresh(false)},12000);
})();