/* SISU23 browser restaurant UX v0.9.4 */
(function(){
'use strict';
function copySource(btn){
 var code=btn.getAttribute('data-copy-source')||'SISU 401';
 function done(){var old=btn.textContent;btn.textContent='Skopiowano: '+code;setTimeout(function(){btn.textContent=old},1700)}
 if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(code).then(done).catch(function(){fallback(code,done)})}
 else fallback(code,done);
}
function fallback(code,done){
 var t=document.createElement('textarea');t.value=code;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();
 try{document.execCommand('copy');done()}catch(e){} document.body.removeChild(t);
}
document.addEventListener('click',function(e){
 var n=e.target.closest&&e.target.closest('[data-copy-source]');
 if(n){e.preventDefault();copySource(n);return}
 var a=e.target.closest&&e.target.closest('a[data-thefork]');
 if(a){
  try{sessionStorage.setItem('sisu23_last_thefork',a.getAttribute('data-thefork')+'|'+new Date().toISOString())}catch(err){}
 }
});
})();