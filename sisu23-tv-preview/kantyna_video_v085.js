/* KANTYNA promo video lifecycle */
(function(){
'use strict';
function video(){return document.getElementById('kantynaPromoVideo')}
function isKantyna(){var v=document.getElementById('view-kantyna');return !!(v&&v.classList.contains('active'))}
function play(){
 var v=video();if(!v)return;
 v.muted=true;v.loop=true;
 try{var p=v.play();if(p&&p.catch)p.catch(function(){})}catch(e){}
}
function pause(){var v=video();if(!v)return;try{v.pause()}catch(e){}}
function sync(){if(isKantyna())play();else pause()}
document.addEventListener('click',function(e){
 var n=e.target;
 while(n&&n!==document){
  if(n.getAttribute&&n.hasAttribute('data-go')){
   var target=n.getAttribute('data-go');
   setTimeout(function(){if(target==='kantyna')play();else pause()},80);
   return;
  }
  n=n.parentNode;
 }
},true);
document.addEventListener('DOMContentLoaded',function(){
 var v=video();
 if(v){v.muted=true;v.loop=true;v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');}
 setTimeout(sync,250);
});
document.addEventListener('visibilitychange',function(){if(document.hidden)pause();else sync()});
window.SISU23KantynaVideo={play:play,pause:pause,sync:sync};
})();