(function(){
'use strict';
var state={persons:2,date:'today',time:'19:00',guest:null};
function $(id){return document.getElementById(id)}
function fmt(d){if(!d)return '—';var p=String(d).split('-');return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:d}
function staySummary(a,b){
 var months=['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
 function p(s){var x=String(s||'').split('-');return x.length===3?{y:Number(x[0]),m:Number(x[1]),d:Number(x[2])}:null}
 var x=p(a),y=p(b);if(!x||!y)return {range:'—',nights:'—'};
 var range=x.y===y.y&&x.m===y.m?x.d+'–'+y.d+' '+months[x.m-1]+' '+x.y:(x.y===y.y?x.d+' '+months[x.m-1]+' – '+y.d+' '+months[y.m-1]+' '+x.y:x.d+' '+months[x.m-1]+' '+x.y+' – '+y.d+' '+months[y.m-1]+' '+y.y);
 var n=Math.max(0,Math.round((Date.UTC(y.y,y.m-1,y.d)-Date.UTC(x.y,x.m-1,x.d))/86400000));
 return {range:range,nights:n+' '+(n===1?'noc':(n>=2&&n<=4?'noce':'nocy'))};
}
function setStatus(text,kind){var el=$('kantynaBookStatus');if(!el)return;el.textContent=text;el.className='kantyna-book-status'+(kind?' '+kind:'')}
function render(){
 if($('kantynaPersons'))$('kantynaPersons').textContent=state.persons;
 document.querySelectorAll('[data-kantyna-date]').forEach(function(b){b.classList.toggle('is-selected',b.getAttribute('data-kantyna-date')===state.date)});
 document.querySelectorAll('[data-kantyna-time]').forEach(function(b){b.classList.toggle('is-selected',b.getAttribute('data-kantyna-time')===state.time)});
}
function showDemoConfirmation(){
 var modal=$('modal'),body=$('modalBody');if(!modal||!body)return;
 var when=state.date==='today'?'dzisiaj':'jutro';
 $('modalTag').textContent='KANTYNA · TEST REZERWACJI';
 $('modalTitle').textContent='Rezerwacja przygotowana';
 body.innerHTML='<p><strong>'+state.persons+' os. · '+when+' · '+state.time+'</strong></p><p>Dane pobytu zostały pobrane z HotelowyExpert.</p><p><small>Na tym etapie nic nie zostało wysłane do TheFork. Do automatycznego potwierdzenia brakuje telefonu i e-maila w API Agency XL oraz endpointu rezerwacyjnego TheFork/Kantyny.</small></p>';
 modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');if($('modalClose'))$('modalClose').focus();
}
async function loadGuest(){
 try{
  var r=await fetch('http://127.0.0.1:8095/api/guest?room=401',{cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  var data=await r.json();state.guest=data.reservation||null;
  if(state.guest){
   state.persons=Math.max(1,Math.min(12,Number(state.guest.persons)||2));
   if($('kantynaGuestName'))$('kantynaGuestName').textContent=state.guest.guestName||'Gość apartamentu';
   if($('kantynaGuestStay'))$('kantynaGuestStay').textContent='Pobyt '+fmt(state.guest.arrival)+' – '+fmt(state.guest.departure)+' · '+state.persons+' os.';
   var ss=staySummary(state.guest.arrival,state.guest.departure);
   if($('infoCheckin'))$('infoCheckin').textContent=fmt(state.guest.arrival);
   if($('infoCheckout'))$('infoCheckout').textContent=fmt(state.guest.departure);
   if($('infoStayRange'))$('infoStayRange').textContent=ss.range;
   if($('infoStayNights'))$('infoStayNights').textContent=ss.nights;
   if($('infoStayHint'))$('infoStayHint').textContent='Termin pobytu pobrany z systemu rezerwacji.';
   setStatus('Dane gościa pobrane z HotelowyExpert · DEMO','ok');
  }else{
   if($('kantynaGuestName'))$('kantynaGuestName').textContent='Brak aktywnej rezerwacji';
   if($('kantynaGuestStay'))$('kantynaGuestStay').textContent='Apartament 401 · mapowanie demo';
   setStatus('Brak aktywnego pobytu w pokoju testowym','warn');
  }
  render();
 }catch(e){
  state.guest={guestName:'Michał Nowak',arrival:'2026-11-11',departure:'2026-11-14',persons:2,children:0,status:'confirmed',channel:'SISU TEST'};
  state.persons=2;
  if($('kantynaGuestName'))$('kantynaGuestName').textContent=state.guest.guestName;
  if($('kantynaGuestStay'))$('kantynaGuestStay').textContent='Pobyt '+fmt(state.guest.arrival)+' – '+fmt(state.guest.departure)+' · 2 os.';
  var ss=staySummary(state.guest.arrival,state.guest.departure);
  if($('infoCheckin'))$('infoCheckin').textContent=fmt(state.guest.arrival);
  if($('infoCheckout'))$('infoCheckout').textContent=fmt(state.guest.departure);
  if($('infoStayRange'))$('infoStayRange').textContent=ss.range;
  if($('infoStayNights'))$('infoStayNights').textContent=ss.nights;
  if($('infoCheckinTime'))$('infoCheckinTime').textContent='15:00';
  if($('infoCheckoutTime'))$('infoCheckoutTime').textContent='11:00';
  if($('infoStayHint'))$('infoStayHint').textContent='Publiczny podgląd demonstracyjny SISU23.';
  setStatus('Publiczny podgląd · dane demonstracyjne','ok');
  render();
 }
}
document.addEventListener('DOMContentLoaded',function(){
 var minus=$('kantynaPersonsMinus'),plus=$('kantynaPersonsPlus'),reserve=$('kantynaReserveBtn');
 if(minus)minus.onclick=function(){state.persons=Math.max(1,state.persons-1);render()};
 if(plus)plus.onclick=function(){state.persons=Math.min(12,state.persons+1);render()};
 document.querySelectorAll('[data-kantyna-date]').forEach(function(b){b.onclick=function(){state.date=b.getAttribute('data-kantyna-date');render()}});
 document.querySelectorAll('[data-kantyna-time]').forEach(function(b){b.onclick=function(){state.time=b.getAttribute('data-kantyna-time');render()}});
 if(reserve)reserve.onclick=showDemoConfirmation;
 render();loadGuest();
});
})();