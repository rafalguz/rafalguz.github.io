/* KANTYNA promo video lifecycle v0.8.7 — sound enabled by user navigation */
(function(){
'use strict';
var soundEnabled=false;
function video(){return document.getElementById('kantynaPromoVideo')}
function isKantyna(){var v=document.getElementById('view-kantyna');return !!(v&&v.classList.contains('active'))}
function play(withSound){
 var v=video();if(!v)return;
 if(withSound===true)soundEnabled=true;
 v.loop=true;
 v.muted=!soundEnabled;
 try{v.volume=1}catch(e){}
 try{
  var p=v.play();
  if(p&&p.catch)p.catch(function(){
   /* Browser fallback: if autoplay with audio is rejected, keep playback alive muted.
      The next explicit Kantyna click will try audio again. */
   if(!soundEnabled){v.muted=true;try{v.play()}catch(e2){}}
  });
 }catch(e){}
}
function pause(){var v=video();if(!v)return;try{v.pause()}catch(e){}}
function sync(){if(isKantyna())play(false);else pause()}
document.addEventListener('click',function(e){
 var n=e.target;
 while(n&&n!==document){
  if(n.getAttribute&&n.hasAttribute('data-go')){
   var target=n.getAttribute('data-go');
   if(target==='kantyna'){
    /* Must happen synchronously inside the user's click/remote action
       so browsers allow unmuted playback. */
    play(true);
    setTimeout(function(){play(false)},80);
   }else{
    pause();
   }
   return;
  }
  n=n.parentNode;
 }
},true);
document.addEventListener('DOMContentLoaded',function(){
 var v=video();
 if(v){
  v.muted=true;v.loop=true;
  try{v.volume=1}catch(e){}
  v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');
 }
 setTimeout(sync,250);
});
document.addEventListener('visibilitychange',function(){if(document.hidden)pause();else sync()});
window.SISU23KantynaVideo={play:function(){play(true)},pause:pause,sync:sync};
})();