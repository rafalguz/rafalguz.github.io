(function(){
'use strict';
function $(id){return document.getElementById(id)}
var paid=false;
function render(){
 if($('infoCheckinTime'))$('infoCheckinTime').textContent='15:00';
 if($('infoCheckoutTime'))$('infoCheckoutTime').textContent=paid?'13:00':'11:00';
 var b=$('lateCheckoutBtn'),s=$('lateCheckoutStatus');if(!b)return;
 if(paid){b.disabled=true;b.textContent='Wymeldowanie do 13:00 ✓';if(s)s.textContent='TEST · late check-out zapisany'}
 else{b.disabled=false;b.textContent='Przedłuż do 13:00 · 50 zł · TEST';if(s)s.textContent='Symulacja płatności — bez pobrania środków'}
}
function open(){
 var modal=$('modal'),body=$('modalBody');if(!modal||!body)return;
 $('modalTag').textContent='SISU23 · LATE CHECK-OUT';
 $('modalTitle').textContent='Przedłuż wymeldowanie do 13:00';
 body.innerHTML='<div class="late-pay-box"><div class="late-pay-summary"><strong>+2 godziny · 50,00 zł</strong><span>Wymeldowanie: 11:00 → 13:00</span></div><div class="late-pay-note">TRYB TESTOWY — pieniądze nie zostaną pobrane.</div><button class="focusable late-pay-action" id="latePayPreview">TEST: potwierdź 50 zł</button></div>';
 modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
 setTimeout(function(){var x=$('latePayPreview');if(x){x.onclick=function(){paid=true;render();$('modalTitle').textContent='Wymeldowanie przedłużone ✓';body.innerHTML='<div class="late-pay-summary"><strong>Nowa godzina: 13:00</strong><span>Symulacja zakończona.</span></div>'};x.focus()}},20);
}
document.addEventListener('DOMContentLoaded',function(){render();var b=$('lateCheckoutBtn');if(b)b.addEventListener('click',open)});
})();