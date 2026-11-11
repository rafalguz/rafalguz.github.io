/* SISU23 browser preview — isolated from real apartment control. */
(function(){
'use strict';
var states={salon:false,stol:false,kuchnia:false,lazienka:false,sypialnia:false};
var temps={ac:23,salon:22,sypialnia:22,lazienka:22};
var acOn=false,acMode='heat',acFan='auto';
function $(id){return document.getElementById(id)}
function toast(msg){var t=$('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__previewToast);window.__previewToast=setTimeout(function(){t.classList.remove('show')},2400)}
function render(){
 Object.keys(states).forEach(function(z){
  var b=$('lightBtn'+z),s=$('lightState'+z);
  if(b){b.disabled=false;b.classList.toggle('is-on',states[z]);b.setAttribute('aria-pressed',states[z]?'true':'false')}
  if(s)s.textContent=states[z]?'Włączone':'Wyłączone';
 });
 var ac=$('acToggle');
 if(ac){ac.disabled=false;ac.classList.toggle('is-on',acOn);ac.textContent=acOn?'● Włączona':'○ Wyłączona'}
 Object.keys(temps).forEach(function(z){var x=$('target'+z);if(x)x.textContent=String(temps[z]).replace('.',',')});
 ['salon','sypialnia','lazienka'].forEach(function(z){var m=$('measured'+z);if(m)m.textContent=(temps[z]-0.4).toFixed(1).replace('.',',')+'°C'});
 var am=$('acMeasured');if(am)am.textContent='22,1°C';
 document.querySelectorAll('[data-temp-zone],[data-ac-mode],[data-ac-fan]').forEach(function(b){b.disabled=false});
 document.querySelectorAll('[data-ac-mode]').forEach(function(b){b.classList.toggle('is-selected',acOn&&b.getAttribute('data-ac-mode')===acMode)});
 document.querySelectorAll('[data-ac-fan]').forEach(function(b){b.classList.toggle('is-selected',acOn&&b.getAttribute('data-ac-fan')===acFan)});
 var n=$('guestNotice');if(n)n.textContent='WEB TEST · SYMULACJA · BEZ STEROWANIA 401';
}
function actionNode(n){
 while(n&&n!==document){
  if(n.getAttribute&&(n.hasAttribute('data-light-toggle')||n.hasAttribute('data-ac-toggle')||n.hasAttribute('data-temp-zone')||n.hasAttribute('data-ac-mode')||n.hasAttribute('data-ac-fan')))return n;
  n=n.parentNode;
 }
 return null;
}
document.addEventListener('click',function(e){
 var b=actionNode(e.target);if(!b)return;
 if(b.hasAttribute('data-light-toggle')){var z=b.getAttribute('data-light-toggle');states[z]=!states[z];toast('SYMULACJA · '+z+': '+(states[z]?'włączone':'wyłączone'))}
 else if(b.hasAttribute('data-ac-toggle')){acOn=!acOn;toast('SYMULACJA · klimatyzacja '+(acOn?'włączona':'wyłączona'))}
 else if(b.hasAttribute('data-ac-mode')){acMode=b.getAttribute('data-ac-mode');acOn=true;toast('SYMULACJA · tryb: '+acMode)}
 else if(b.hasAttribute('data-ac-fan')){acFan=b.getAttribute('data-ac-fan');toast('SYMULACJA · nawiew: '+acFan)}
 else if(b.hasAttribute('data-temp-zone')){var t=b.getAttribute('data-temp-zone'),step=Number(b.getAttribute('data-step'));temps[t]=Math.max(t==='ac'?21:20,Math.min(t==='ac'?25:24,Math.round((temps[t]+step)*2)/2));toast('SYMULACJA · '+t+' '+String(temps[t]).replace('.',',')+'°C')}
 render();e.preventDefault();
},true);
function injectToolbar(){
 var bar=document.createElement('div');bar.id='browserTestBar';
 bar.innerHTML='<strong>WEB TEST 401</strong><span>Zmiany tutaj nie sterują apartamentem</span><button id="previewWelcome">Powitanie</button><button id="previewWindow">Otwarte okno</button><button id="previewReset">Reset symulacji</button>';
 document.body.appendChild(bar);
 $('previewWelcome').onclick=function(){
  var layer=$('sw-demo');if(!layer)return;
  layer.className='';layer.setAttribute('aria-hidden','false');
  var status=$('heroAudioStatus');if(status)status.textContent='TEST WEB · podgląd ekranu powitalnego';
  var audio=new Audio('assets/welcome_sisu.mp3');audio.volume=1;audio.play().catch(function(){});
  var hide=function(){try{audio.pause()}catch(e){}layer.className='sw-hidden';layer.setAttribute('aria-hidden','true')};
  var skip=$('heroSkip'),play=$('heroPlay');
  if(skip)skip.onclick=hide;
  if(play){play.style.display='inline-block';play.onclick=function(){audio.currentTime=0;audio.play().catch(function(){})}}
 };
 $('previewWindow').onclick=function(){
  var modal=$('modal'),body=$('modalBody');
  if(!modal||!body)return;
  $('modalTag').textContent='SISU23 · TEST OKNA';
  $('modalTitle').textContent='Okno zostało otwarte';
  body.innerHTML='<p>Po 2 minutach ogrzewanie zostanie ograniczone. W trybie letnim klimatyzacja zostanie wyłączona.</p><p><small>To tylko symulacja w przeglądarce — apartament 401 nie jest sterowany.</small></p>';
  modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
  if($('modalClose'))$('modalClose').focus();
 };
 $('previewReset').onclick=function(){states={salon:false,stol:false,kuchnia:false,lazienka:false,sypialnia:false};temps={ac:23,salon:22,sypialnia:22,lazienka:22};acOn=false;render();toast('Symulacja wyzerowana')};
}
window.SISU23Comfort={version:'browser-preview',setRoom:function(){},refresh:function(){},getState:function(){return {preview:true,lights:states,temps:temps}}};
document.addEventListener('DOMContentLoaded',function(){injectToolbar();render()});
})();