(function(){
'use strict';
var BASE_W=1920,BASE_H=1080;
function fit(){
 var el=document.querySelector('.app-shell');if(!el)return;
 document.body.classList.add('browser-tv-preview');
 var scale=Math.min(window.innerWidth/BASE_W,window.innerHeight/BASE_H);
 var w=BASE_W*scale,h=BASE_H*scale;
 el.style.left=Math.max(0,(window.innerWidth-w)/2)+'px';
 el.style.top=Math.max(0,(window.innerHeight-h)/2)+'px';
 el.style.transform='scale('+scale+')';
}
document.addEventListener('DOMContentLoaded',function(){setTimeout(fit,20)});
window.addEventListener('resize',fit);
window.SISU23BrowserFit={fit:fit};
})();