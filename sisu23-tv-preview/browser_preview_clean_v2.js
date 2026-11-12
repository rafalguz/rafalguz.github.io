/* SISU23 browser preview — isolated from real apartment control, no test toolbar. */
(function(){
'use strict';
var states={salon:false,stol:false,kuchnia:false,lazienka:false,sypialnia:false};
var temps={ac:22,salon:22,sypialnia:22,lazienka:22};
var acOn=false,acMode='heat',acFan='auto';
var tempTimers={};
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
}
function actionNode(n){
 while(n&&n!==document){
  if(n.getAttribute&&(n.hasAttribute('data-light-toggle')||n.hasAttribute('data-ac-toggle')||n.hasAttribute('data-ac-power')||n.hasAttribute('data-temp-zone')||n.hasAttribute('data-heating-step')||n.hasAttribute('data-ac-mode')||n.hasAttribute('data-ac-fan')))return n;
  n=n.parentNode;
 }
 return null;
}
document.addEventListener('click',function(e){
 var b=actionNode(e.target);if(!b)return;
 if(b.hasAttribute('data-light-toggle')){var z=b.getAttribute('data-light-toggle');states[z]=!states[z];toast(z+': '+(states[z]?'włączone':'wyłączone'))}
 else if(b.hasAttribute('data-ac-toggle')){acOn=!acOn;toast('Klimatyzacja '+(acOn?'włączona':'wyłączona'))}
 else if(b.hasAttribute('data-ac-power')){acOn=b.getAttribute('data-ac-power')==='on';toast('Klimatyzacja '+(acOn?'włączona':'wyłączona'))}
 else if(b.hasAttribute('data-ac-mode')){acMode='heat';acOn=true;toast('Tryb zimowy: grzanie')}
 else if(b.hasAttribute('data-ac-fan')){acFan=b.getAttribute('data-ac-fan');toast('Nawiew: '+acFan)}
 else if(b.hasAttribute('data-temp-zone')||b.hasAttribute('data-heating-step')){
  var t=b.hasAttribute('data-heating-step')?'salon':b.getAttribute('data-temp-zone');
  var step=Number(b.hasAttribute('data-heating-step')?b.getAttribute('data-heating-step'):b.getAttribute('data-step'));
  var min=t==='ac'?21:19,max=23;
  temps[t]=Math.max(min,Math.min(max,Math.round((temps[t]+step)*2)/2));
  var hint=$('temperatureHint'+t);
  if(hint)hint.textContent='Zapis za 3 s…';
  clearTimeout(tempTimers[t]);
  tempTimers[t]=setTimeout(function(){if(hint)hint.textContent='Zapisano · symulacja';},3000);
 }
 render();e.preventDefault();
},true);
window.SISU23Comfort={version:'browser-preview',setRoom:function(){},refresh:function(){},getState:function(){return {preview:true,lights:states,temps:temps}}};
document.addEventListener('DOMContentLoaded',function(){
 render();
 var open=$('openLightsPanel'),panel=$('lightsPanel');
 if(open&&panel)open.addEventListener('click',function(){panel.classList.toggle('open');open.classList.toggle('active');open.querySelector('span').textContent=panel.classList.contains('open')?'‹':'›'});
});
})();