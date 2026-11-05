'use strict';
// Administrator-only user interface. Access control is enforced by server endpoints.
window.SISUTVAdmin=(function(){
 let snapshot=null;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fallback={welcome:{eyebrow:'BOUTIQUE RESIDENCES · WROCŁAW',title:'Witamy w SISU23',
  subtitle:'Wyjątkowy pobyt we Wrocławiu zaczyna się tutaj.',status:'Witamy Państwa w naszych apartamentach.',
  footerLeft:'WŁODKOWICA 23 · WROCŁAW',footerRight:'ODKRYJ WYJĄTKOWY KOMFORT',
  background:'assets/sisu23_night_wide.jpg',audio:'assets/welcome_sisu.mp3'},
  appearance:{accent:'#D8B87C',layout:'classic'},home:{intro:'Witaj w SISU23',note:'Odkryj wyjątkowy komfort pobytu.'},rooms:{}};
 function field(key,label,value,n=220){
  return '<label class="tv-field">'+esc(label)+'<input class="input" name="'+esc(key)+'" maxlength="'+n+'" value="'+esc(value)+'" required></label>';
 }
 function current(){return snapshot?.draft||fallback}
 function page(){
  if(!snapshot)return '<section class="panel"><h3>Aktualizacje telewizorów</h3><p>Wczytywanie konfiguracji…</p></section>';
  const c=current(),w=c.welcome||fallback.welcome,a=c.appearance||fallback.appearance,h=c.home||fallback.home;
  const history=(snapshot.history||[]).map(v=>'<div class="datarow"><span><strong>Wersja '+esc(v.version)+'</strong><small>'+esc(new Date(v.publishedAt).toLocaleString('pl-PL'))+'</small></span><button class="btn subtle" data-action="tv-update-rollback" data-version="'+esc(v.version)+'">Przywróć</button></div>').join('');
  return '<section class="tv-updates"><div class="panel"><div class="twohead"><div><h3>Publikowanie wyglądu i treści SISU23 TV</h3><small>Zmiany trafiają do telewizorów online bez instalowania nowego pliku .wgt.</small></div><span class="tv-update-version">Wersja '+esc(snapshot.published.version)+'</span></div><p class="muted">Najpierw zapisz szkic, obejrzyj podgląd, potem opublikuj. Cofnięcie tworzy nową wersję na podstawie poprzedniej.</p></div>'+
   '<div class="tv-update-grid"><section class="panel"><form id="tv-update-form"><h3>Powitanie SISU23</h3>'+
   field('eyebrow','Mały podpis nad logo',w.eyebrow,70)+
   field('title','Tytuł powitalny',w.title,85)+
   field('subtitle','Opis powitania',w.subtitle,220)+
   field('status','Tekst pod opisem',w.status,160)+
   field('footerLeft','Stopka po lewej',w.footerLeft,90)+
   field('footerRight','Stopka po prawej',w.footerRight,90)+
   field('background','Zdjęcie tła (ścieżka z biblioteki)',w.background,140)+
   field('audio','Głos Asi — plik MP3 (ścieżka z biblioteki)',w.audio,140)+
   '<h3>Wygląd i ekran główny</h3>'+
   '<label class="tv-field">Kolor złotych akcentów<input class="input" type="color" name="accent" value="'+esc(a.accent||'#D8B87C')+'"></label>'+
   '<label class="tv-field">Układ powitania<select name="layout" class="input"><option value="classic" '+(a.layout!=='editorial'?'selected':'')+'>Klasyczny</option><option value="editorial" '+(a.layout==='editorial'?'selected':'')+'>Redakcyjny</option></select></label>'+
   field('homeIntro','Nagłówek ekranu głównego',h.intro,110)+
   field('homeNote','Opis na ekranie głównym',h.note,180)+
   '<details class="tv-update-advanced"><summary>Indywidualne powitania apartamentów (JSON)</summary><p class="muted">Opcjonalne. Np. {"401":{"welcome":{"title":"Witaj w apartamencie 401"}}}. Tylko sparowany telewizor otrzyma własną wersję.</p><textarea class="input" name="rooms" rows="8">'+esc(JSON.stringify(c.rooms||{},null,2))+'</textarea></details>'+
   '<div class="tv-update-buttons"><button class="btn subtle" data-action="tv-update-preview" type="button">Podgląd szkicu</button><button class="btn primary" type="submit">Zapisz szkic</button><button class="btn primary" data-action="tv-update-publish" type="button">Opublikuj aktualizację</button></div></form>'+
   '<div class="tv-update-upload"><h3>Biblioteka zdjęć i głosu</h3><p class="muted">JPG, PNG, WEBP lub MP3, do 12 MB. Pliki zapisujemy w bezpiecznej bibliotece SISU.</p><input class="input" type="file" id="tv-update-upload" accept=".jpg,.jpeg,.png,.webp,.mp3,image/jpeg,image/png,image/webp,audio/mpeg"></div></section>'+
   '<section class="panel"><h3>Podgląd przed publikacją</h3><div id="tv-update-preview" class="tv-update-preview" style="--sisu-demo-accent:'+esc(a.accent)+'"><small>'+esc(w.eyebrow)+'</small><div class="tv-update-logo">SISU<span>23</span></div><h2>'+esc(w.title)+'</h2><p>'+esc(w.subtitle)+'</p><i>'+esc(w.footerLeft)+'</i></div>'+
   '<div class="tv-update-note"><strong>Aktywna wersja: '+esc(snapshot.published.version)+'</strong><p>Telewizory sprawdzają publikacje co 5 minut i przy uruchomieniu. Podczas awarii internetu używają ostatniej zapisanej wersji.</p><small>Szablony i treści mogą zmieniać się bez .wgt. Zmiany uprawnień Tizena lub natywnego kodu wciąż wymagają instalacji.</small></div>'+
   '<h3>Historia — przywracanie</h3>'+(history||'<p class="muted">Brak wcześniejszych publikacji.</p>')+'</section></div></section>';
 }
 async function load(request){
  const data=await request('/api/tvs/content');
  if(!data.published||!data.draft)throw Error('Serwer nie zwrócił konfiguracji aktualizacji');
  snapshot=data;return data;
 }
 function collect(form){
  const fd=new FormData(form);
  let rooms;
  try{rooms=JSON.parse(String(fd.get('rooms')||'{}'));}catch{throw Error('Nieprawidłowy JSON konfiguracji apartamentów');}
  const value=n=>String(fd.get(n)||'').trim();
  return {welcome:{eyebrow:value('eyebrow'),title:value('title'),subtitle:value('subtitle'),
    status:value('status'),footerLeft:value('footerLeft'),footerRight:value('footerRight'),
    background:value('background'),audio:value('audio')},
   appearance:{accent:value('accent'),layout:value('layout')},
   home:{intro:value('homeIntro'),note:value('homeNote')},rooms};
 }
 function preview(root){
  const form=root.querySelector('#tv-update-form'),box=root.querySelector('#tv-update-preview');if(!form||!box)return;
  const c=collect(form);
  box.style.setProperty('--sisu-demo-accent',c.appearance.accent);
  box.querySelector('small').textContent=c.welcome.eyebrow;
  box.querySelector('h2').textContent=c.welcome.title;
  box.querySelector('p').textContent=c.welcome.subtitle;
  box.querySelector('i').textContent=c.welcome.footerLeft;
  box.classList.toggle('editorial',c.appearance.layout==='editorial');
  const img=c.welcome.background;
  if(/^\/api\/tv\/content\/assets\/[0-9a-f]{24}\.(jpg|png|webp)$/.test(img))
   box.style.backgroundImage='linear-gradient(90deg,rgba(7,13,24,.92),rgba(7,13,24,.55)),url("'+img+'")';
  else box.style.backgroundImage='';
 }
 async function save(form,request){
  const c=collect(form);
  const data=await request('/api/tvs/content/draft',{content:c});
  snapshot.draft=data.draft;
  return true;
 }
 async function publish(request){
  if(!snapshot)throw Error('Najpierw wczytaj konfigurację');
  return request('/api/tvs/content/publish',{expectedVersion:snapshot.published.version});
 }
 async function rollback(request,version){
  if(!Number.isInteger(version))throw Error('Brak wersji do przywrócenia');
  return request('/api/tvs/content/rollback',{version});
 }
 async function upload(input,csrf,base){
  const file=input.files&&input.files[0];if(!file)return null;
  if(file.size>12*1024*1024)throw Error('Plik przekracza 12 MB');
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',mp3:'audio/mpeg'};
  if(!types[ext])throw Error('Dozwolone JPG, PNG, WEBP i MP3');
  const response=await fetch(new URL('api/tvs/content/assets',base),{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':types[ext],'X-SISU-CSRF':csrf},
    body:file
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Nie udało się przesłać pliku');
  const form=document.querySelector('#tv-update-form');
  const target=form&&form.querySelector('[name="'+(ext==='mp3'?'audio':'background')+'"]');
  if(target){target.value=data.asset;target.focus()}
  return data.asset;
 }
 return {page,load,preview,save,publish,rollback,upload};
})();
