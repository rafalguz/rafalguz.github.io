(function(){
 'use strict';
 var $=function(id){return document.getElementById(id)};
 var screen='home',modalOpen=false;
 var map=null,mapReady=false,markers={},mapTilesOk=false,toastTimer=0;
 var placePositions={
  sisu:{lat:51.1091993,lon:17.0233667,label:'SISU23',detail:'Włodkowica 23 · Twój apartament'},
  kantyna:{lat:51.1091993,lon:17.0233667,label:'Kantyna',detail:'Restauracja na parterze, Włodkowica 23'},
  ida:{lat:51.1124135,lon:17.0293523,label:'IDA kuchnia i wino',detail:'Łazienna 4 · Wrocław'}
 };
 var room='401';
 try{
  var match=location.search.match(/[?&]room=(\d{3})/);
  if(match&&/^(10[1-8]|20[1-8]|30[1-8]|40[1-6])$/.test(match[1]))room=match[1];
 }catch(e){}
 ['aptTop','aptHero','aptComfort'].forEach(function(id){if($(id))$(id).textContent=room});
 function tick(){
  var d=new Date(),hh=('0'+d.getHours()).slice(-2),mm=('0'+d.getMinutes()).slice(-2);
  $('clock').textContent=hh+':'+mm;
  if($('homeClock'))$('homeClock').textContent=hh+':'+mm;
  var dateText=d.toLocaleDateString('pl-PL',{weekday:'long',day:'numeric',month:'long'});
  if($('homeDate'))$('homeDate').textContent=dateText;
  if($('topDate'))$('topDate').textContent=dateText;

 }
 tick();setInterval(tick,10000);
 function toast(text){
  var t=$('toast');t.textContent=text;t.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('show')},4500);
 }
 function showWelcome(){
  if(modalOpen)hideModal();
  screen='home';renderScreen();
  if(window.SISUHomeWelcomeDemo&&typeof window.SISUHomeWelcomeDemo.replay==='function')window.SISUHomeWelcomeDemo.replay();
 }
 function renderScreen(){
  document.body.classList.toggle('sisu-home',screen==='home');
  var dockCurrent=(screen==='kantyna'||screen==='ida')?'food':screen;
  var dockNodes=document.querySelectorAll('.dock-link');
  for(var di=0;di<dockNodes.length;di++)dockNodes[di].classList.toggle('active',dockNodes[di].getAttribute('data-go')===dockCurrent);
  if(window.SISU23Menus&&(screen==='kantyna'||screen==='ida'))window.SISU23Menus.render(screen);

  var vs=document.querySelectorAll('.view');
  for(var i=0;i<vs.length;i++){
   vs[i].classList.toggle('active',vs[i].id==='view-'+screen);
  }
  var bs=document.querySelectorAll('.navbtn');
  for(var j=0;j<bs.length;j++)bs[j].classList.toggle('active',bs[j].getAttribute('data-go')===screen);
  if(screen==='map'){setTimeout(loadMap,50);setTimeout(function(){if(map)map.invalidateSize()},450)}
 }
 function go(page){
  if(modalOpen)hideModal();
  screen=page||'home';renderScreen();
  var focus=screen==='home'?document.querySelector('#view-home .home-tile'):
    (screen==='kantyna'||screen==='ida')?document.querySelector('#view-'+screen+' .qr-back'):
    document.querySelector('#globalDock .dock-link[data-go="'+screen+'"]');
  if(focus)focus.focus();
 }
 function showModal(tag,title,body){
  modalOpen=true;$('modalTag').textContent=tag;
  $('modalTitle').textContent=title;
  $('modalBody').innerHTML=body;
  $('modal').classList.remove('hidden');$('modal').setAttribute('aria-hidden','false');
  $('modalClose').focus();
 }
 function hideModal(){
  modalOpen=false;$('modal').classList.add('hidden');$('modal').setAttribute('aria-hidden','true');
 }
 function foodDetails(name){
  if(name==='kantyna'){
   showModal('RESTAURACJA · W BUDYNKU SISU23','Kantyna','<p>Kantyna znajduje się bezpośrednio na parterze budynku SISU23. Odkryj autorskie smaki kuchni polskiej i europejskiej w eleganckim wnętrzu.</p><p><small>Adres: ul. Pawła Włodkowica 23, Wrocław.</small></p><button class="outlinebtn focusable" data-modal-map="kantyna">Pokaż na mapie ↗</button>');
  }else{
   showModal('RESTAURACJA · WROCŁAW','IDA kuchnia i wino','<p>Polska kuchnia w nowoczesnym wydaniu, sezonowe menu i starannie dobrane wina. Restauracja znajduje się przy ul. Łaziennej 4.</p><p><small>Rezerwacje: +48 608 728 260 &nbsp;·&nbsp; idakuchniaiwino.pl</small></p><button class="outlinebtn focusable" data-modal-map="ida">Pokaż na mapie ↗</button>');
  }
 }
 function windowAlert(){
  showModal('SISU23 · INFORMACJA O KOMFORCIE','Okno zostało otwarte','<p>Po otwarciu okna klimatyzator, jeśli pracuje, zostanie wyłączony, a ogrzewanie odpowiednio ograniczone.</p><p><small>Wersja demonstracyjna · tutaj nie zmieniamy parametrów urządzeń.</small></p>');
  setTimeout(function(){if(modalOpen&&$('modalTag').textContent.indexOf('INFORMACJA')>=0)hideModal()},10000);
 }
 function setFocusClass(){
  var f=document.querySelectorAll('.focused');
  for(var i=0;i<f.length;i++)f[i].classList.remove('focused');
  var el=document.activeElement;
  if(el&&el.classList)el.classList.add('focused');
 }
 document.addEventListener('focusin',setFocusClass);
 function visibleButtons(){
  var selector=modalOpen?'#modal button.focusable':'button.focusable';
  var items=Array.prototype.slice.call(document.querySelectorAll(selector));
  return items.filter(function(el){
   if(el.disabled||el.hidden||el.getAttribute('aria-hidden')==='true')return false;
   if(window.SISU23TVPairing&&window.SISU23TVPairing.active())return !!el.closest('#tvPairLayer');
   if(el.closest('#modal'))return modalOpen;
   if(modalOpen)return false;
   var view=el.closest('.view');
   if(view&&!view.classList.contains('active'))return false;
   var panel=el.closest('#lightsPanel');
   if(panel&&!panel.classList.contains('open'))return false;
   if(el.offsetWidth===0||el.offsetHeight===0)return false;
   var cs=window.getComputedStyle(el);
   if(cs.visibility==='hidden'||cs.display==='none')return false;
   var r=el.getBoundingClientRect();
   return r.width>4&&r.height>4&&r.bottom>0&&r.right>0&&r.top<window.innerHeight&&r.left<window.innerWidth;
  });
 }
 function navigate(dir){
  var elems=visibleButtons(),origin=document.activeElement;
  if(!elems.length)return;
  if(elems.indexOf(origin)<0){
   var start=document.querySelector('#view-'+screen+' button.focusable');
   if(!start||elems.indexOf(start)<0)start=elems[0];
   start.focus();return;
  }
  var a=origin.getBoundingClientRect(),cx=(a.left+a.right)/2,cy=(a.top+a.bottom)/2;
  var horizontal=dir==='left'||dir==='right';
  var options=[];
  elems.forEach(function(el){
   if(el===origin)return;
   var b=el.getBoundingClientRect(),x=(b.left+b.right)/2,y=(b.top+b.bottom)/2;
   var forward=dir==='left'?cx-x:dir==='right'?x-cx:dir==='up'?cy-y:y-cy;
   if(forward<=2)return;
   var cross=horizontal?Math.abs(y-cy):Math.abs(x-cx);
   var overlap=horizontal?Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top):Math.min(a.right,b.right)-Math.max(a.left,b.left);
   var aligned=overlap>0;
   options.push({el:el,score:(aligned?0:10000)+forward+cross*(aligned?2.5:5),cross:cross});
  });
  options.sort(function(a,b){return a.score-b.score});
  if(options.length)options[0].el.focus();
 }
 function pickPoint(point){
  var v=placePositions[point];if(!v)return;
  var p=document.querySelectorAll('[data-point]');
  for(var i=0;i<p.length;i++)p[i].classList.toggle('chosen',p[i].getAttribute('data-point')===point);
  if(!map)return;
  map.flyTo([v.lat,v.lon],point==='ida'?16:17,{duration:.65});
  if(markers[point])setTimeout(function(){markers[point].openPopup()},680);
 }
 function loadMap(){
  if(!mapReady&&typeof L!=='undefined'){
   try{
    map=L.map('realMap',{zoomControl:false,attributionControl:true,scrollWheelZoom:false,keyboard:false}).setView([51.1097,17.0251],16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,minZoom:12,attribution:'&copy; OpenStreetMap contributors'}).on('tileerror',function(){if(!mapTilesOk)$('mapError').hidden=false}).on('tileload',function(){mapTilesOk=true;$('mapError').hidden=true}).addTo(map);
    var icon=L.divIcon({className:'',html:'<div class="sisu-map-pin">✦</div>',iconSize:[46,46],iconAnchor:[23,23]});
    Object.keys(placePositions).forEach(function(key){
     var d=placePositions[key];markers[key]=L.marker([d.lat,d.lon],{icon:icon}).addTo(map).bindPopup('<strong>'+d.label+'</strong><br>'+d.detail);
    });
    mapReady=true;
    setTimeout(function(){map.invalidateSize()},250);
   }catch(e){$('mapError').hidden=false}
  }else if(map){map.invalidateSize()}
 }
 function mapAct(a){
  if(!map){loadMap();if(!map)return}
  if(a==='in')map.zoomIn();
  else if(a==='out')map.zoomOut();
  else {map.flyTo([51.1097,17.0251],16,{duration:.6});}
 }
 function launch(app){
  var ids={netflix:['3201907018807','11101200001'],youtube:['111299001912'],sweet:[]};
  var names={netflix:'Netflix',youtube:'YouTube',sweet:'Sweet.TV'};
  if(app==='sweet'){
   showModal('OGLĄDAJ TV','Sweet.TV','<p>Wybierz aplikację Sweet.TV w menu Apps telewizora.</p><p><small>Wersja testowa: uruchamianie tej aplikacji zostanie dopracowane po instalacji w apartamentach.</small></p>');
   return;
  }
  if(typeof tizen!=='undefined'&&tizen.application&&tizen.application.launch){
   try{
    tizen.application.launch(ids[app][0],function(){toast('Uruchamiam '+names[app])},function(){
     showModal('OGLĄDAJ TV',names[app],'<p>Nie udało się otworzyć tej aplikacji automatycznie. Wybierz ją z menu Apps na telewizorze.</p>');
    });
   }catch(e){showModal('OGLĄDAJ TV',names[app],'<p>Uruchom wybraną usługę z menu telewizora.</p>')}
  }else{toast('Podgląd demonstracyjny. Otwarcie '+names[app]+' dostępne na telewizorze.')}
 }

 var sisuRadioPlayer=null,sisuRadioSelected='',sisuRadioWanted=false,sisuRadioRetry=null;
 var radioStreams={
  groove:'https://ice1.somafm.com/groovesalad-128-mp3',
  beat:'https://ice1.somafm.com/beatblender-128-mp3',
  lush:'https://ice1.somafm.com/lush-128-mp3',
  eska:'https://ic1.smcdn.pl/2180-1.mp3',
  chillizet:'https://ch.cdn.eurozet.pl/chi-net.mp3'
 };
 var radioTitles={groove:'Groove Salad',beat:'Beat Blender',lush:'Lush',eska:'Radio ESKA',chillizet:'Chillizet'};
 function radioNotice(text){if($('musicNotice'))$('musicNotice').textContent=text}
 function radioScheduleRetry(){
  if(!sisuRadioWanted||!sisuRadioSelected)return;
  if(sisuRadioRetry)clearTimeout(sisuRadioRetry);
  sisuRadioRetry=setTimeout(function(){
   sisuRadioRetry=null;
   if(!sisuRadioWanted||!sisuRadioSelected)return;
   radioStart(sisuRadioSelected,true);
  },2500);
 }
 function radioStart(station,retry){
  if(!radioStreams[station])return;
  if(!sisuRadioPlayer){
   sisuRadioPlayer=new Audio();
   sisuRadioPlayer.preload='none';
   sisuRadioPlayer.addEventListener('playing',function(){
    if(sisuRadioSelected)radioNotice('Gra: '+radioTitles[sisuRadioSelected]+' · Radio pozostanie włączone.');
   });
   sisuRadioPlayer.addEventListener('error',radioScheduleRetry);
   sisuRadioPlayer.addEventListener('stalled',radioScheduleRetry);
   sisuRadioPlayer.addEventListener('ended',radioScheduleRetry);
   sisuRadioPlayer.addEventListener('suspend',function(){if(sisuRadioWanted&&!sisuRadioPlayer.paused)radioScheduleRetry()});
  }
  sisuRadioWanted=true;sisuRadioSelected=station;
  try{
   sisuRadioPlayer.pause();
   sisuRadioPlayer.src='';
   sisuRadioPlayer.load();
   sisuRadioPlayer.src=radioStreams[station]+'?sisu='+Date.now();
   var p=sisuRadioPlayer.play();
   radioNotice((retry?'Ponowne łączenie: ':'Łączenie ze stacją ')+radioTitles[station]+'...');
   if(p&&p.catch)p.catch(function(){radioScheduleRetry()});
  }catch(e){radioScheduleRetry()}
 }
 function radioPick(station){
  if(station==='stop'){
   sisuRadioWanted=false;
   if(sisuRadioRetry){clearTimeout(sisuRadioRetry);sisuRadioRetry=null}
   if(sisuRadioPlayer){try{sisuRadioPlayer.pause();sisuRadioPlayer.src='';sisuRadioPlayer.load()}catch(e){}}
   sisuRadioSelected='';
   radioNotice('Odtwarzanie zatrzymane.');
   return;
  }
  radioStart(station,false);
 }
 setInterval(function(){
  if(!sisuRadioWanted||!sisuRadioSelected||!sisuRadioPlayer)return;
  if(sisuRadioPlayer.paused||sisuRadioPlayer.ended||sisuRadioPlayer.readyState<2)radioScheduleRetry();
 },15000);
 document.addEventListener('click',function(e){
  var n=e.target;
  while(n&&n!==document&&(!n.getAttribute||!(n.getAttribute('data-go')||n.getAttribute('data-food')||n.getAttribute('data-point')||n.getAttribute('data-map-action')||n.getAttribute('data-launch')||n.getAttribute('data-show-welcome')||n.getAttribute('data-alert')||n.getAttribute('data-modal-map')||n.getAttribute('data-radio'))))n=n.parentNode;
  if(!n||n===document)return;
  if(n.hasAttribute('data-go'))go(n.getAttribute('data-go'));
  else if(n.hasAttribute('data-radio'))radioPick(n.getAttribute('data-radio'));
  else if(n.hasAttribute('data-food'))foodDetails(n.getAttribute('data-food'));
  else if(n.hasAttribute('data-point'))pickPoint(n.getAttribute('data-point'));
  else if(n.hasAttribute('data-map-action'))mapAct(n.getAttribute('data-map-action'));
  else if(n.hasAttribute('data-launch'))launch(n.getAttribute('data-launch'));
  else if(n.hasAttribute('data-show-welcome'))showWelcome();
  else if(n.hasAttribute('data-alert'))windowAlert();
  else if(n.hasAttribute('data-modal-map')){var key=n.getAttribute('data-modal-map');hideModal();go('map');setTimeout(function(){pickPoint(key)},300);}
 });
 $('modalClose').addEventListener('click',function(){hideModal();var el=document.querySelector('.navbtn[data-go="'+screen+'"]');if(el)el.focus()});
 document.addEventListener('keydown',function(e){
  var k=e.key||'',c=e.keyCode||0;
  var back=(c===10009||c===4||k==='Escape'||k==='Backspace');
  var ok=(c===13||c===23||k==='Enter');
  var direction=(c===37||c===21||k==='ArrowLeft')?'left':(c===39||c===22||k==='ArrowRight')?'right':(c===38||c===19||k==='ArrowUp')?'up':(c===40||c===20||k==='ArrowDown')?'down':'';
  var splash=$('sw-demo');
  if(splash&&!splash.classList.contains('sw-hidden'))return;
  if(window.SISU23TVPairing&&window.SISU23TVPairing.active()&&back){window.SISU23TVPairing.skip();e.preventDefault();return;}
  if(back){
   if(modalOpen)hideModal();
   else if(screen==='kantyna'||screen==='ida')go('food');
   else if(screen!=='home')go('home');
   else{showWelcome();}
   e.preventDefault();return;
  }
  if(direction){
   navigate(direction);e.preventDefault();return;
  }
  if(ok){
   var active=document.activeElement;
   if(active&&typeof active.click==='function')active.click();
   else if(screen==='home')go('map');
   e.preventDefault();
  }
 },true);
 document.addEventListener('visibilitychange',function(){
  if(!document.hidden)return;
  try{if(window.tizen&&tizen.application)tizen.application.getCurrentApplication().exit()}catch(e){}
 },false);
 renderScreen();
 window.SISU23={go:go,showWelcome:showWelcome,version:'0.7.5',room:room,setRoom:function(value){if(/^(10[1-8]|20[1-8]|30[1-8]|40[1-6])$/.test(String(value))){room=String(value);['aptTop','aptHero','aptComfort'].forEach(function(id){if($(id))$(id).textContent=room});window.SISU23.room=room;}}};
})();
