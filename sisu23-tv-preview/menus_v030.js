/* SISU23 TV v0.3.0 — verified menu highlights, no invented prices */
(function(){
 'use strict';
 var catalog={
  kantyna:{
   polecane:[
    ['Pyzy z serem tłuścioch','Śmietanowy sos z agrestem'],
    ['Pstrąg','W palonym maśle'],
    ['Kwaśnica','Na wędzonych żeberkach'],
    ['Karkówka','Z purée']
   ],
   przystawki:[['Szaszłyk z boczniaka','Sezonowa propozycja — sprawdź dostępność']],
   zupy:[['Kwaśnica','Na wędzonych żeberkach']],
   glowne:[['Pstrąg','W palonym maśle'],['Karkówka','Z purée'],['Grillowany stek z kalmara','Propozycja z karty opisywanej w sierpniu 2026'],['Pyzy z serem tłuścioch','W śmietanowym sosie z agrestem']],
   desery:[],dzieci:[]
  },
  ida:{
   polecane:[['Tatar wołowy','Słonecznik · borowiki · majonez lubczykowy'],['Pierś z kaczki','Kluski śląskie · buraczki zasmażane'],['Żurek','Biała kiełbasa · boczek · purée ziemniaczane']],
   przystawki:[['Gzik','Pesto z czosnku niedźwiedziego · rzodkiewka · chipsy z ziemniaka'],['Tatar wołowy','Słonecznik · borowiki · majonez lubczykowy'],['Śledź','Jabłko · śmietana · chrzan'],['Gęsie żołądki','Ogórek małosolny · młode ziemniaki · mięta']],
   zupy:[['Żurek','Biała kiełbasa · boczek · purée ziemniaczane'],['Krem szczawiowy','Ziemniaki · jajko']],
   glowne:[['Pierś z kaczki','Kluski śląskie · buraczki zasmażane'],['Pierogi z czosnkiem niedźwiedzim','Wędzony ser · zioła'],['Kopytka ziemniaczane','Bób · kurki · ser bursztyn'],['Stek wołowy','Sezonowe dodatki']],
   desery:[]
  }
 };
 var activeCat={kantyna:'polecane',ida:'polecane'};
 function el(id){return document.getElementById(id)}
 function render(venue){
  var rows=el('menuRows'+venue);
  if(!rows)return;
  var cat=activeCat[venue]||'polecane';
  var list=catalog[venue][cat]||[];
  rows.textContent='';
  if(!list.length){
   var empty=document.createElement('div');empty.className='menu-row';
   var e=document.createElement('strong');e.textContent='Sprawdź aktualną kartę restauracji';
   var d=document.createElement('small');d.textContent='Ta część menu zmienia się sezonowo. Zeskanuj kod QR poniżej, aby zobaczyć bieżące propozycje.';
   empty.appendChild(e);empty.appendChild(d);rows.appendChild(empty);
  }else{
   list.forEach(function(d){
    var row=document.createElement('div');row.className='menu-row';
    var strong=document.createElement('strong');strong.textContent=d[0];
    var note=document.createElement('small');note.textContent=d[1];
    row.appendChild(strong);row.appendChild(note);rows.appendChild(row);
   });
  }
  var buttons=document.querySelectorAll('.menu-tab[data-menu-venue="'+venue+'"]');
  for(var i=0;i<buttons.length;i++)buttons[i].classList.toggle('active',buttons[i].getAttribute('data-menu-category')===cat);
 }
 function findAction(t){
  while(t&&t!==document){
   if(t.getAttribute&&(t.hasAttribute('data-menu-venue')||t.hasAttribute('data-menu-web')))return t;
   t=t.parentNode;
  }
  return null;
 }
 document.addEventListener('click',function(e){
  var b=findAction(e.target);if(!b)return;
  var v=b.getAttribute('data-menu-venue'),category=b.getAttribute('data-menu-category');
  if(v&&catalog[v]&&category){activeCat[v]=category;render(v)}
  else if(b.hasAttribute('data-menu-web')){
   var url=b.getAttribute('data-menu-web');
   if(!/^https:\/\//.test(url))return;
   try{window.open(url,'_blank')}catch(err){}
  }
 },false);
 window.SISU23Menus={render:render,catalog:catalog};
 render('kantyna');render('ida');
})();