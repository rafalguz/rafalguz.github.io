'use strict';
(() => {
const root=document.getElementById('app');
const notices=document.getElementById('toast-stack');
const API_BASE=new URL('./',document.currentScript?.src||location.href);
const ASSET_BASE=new URL('./',document.currentScript?.src||window.location.href);
const S={user:null,csrf:null,configured:true,tab:'apartments',floor:0,query:'',focusRoom:null,overview:null,users:[],tvs:[],tvPending:[],tvRooms:[],busy:false,updated:null};
const FLOORS=[4,3,2,1];
const STATUSES=['Nieustalony','Oczekuje na przyjazd','Zameldowany','Do sprzątania','Sprzątanie','Gotowy'];
let overviewRequestId=0;
let hallDraft={text:'',voice:'AgnieszkaNeural',id:null};
let followUpTimers=[];
function cancelFollowUpRefreshes(){
 for(const timer of followUpTimers)clearTimeout(timer);
 followUpTimers=[];
}
function refreshAfterControl(kind){
 cancelFollowUpRefreshes();
 // Some hardware updates its reported state later than the HA service call returns.
 const delays=['ac','ac_temp','trv','tv'].includes(kind)?[1500,4500,10000]:[1100,3200,6500];
 for(const delay of delays){
  followUpTimers.push(setTimeout(()=>{
   if(!S.user||S.busy||document.visibilityState!=='visible')return;
   void loadData(true,true);
  },delay));
 }
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const temp=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('pl-PL',{maximumFractionDigits:1})+'°C':'—';
const connected=()=>!!S.overview?.room401;
const rooms=()=>S.overview?.rooms||[];
const room401=()=>S.overview?.room401||null;
const music=()=>S.overview?.hallMusic||null;
const count=status=>rooms().filter(x=>x.status===status).length;
const ready=()=>!S.busy;
async function request(url,body){
 const opts={credentials:'same-origin',cache:'no-store'};
 if(body!==undefined){opts.method='POST';opts.headers={'Content-Type':'application/json'};
   if(S.csrf)opts.headers['X-SISU-CSRF']=S.csrf;
   opts.body=JSON.stringify(body);}
 const r=await fetch(new URL(String(url).replace(/^\/+/,''),ASSET_BASE),opts);
 const json=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(json.error||'Nie udało się wykonać operacji ('+r.status+')');
 return json;
}
function toast(msg,bad=false){
 const d=document.createElement('div');d.className='toast'+(bad?' bad':'');d.textContent=msg;notices.appendChild(d);
 setTimeout(()=>d.remove(),5000);
}
function labelForState(s,on='Włączone',off='Wyłączone'){
 return s==='on'?on:s==='off'?off:s==='unavailable'?'Brak połączenia':'Brak danych';
}
function nav(id,name,icon){
 return '<button class="nav '+(S.tab===id?'active':'')+'" data-action="tab" data-tab="'+id+'"><b>'+icon+'</b>'+name+'</button>';
}
function kpi(n,title,desc){
 return '<div class="panel metric"><strong>'+esc(n)+'</strong><b>'+title+'</b><small>'+desc+'</small></div>';
}
function pageTitle(){return {apartments:'Apartamenty',room401:'Apartament 401',operations:'Obsługa i statusy',alerts:'Okna i czujniki',music:'Muzyka w holu',staff:'Kontrola dostępu',tvs:'Telewizory SISU23',updates:'Aktualizacje TV'}[S.tab]||'Centrum zarządzania'}
function layout(content){
 const role=S.user.role==='admin'?'Administrator':'Manager';
 return '<div class="shell"><aside class="side"><div class="brand"><span class="logo">SISU</span><small>BOUTIQUE APARTMENTS<br>WŁODKOWICA</small></div><div class="label">CENTRUM ZARZĄDZANIA</div><nav>'+
 nav('apartments','Apartamenty','⌂')+nav('room401','Sterowanie 401','◈')+nav('operations','Obsługa','▤')+nav('alerts','Czujniki','◇')+nav('music','Muzyka holu','♫')+
 (S.user.role==='admin'?nav('tvs','Telewizory','▣')+nav('updates','Aktualizacje TV','↻'):'')+
 (S.user.role==='admin'?nav('staff','Personel','♙'):'')+
 '</nav><div class="sidefoot"><span class="statusdot '+(connected()?'ok':'')+'"></span>'+ (connected()?'Home Assistant połączony':'Oczekiwanie na odczyty')+
 '<div style="margin-top:11px">30 apartamentów · 4 piętra<br>Bez dostępu gości do panelu</div></div></aside>'+
 '<main class="main"><header class="header"><div><span class="label">SISU / WŁODKOWICA</span><h1>'+pageTitle()+'</h1><p class="subtitle">Wrocław · prywatny panel obsługi</p></div><div class="header-right"><div class="userbadge">'+role+'<small>'+esc(S.user.email)+'</small></div><button class="btn subtle" data-action="refresh" '+(S.busy?'disabled':'')+'>Odśwież</button><button class="btn subtle" data-action="logout">Wyloguj</button></div></header>'+
 content+'<footer><span>SISU Boutique Apartments · Oddzielny dostęp managerów</span><span data-last-update>Aktualizacja '+esc(S.updated||'—')+'</span></footer></main></div>';
}
function authForm(isSetup){
 const button=isSetup?'Utwórz konto administratora':'Zaloguj';
 const intro=isSetup?'Pierwsza konfiguracja lokalnego serwera. Kod uruchomieniowy jest zapisany w dzienniku aplikacji w Home Assistant.':
 'Dostęp tylko dla administratora i zaproszonego personelu. Goście nie posiadają kont.';
 return '<div class="signin"><main><div class="brand"><span class="logo">SISU</span><small>BOUTIQUE APARTMENTS · WŁODKOWICA</small></div><h1>'+(isSetup?'Uruchomienie systemu':'Centrum zarządzania')+'</h1><p>'+intro+'</p>'+
 '<form id="'+(isSetup?'setup':'login')+'">'+
 (isSetup?'<div class="field"><label for="code">Kod pierwszego uruchomienia (z dziennika aplikacji)</label><input class="input" id="code" name="code" spellcheck="false" autocomplete="off" required maxlength="32"></div>':'')+
 '<div class="field"><label for="email">Adres e-mail</label><input class="input" id="email" name="email" type="email" autocomplete="username" required></div>'+
 '<div class="field"><label for="password">Hasło'+(isSetup?' — minimum 14 znaków':'')+'</label><input class="input" id="password" name="password" type="password" autocomplete="'+(isSetup?'new-password':'current-password')+'" minlength="'+(isSetup?'14':'1')+'" required></div>'+
 '<button class="btn primary" type="submit">'+button+'</button></form>'+
 '<p style="margin-top:19px;font-size:11px">Panel niezależny od Home Assistant. Nie udostępniaj jego portu bezpośrednio w internecie.</p></main></div>';
}
function cardsRooms(){
 return FLOORS.filter(f=>!S.floor||S.floor===f).map(f=>{
  const list=rooms().filter(x=>x.floor===f&&String(x.number).includes(S.query));
  if(!list.length)return'';
  return '<section class="floor"><div class="floorname"><em>0'+f+'</em><b>'+f+'. PIĘTRO</b><small>'+list.length+' apartamentów</small></div><div class="roomgrid">'+list.map(r=>{
   const live=r.number===401&&connected();
   const data=room401();
   const windows=live?data.windows.filter(w=>w.state==='on').length:0;
   return '<button class="room '+(live?'live':'')+'" data-action="room" data-room="'+r.number+'"><span><b>'+r.number+'</b>'+(live?'<small class="liveflag">LIVE</small>':'')+'</span>'+
   '<small>'+(live?'Salon: '+temp(data.temperature):'Urządzenia do podłączenia')+'</small>'+
   '<small>'+(live?(windows?'Otwarte okna: '+windows:'Okna zamknięte'):'Piętro '+r.floor)+'</small>'+
   '<span class="roomstatus">'+esc(r.status)+'</span></button>';
  }).join('')+'</div></section>';
 }).join('');
}
function musicStatus(m){
 if(!m||['unavailable','unknown'].includes(m.state))return 'Brak połączenia';
 if(m.state==='playing')return m.muted?'Gra (wyciszone)':'Gra';
 return m.state==='paused'?'Pauza':m.state==='off'||m.state==='idle'?'Nie gra':'Nie odtwarza';
}
function musicPreview(){
 const m=music(),playing=m?.state==='playing';
 return '<section class="panel music-widget"><div class="music-icon">♫</div><div class="music-widget-content"><span class="label">HOL SISU · TERAZ GRA</span>'+
 '<h3>'+esc(playing?(m.title||'Radio internetowe'):'Muzyka nie gra')+'</h3><p>'+esc(playing?(m.artist||'Brak informacji o wykonawcy'):(m?.selected||'Wybrana stacja')+' · 07:00–22:00')+'</p>'+
 '<small>'+esc(musicStatus(m))+' · Głośność '+esc(typeof m?.volume==='number'?Math.round(m.volume*100)+'%':'—')+'</small></div>'+
 '<button class="btn subtle" data-action="tab" data-tab="music">Szczegóły</button></section>';
}
function hallAnnouncementPanel(){
 const canStop=ready()&&!['unavailable','unknown'].includes(music()?.state);
 return '<div class="panel hall-announcement"><div class="twohead"><div><h3>Komunikat głosowy w holu</h3><small>Wpisz tekst, wybierz głos i odsłuchaj na komputerze</small></div></div>'+
 '<label class="hall-label" for="hall-message">Tekst komunikatu</label><textarea id="hall-message" class="input hall-message" rows="4" maxlength="650" placeholder="Np. Szanowni Goście, zapraszamy do restauracji SISU…">'+esc(hallDraft.text)+'</textarea>'+
 '<div class="hall-message-counter" id="hall-counter">'+hallDraft.text.length+' / 650 znaków</div>'+
 '<div class="music-select-row"><label for="hall-voice">Głos lektora</label><select id="hall-voice" class="input">'+
 '<option value="AgnieszkaNeural" '+(hallDraft.voice==='AgnieszkaNeural'?'selected':'')+'>Agnieszka · kobiecy</option>'+
 '<option value="MarekNeural" '+(hallDraft.voice==='MarekNeural'?'selected':'')+'>Marek · męski</option></select></div>'+
 '<audio id="hall-preview-audio" controls preload="none" class="hall-audio" '+(hallDraft.id?'src="'+esc(new URL('api/hall-announcements/audio/'+hallDraft.id,ASSET_BASE).href)+'"':'')+'></audio>'+
 '<div class="station-actions"><button type="button" class="btn subtle" data-action="hall-preview" '+(!ready()?'disabled':'')+'>▶ Przygotuj i odsłuchaj</button>'+
 '<button type="button" class="btn primary" data-action="hall-send" '+(!ready()||!hallDraft.id?'disabled':'')+'>Nadaj komunikat na holu</button></div>'+
 '<p class="music-note">Przed emisją przygotuj odsłuch. Zmiana tekstu lub głosu wymaga nowego podglądu.</p>'+
 '<div class="hall-stop-row"><button type="button" class="btn hall-stop-btn" data-action="music-stop" '+(!canStop?'disabled':'')+'>■ Zatrzymaj odtwarzanie muzyki w holu</button>'+
 '<small>Zatrzymuje bieżące odtwarzanie; harmonogram może później uruchomić radio ponownie.</small></div></div>';
}
function musicPage(){
 const m=music(),playing=m?.state==='playing';
 const row=(n,v)=>'<div class="datarow"><span>'+esc(n)+'</span><strong>'+esc(v||'Brak danych')+'</strong></div>';
 const volNumber=typeof m?.volume==='number'?Math.round(m.volume*100):null;
 const vol=volNumber===null?'Brak danych':volNumber+'%';
 const volumeDisabled=volNumber===null||!ready()||['unavailable','unknown'].includes(m?.state);
 const stations=Array.isArray(m?.stations)?m.stations:[];
 const selected=m?.selected||'Relaxing Piano';
 const active=stations.find(s=>s.name===selected)||stations[0]||{};
 return '<div class="music-hero"><span class="music-hero-icon">♫</span><div><span class="label">NAGŁOŚNIENIE HOLU · NA ŻYWO</span>'+
 '<h2>'+esc(playing?(m.title||'Radio internetowe'):'Obecnie nic nie gra')+'</h2>'+
 '<p>'+esc(m?.artist||'Brak danych o wykonawcy')+'</p><small>'+esc(musicStatus(m))+'</small></div></div>'+
 '<div class="split"><div class="panel"><h3>Aktualnie odtwarzane</h3>'+row('Stan',musicStatus(m))+
 row('Wykonawca',m?.artist)+row('Album',m?.album)+row('Głośność',vol)+row('Źródło',m?.source)+
 row('Wyciszenie',m?.muted?'Tak':'Nie')+'</div><div class="panel"><h3>Harmonogram</h3>'+
 row('Wybrana stacja',selected)+row('Start','Codziennie 07:00')+
 row('Stop','Codziennie 22:00')+row('Kontrola','Co 15 minut')+
 '<p class="music-note">Automatyka pilnuje wybranej stacji i wznawia ją w godzinach 07:00–22:00.</p></div></div>'+
 '<div class="panel hall-volume-panel"><div class="twohead"><div><h3>Głośność w holu</h3><small>Regulacja na żywo · tylko manager i administrator</small></div><strong class="volume-indicator" id="hall-volume-label">'+esc(vol)+'</strong></div>'+
 '<div class="hall-volume-controls"><button class="btn subtle" data-action="music-volume-step" data-step="-5" aria-label="Ścisz o 5 procent" '+(volumeDisabled?'disabled':'')+'>−5%</button>'+
 '<input class="hall-volume-slider" type="range" id="hall-volume-slider" min="0" max="100" step="1" value="'+esc(volNumber??0)+'" aria-label="Głośność holu w procentach" '+(volumeDisabled?'disabled':'')+'>'+
 '<button class="btn subtle" data-action="music-volume-step" data-step="5" aria-label="Zgłośnij o 5 procent" '+(volumeDisabled?'disabled':'')+'>+5%</button>'+
 '<button class="btn '+(m?.muted?'primary':'subtle')+'" data-action="music-volume-mute" '+(volumeDisabled?'disabled':'')+'>'+(m?.muted?'Włącz dźwięk':'Wycisz')+'</button></div>'+
 '<p class="music-note">Suwak i przyciski sterują głośnikiem holu. Poziom zostaje zapamiętany także na kolejny dzień. Wyciszenie nie zmienia wybranej stacji.</p></div>'+
 '<div class="panel music-picker"><div class="twohead"><div><h3>Wybór stacji</h3><small>Dostępne dla managera i administratora</small></div></div>'+
 '<div class="music-select-row"><label for="music-station-select">Radio w holu</label><select id="music-station-select" class="input">'+
 stations.map(s=>'<option value="'+esc(s.name)+'" data-description="'+esc(s.description||'')+'" data-preview="'+esc(s.preview||'')+'" '+(s.name===selected?'selected':'')+'>'+esc(s.name)+'</option>').join('')+
 '</select></div>'+
 '<div class="station-detail"><b id="music-station-name">'+esc(active.name||selected)+'</b><p id="music-station-description">'+esc(active.description||'')+'</p></div>'+
 '<div class="station-actions"><button class="btn subtle" data-action="music-preview">▶ Podgląd na komputerze</button>'+
 '<button class="btn primary" data-action="music-set" '+(!ready()?'disabled':'')+'>Ustaw w holu</button></div>'+
 '<p class="music-note">Podgląd otwiera strumień w nowej karcie na tym komputerze i nie zmienia muzyki w holu.</p></div>'+hallAnnouncementPanel();
}
function dashboard(){
 const all=rooms();
 return '<div class="kpis">'+kpi(all.length,'Apartamentów','Na czterech piętrach')+
 kpi('1 / 30','Automatyka','Pilotaż apartamentu 401')+
 kpi(count('Zameldowany'),'Zameldowani','Stan według obsługi')+
 kpi(count('Do sprzątania'),'Do sprzątania','Wymagana obsługa')+'</div>'+musicPreview()+
 '<div class="sectiontitle"><div><span class="label">BUDYNEK SISU</span><h2>Wszystkie apartamenty</h2></div><small>Kliknij lokal, aby nim zarządzać</small></div>'+
 '<div class="filters">'+[[0,'Wszystkie'],[1,'Piętro 1'],[2,'Piętro 2'],[3,'Piętro 3'],[4,'Piętro 4']].map(([f,label])=>'<button data-action="floor" data-floor="'+f+'" class="btn '+(f===S.floor?'active':'')+'">'+label+'</button>').join('')+
 '<input id="search" class="input" placeholder="Znajdź apartament…" value="'+esc(S.query)+'" aria-label="Szukaj apartamentu"></div>'+
 cardsRooms()+
 '<div class="split"><div class="panel"><h3>Statusy pobytów</h3>'+
 STATUSES.map(x=>'<div class="datarow"><span>'+esc(x)+'</span><strong>'+count(x)+'</strong></div>').join('')+
 '</div><div class="panel"><h3>System</h3><div class="datarow"><span>Serwer</span><strong>Włodkowica · Dell</strong></div><div class="datarow"><span>Home Assistant</span><strong class="'+(connected()?'ok':'warn')+'">'+(connected()?'Połączony':'Brak danych')+'</strong></div><div class="datarow"><span>Dostęp do ustawień HA</span><strong>Administrator HA</strong></div><div class="datarow"><span>Managerowie</span><strong>Tylko SISU WWW</strong></div></div></div>';
}
function deviceRow(name,state,label,opts=''){
 return '<div class="datarow"><span>'+esc(name)+'</span><strong '+opts+'>'+esc(label||state)+'</strong></div>';
}
function cmd(kind,name,value,label,selected,disabled){
 return '<button class="control '+(selected?'selected':'')+'" data-action="command" data-kind="'+esc(kind)+'" data-name="'+esc(name||'')+'" data-value="'+esc(value)+'" '+(disabled?'disabled':'')+'>'+esc(label)+'</button>';
}
function tempEntry(kind,name,value,min,max,disabled){
 const id='temp-'+kind+'-'+String(name||'main').toLowerCase().replace(/[^a-z0-9]+/g,'-');
 const safe=typeof value==='number'&&Number.isFinite(value)?value:22;
 return '<div class="temp-entry"><input class="temp-number" id="'+esc(id)+'" type="number" inputmode="decimal" min="'+min+'" max="'+max+'" step="0.5" value="'+esc(safe)+'" '+(disabled?'disabled':'')+' aria-label="Temperatura docelowa"><span>°C</span><button class="control temp-apply" data-action="temperature-set" data-kind="'+esc(kind)+'" data-name="'+esc(name||'')+'" data-input="'+esc(id)+'" '+(disabled?'disabled':'')+'>Ustaw</button></div>';
}
function hvac(){
 const v=room401();if(!v)return'<div class="empty">Oczekiwanie na odczyty apartamentu 401.</div>';
 const windowsUnsafe=v.windows.some(x=>x.state!=='off');
 const blocked=!ready();
 const ac=v.ac;
 return '<div class="hero"><span class="label">SALON · POMIAR</span><strong>'+temp(v.temperature)+'</strong><small>Klimatyzator raportuje '+temp(ac.temperature)+'</small></div>'+
 (windowsUnsafe?'<div class="notice">Co najmniej jedno okno jest otwarte albo czujnik okna jest niedostępny. Włączenie klimatyzacji zostało zabezpieczone po stronie serwera.</div>':'')+
 '<div class="columns"><div><div class="panel devicebox"><h3>Mitsubishi — klimatyzacja</h3>'+
 deviceRow('Tryb',ac.state,ac.state)+deviceRow('Nastawa',ac.target,temp(ac.target))+
 '<div class="controlrow"><span>Tryb pracy</span><div class="controls">'+
 cmd('ac','','off','Wyłącz',ac.state==='off',blocked)+
 cmd('ac','','heat','Grzanie',ac.state==='heat',blocked||windowsUnsafe)+
 cmd('ac','','cool','Chłodzenie',ac.state==='cool',blocked||windowsUnsafe)+'</div></div>'+
 '<div class="controlrow temperature-control"><span>Temperatura docelowa</span><div class="controls">'+
 cmd('ac_temp','',Math.max(16,Number(ac.target||22)-.5),'−',false,blocked||windowsUnsafe)+
 '<span class="current">'+temp(ac.target)+'</span>'+
 cmd('ac_temp','',Math.min(30,Number(ac.target||22)+.5),'+',false,blocked||windowsUnsafe)+
 tempEntry('ac_temp','',Number(ac.target||22),16,30,blocked||windowsUnsafe)+
 '</div></div></div><div class="panel devicebox"><h3>Telewizor Samsung</h3>'+
 deviceRow('Stan',v.tv.state,v.tv.state==='off'?'Wyłączony':['on','idle','playing','paused','standby','buffering'].includes(v.tv.state)?'Włączony':'Brak połączenia')+'<div class="controlrow"><span>Zasilanie</span><div class="controls">'+
 cmd('tv','','off','Wyłącz',v.tv.state==='off',blocked||!v.tv.available)+
 cmd('tv','','on','Włącz',v.tv.state==='on'||v.tv.state==='playing',blocked||!v.tv.available)+
 '</div></div></div></div>'+
 '<div><div class="panel devicebox"><h3>Grzejniki · regulacja</h3>'+
 v.heating.map(x=>'<div class="controlrow temperature-control"><span><b>'+esc(x.name)+'</b><small>Aktualnie '+temp(x.temperature)+'</small></span><div class="controls">'+
 cmd('trv',x.name,Math.max(8,Number(x.target||22)-.5),'−',false,blocked||!x.available)+
 '<span class="current">'+temp(x.target)+'</span>'+
 cmd('trv',x.name,Math.min(28,Number(x.target||22)+.5),'+',false,blocked||!x.available)+
 tempEntry('trv',x.name,Number(x.target||22),8,28,blocked||!x.available)+
 '</div></div>').join('')+'</div></div>'+
 '<div><div class="panel devicebox"><h3>Oświetlenie</h3>'+
 v.lights.map(x=>'<div class="controlrow"><span><b>'+esc(x.name)+'</b><small>'+esc(labelForState(x.state))+'</small></span><div class="controls">'+
 cmd('light',x.name,'off','Wyłącz',x.state==='off',blocked||!x.available)+
 cmd('light',x.name,'on','Włącz',x.state==='on',blocked||!x.available)+
 '</div></div>').join('')+'</div></div></div>'+
 '<div class="split roominfo"><div class="panel"><h3>Okna</h3>'+
 v.windows.map(x=>deviceRow(x.name,x.state,labelForState(x.state,'Otwarte','Zamknięte'),x.state==='on'?'class="warn"':'class="ok"')).join('')+
 '</div><div class="panel"><h3>Ruch</h3>'+
 v.motion.map(x=>deviceRow(x.name,x.state,labelForState(x.state,'Ruch','Brak ruchu'))).join('')+
 '</div></div>';
}
function operations(){
 return '<p class="lead">Ręczne statusy obsługi wszystkich 30 lokali. Zapis trafia bezpośrednio do Home Assistant, ale manager nie otrzymuje dostępu do samego HA.</p>'+
 (S.focusRoom?'<div class="notice positive">Wybrano apartament '+esc(S.focusRoom)+'. Możesz zmienić jego status poniżej.</div>':'')+
 '<div class="operations">'+rooms().map(r=>'<div class="opsitem" '+(S.focusRoom===r.number?'style="border-color:#d5b478"':'')+'><h3>'+r.number+'</h3><small>Piętro '+r.floor+'</small>'+
 '<select class="input" data-action="room-status" data-room="'+r.number+'" aria-label="Status apartamentu '+r.number+'" '+(!ready()?'disabled':'')+'>'+
 STATUSES.map(s=>'<option '+(s===r.status?'selected':'')+' value="'+esc(s)+'">'+esc(s)+'</option>').join('')+'</select></div>').join('')+'</div>';
}
function alerts(){
 const v=room401();if(!v)return'<div class="empty">Brak danych z Home Assistant.</div>';
 return '<p class="lead">Odczyty urządzeń na żywo. Żadne wskazania nie są symulowane.</p>'+
 '<div class="split"><div class="panel"><h3>Kontaktrony okien · 401</h3>'+
 v.windows.map(x=>deviceRow(x.name,x.state,labelForState(x.state,'Otwarte','Zamknięte'),x.state==='on'?'class="warn"':'class="ok"')).join('')+
 '</div><div class="panel"><h3>Czujniki ruchu · 401</h3>'+
 v.motion.map(x=>deviceRow(x.name,x.state,labelForState(x.state,'Ruch','Brak ruchu'))).join('')+
 '</div></div>';
}
function staff(){
 const list=S.users||[];
 return '<p class="lead">Konta personelu są niezależne od Home Assistanta. Nie tworzymy kont dla gości. Hasła przechowywane są w postaci silnych skrótów kryptograficznych.</p>'+
 '<div class="panel"><div class="twohead"><h3>Dodaj managera</h3><small>Wymagane hasło minimum 14 znaków</small></div>'+
 '<form id="new-manager" class="formgrid"><label>Adres e-mail<input name="email" class="input" type="email" autocomplete="off" required></label>'+
 '<label>Hasło<input name="password" class="input" type="password" minlength="14" required autocomplete="new-password"></label>'+
 '<label>Powtórz hasło<input name="repeat" class="input" type="password" minlength="14" required autocomplete="new-password"></label>'+
 '<button type="submit" class="btn primary" '+(!ready()?'disabled':'')+'>Dodaj konto</button></form>'+
 '<p class="topnote">Hasło podaj managerowi bezpiecznym kanałem. Nie jest wysyłane do Home Assistanta.</p></div>'+
 '<div class="panel people"><h3>Upoważnione konta ('+list.length+')</h3>'+
 list.map(x=>'<div class="datarow"><span><b>'+esc(x.email)+'</b><small style="display:block">'+(x.role==='admin'?'Administrator':'Manager')+'</small></span><div style="display:flex;align-items:center;gap:10px">'+
 '<strong class="'+(x.active?'ok':'warn')+'">'+(x.active?'Aktywne':'Zablokowane')+'</strong>'+
 (x.role==='manager'?'<button data-action="disable" data-id="'+esc(x.id)+'" class="btn '+(x.active?'danger':'subtle')+'" '+(!ready()?'disabled':'')+'>'+(x.active?'Zablokuj':'Odblokuj')+'</button>':'')+
 '</div></div>').join('')+'</div>';
}
function tvPage(){
 if(S.user?.role!=='admin')return '<div class="empty">Brak uprawnień.</div>';
 const list=S.tvs||[];
 const pending=S.tvPending||[];
 const roomNumbers=(S.tvRooms&&S.tvRooms.length?S.tvRooms:rooms().map(r=>r.number));
 const options=roomNumbers.map(n=>'<option value="'+n+'">'+n+'</option>').join('');
 const now=Date.now();
 const rows=list.length?list.map(d=>
  '<div class="tv-device"><div class="tv-device-icon">▣</div><div class="tv-device-info"><b>'+esc(d.name)+' · '+esc(d.room)+'</b>'+
  '<small>'+esc(d.mode==='demo'?'TRYB TESTOWY':'APARTAMENT')+' · v'+esc(d.version||'—')+' · '+esc(d.deviceId)+'</small>'+
  '<small>Ostatnio widziany: '+esc(d.lastSeen?new Date(d.lastSeen).toLocaleString('pl-PL'):'Brak danych')+'</small></div>'+
  '<span class="tv-indicator '+(d.online?'online':'')+'">'+(d.online?'Online':'Offline')+'</span>'+
  '<select class="input tv-room-select" data-tv-room="'+esc(d.id)+'">'+roomNumbers.map(n=>'<option value="'+n+'" '+(d.room===n?'selected':'')+'>'+n+'</option>').join('')+'</select>'+
  '<button class="btn subtle" data-action="tv-reassign" data-id="'+esc(d.id)+'">Zmień pokój</button>'+
  '<button class="btn danger" data-action="tv-revoke" data-id="'+esc(d.id)+'">Odłącz</button></div>'
 ).join(''):'<div class="empty">Nie ma jeszcze przypisanych telewizorów. Pierwszy sparujemy testowo w salonie.</div>';
 const waiting=pending.length?pending.map(x=>
  '<div class="tv-pending-row"><strong>Kod '+esc(x.code)+'</strong><span>ID '+esc(x.deviceId)+' · v'+esc(x.version||'—')+'</span>'+
  '<small>'+(!x.approved?'Oczekuje na przypisanie':'Zatwierdzono — telewizor pobierze konfigurację')+'</small></div>'
 ).join(''):'<p class="muted">Brak telewizorów oczekujących na parowanie.</p>';
 return '<div class="tv-admin"><div class="panel tv-intro">'+
  '<h3>Jeden system, 30 niezależnych apartamentów</h3><p>Po pierwszym uruchomieniu SISU23 TV pokazuje 8-cyfrowy kod. Wpisz go poniżej, wybierz apartament i zatwierdź. Telewizor sam pobierze numer pokoju. Tryb testowy nie steruje urządzeniami.</p>'+
  '<div class="tv-kpis"><b>'+list.length+' z 30</b><small>Przypisanych telewizorów</small><b>'+list.filter(x=>x.online).length+'</b><small>Online</small></div></div>'+
  '<div class="split tv-headpanels"><section class="panel"><h3>Sparuj nowy telewizor</h3>'+
  '<form id="tv-approve" class="tv-form"><label>Kod wyświetlony na TV<input class="input" name="code" pattern="[0-9]{8}" minlength="8" maxlength="8" inputmode="numeric" placeholder="8 cyfr" required></label>'+
  '<label>Apartament<select class="input" name="room" required>'+options+'</select></label>'+
  '<label>Tryb<select class="input" name="mode"><option value="demo">TEST — bez sterowania</option><option value="room">Apartament docelowy</option></select></label>'+
  '<button class="btn primary" type="submit">Przypisz telewizor</button></form>'+
  '<p class="tv-note">Parowanie zabezpiecza konto administratora i jednorazowy kod. Jeden telewizor docelowy może być przypisany do jednego apartamentu.</p></section>'+
  '<section class="panel"><h3>Czekają na przypisanie</h3><div class="tv-pending">'+waiting+'</div>'+
  '<button class="btn subtle" data-action="tv-refresh">Odśwież listę</button></section></div>'+
  '<div class="panel"><div class="twohead"><h3>Telewizory w apartamentach</h3><small>Wersja · Stan · Lokal</small></div>'+
  '<div class="tv-devices">'+rows+'</div><p class="tv-note">Urządzenia nie otrzymują klucza administracyjnego Home Assistant. Sterowanie pokojami będzie udostępniane dopiero po bezpiecznym przypisaniu encji do poszczególnych apartamentów.</p></div></div>';
}
async function loadUpdates(){
 if(S.user?.role!=='admin')return;
 try{await window.SISUTVAdmin.load(request);if(S.tab==='updates')render()}
 catch(e){toast('Aktualizacje TV: '+e.message,true)}
}
async function loadTvs(){
 if(S.user?.role!=='admin')return;
 try{
  const data=await request('/api/tvs');
  S.tvs=data.devices||[];S.tvPending=data.pending||[];S.tvRooms=data.rooms||[];
  if(S.tab==='tvs')render();
 }catch(e){toast('Telewizory: '+e.message,true);}
}
function render(){
 if(!S.configured){root.innerHTML=authForm(true);return;}
 if(!S.user){root.innerHTML=authForm(false);return;}
 let content=dashboard();
 if(S.tab==='room401')content=hvac();
 if(S.tab==='operations')content=operations();
 if(S.tab==='alerts')content=alerts();
 if(S.tab==='music')content=musicPage();
 if(S.tab==='staff')content=staff();
 if(S.tab==='tvs')content=tvPage();
 if(S.tab==='updates')content=window.SISUTVAdmin.page();
 root.innerHTML=layout(content);
}
async function loadData(silent=false,forceFresh=false){
 if(!S.user)return;
 const requestId=++overviewRequestId;
 try{
  const data=await request('/api/overview'+((forceFresh||!silent)?'?fresh=1':''));
  if(requestId!==overviewRequestId||!S.user)return;
  const old=JSON.stringify(S.overview?.rooms||[])+'|'+JSON.stringify(S.overview?.room401||null)+'|'+JSON.stringify(S.overview?.hallMusic||null);
  const incoming=JSON.stringify(data.rooms||[])+'|'+JSON.stringify(data.room401||null)+'|'+JSON.stringify(data.hallMusic||null);
  const changed=old!==incoming;
  S.overview=data;
  S.updated=new Date().toLocaleTimeString('pl-PL');
  if(S.tab!=='staff'&&(!silent||changed))render();
  else {
   const timestamp=root.querySelector('[data-last-update]');
   if(timestamp)timestamp.textContent='Aktualizacja '+S.updated;
  }
 }catch(e){
  if(requestId!==overviewRequestId)return;
  if(!silent)toast(e.message,true);
  if(S.tab!=='staff'&&!silent)render();
 }
}
async function loadUsers(){
 if(S.user?.role!=='admin')return;
 try{const d=await request('/api/users');S.users=d.users||[];render();}
 catch(e){toast(e.message,true);}
}
async function boot(){
 try{
  const session=await request('/api/session');
  S.configured=session.configured;S.user=session.authenticated?session.user:null;S.csrf=session.csrf||null;
  render();
  if(S.user)await loadData(true);
 }catch(e){toast('Nie można połączyć się z serwerem SISU: '+e.message,true);root.innerHTML='<div class="empty" style="margin:25vh auto;max-width:500px">Serwer SISU nie odpowiada. Spróbuj odświeżyć stronę.</div>';}
}
async function doAction(cb){
 if(S.busy)return false;
 S.busy=true;
 try{await cb();return true;}
 catch(e){toast(e.message,true);return false;}
 finally{S.busy=false;render();}
}
root.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el)return;
 const a=el.dataset.action;
 if(a==='tab'){S.tab=el.dataset.tab;S.focusRoom=null;render();if(S.tab==='staff')await loadUsers();else if(S.tab==='tvs')await loadTvs();else if(S.tab==='updates')await loadUpdates();else void loadData(true);return;}
 if(a==='floor'){S.floor=Number(el.dataset.floor);render();return;}
 if(a==='room'){const number=Number(el.dataset.room);S.tab=number===401?'room401':'operations';S.focusRoom=number===401?null:number;render();void loadData(true);return;}
 if(a==='refresh'){await doAction(()=>loadData(false,true));if(S.tab==='staff')await loadUsers();if(S.tab==='tvs')await loadTvs();if(S.tab==='updates')await loadUpdates();return;}
 if(a==='logout'){cancelFollowUpRefreshes();++overviewRequestId;await doAction(async()=>{await request('/api/logout',{});S.user=null;S.csrf=null;S.overview=null;S.tab='apartments';render()});return;}
 if(a==='tv-refresh'){await loadTvs();return;}
 if(a==='tv-update-preview'){try{window.SISUTVAdmin.preview(root);toast('Podgląd szkicu odświeżony.')}catch(e){toast(e.message,true)}return;}
 if(a==='tv-update-publish'){
  if(!confirm('Opublikować zapisany szkic dla wszystkich telewizorów SISU23?'))return;
  await doAction(async()=>{const x=await window.SISUTVAdmin.publish(request);await window.SISUTVAdmin.load(request);toast('Opublikowano aktualizację v'+x.version+'.')});
  return;
 }
 if(a==='tv-update-rollback'){
  const version=Number(el.dataset.version);
  if(!Number.isInteger(version)||!confirm('Przywrócić treści z wersji '+version+' dla wszystkich telewizorów?'))return;
  await doAction(async()=>{const x=await window.SISUTVAdmin.rollback(request,version);await window.SISUTVAdmin.load(request);toast('Przywrócono v'+version+' jako nową wersję '+x.version+'.')});
  return;
 }
 if(a==='tv-revoke'){
  if(!confirm('Na pewno odłączyć ten telewizor? Przestanie otrzymywać przypisanie pokoju.'))return;
  await doAction(async()=>{await request('/api/tvs/revoke',{id:el.dataset.id});toast('Telewizor odłączony.');await loadTvs()});
  return;
 }
 if(a==='tv-reassign'){
  const input=root.querySelector('[data-tv-room="'+el.dataset.id+'"]');
  const room=Number(input?.value);
  if(!room||!confirm('Zmienić przypisanie telewizora na apartament '+room+'?'))return;
  await doAction(async()=>{await request('/api/tvs/reassign',{id:el.dataset.id,room});toast('Nowy apartament: '+room);await loadTvs()});
  return;
 }
 if(a==='hall-preview'){
   const t=root.querySelector('#hall-message'),v=root.querySelector('#hall-voice');
   hallDraft.text=t?.value||'';hallDraft.voice=v?.value||'AgnieszkaNeural';
   if(!hallDraft.text.trim())return toast('Wpisz treść komunikatu.',true);
   const ok=await doAction(async()=>{
     const d=await request('/api/hall-announcements/preview',{text:hallDraft.text,voice:hallDraft.voice});
     hallDraft.id=d.id;toast('Odsłuch przygotowany.');
   });
   if(ok){const audio=root.querySelector('#hall-preview-audio');if(audio)audio.play().catch(()=>toast('Naciśnij ▶ w odtwarzaczu.'));}
   return;
  }
  if(a==='hall-send'){
   if(!hallDraft.id)return toast('Najpierw przygotuj odsłuch.',true);
   if(!confirm('Nadać przygotowany komunikat przez głośniki w holu SISU?'))return;
   const ok=await doAction(async()=>{
     await request('/api/hall-announcements/send',{id:hallDraft.id});
     hallDraft.id=null;toast('Komunikat wysłany do holu.');await loadData(true,true);
   });
   if(ok)refreshAfterControl('music');
   return;
  }
  if(a==='music-stop'){
   const ok=await doAction(async()=>{await request('/api/music/stop',{});toast('Wysłano polecenie zatrzymania holu.');await loadData(true,true)});
   if(ok)refreshAfterControl('music');
   return;
  }
  if(a==='music-preview'){
  const select=root.querySelector('#music-station-select');
  const option=select?.selectedOptions?.[0];
  const url=option?.dataset.preview;
  if(!url)return toast('Brak adresu podglądu',true);
  window.open(url,'_blank','noopener,noreferrer');
  return;
 }
 if(a==='music-volume-step'){
   const current=music()?.volume;
   if(typeof current!=='number')return toast('Brak odczytu głośności holu',true);
   const volume=Math.max(0,Math.min(100,Math.round(current*100)+Number(el.dataset.step||0)));
   const success=await doAction(async()=>{
     await request('/api/music/volume',{volume});
     toast('Głośność holu: '+volume+'%');
     await loadData(true,true);
   });
   if(success)refreshAfterControl('music-volume');
   return;
 }
 if(a==='music-volume-mute'){
   const muted=!music()?.muted;
   const success=await doAction(async()=>{
     await request('/api/music/mute',{muted});
     toast(muted?'Wyciszono muzykę w holu':'Przywrócono dźwięk w holu');
     await loadData(true,true);
   });
   if(success)refreshAfterControl('music-volume');
   return;
 }
 if(a==='music-set'){
  const station=root.querySelector('#music-station-select')?.value;
  if(!station)return toast('Wybierz stację',true);
  const success=await doAction(async()=>{
   await request('/api/music',{station});
   toast('Ustawiono stację: '+station);
   await loadData(true,true);
  });
  if(success)refreshAfterControl('music');
  return;
 }
 if(a==='temperature-set'){
  const input=root.querySelector('#'+CSS.escape(el.dataset.input||''));
  if(!input)return;
  const raw=String(input.value||'').replace(',','.');
  const value=Number(raw);
  const kind=el.dataset.kind;
  const min=kind==='ac_temp'?16:8;
  const max=kind==='ac_temp'?30:28;
  if(!Number.isFinite(value)||value<min||value>max||Math.abs(value*2-Math.round(value*2))>1e-8){
   toast('Podaj temperaturę od '+min+' do '+max+'°C, co 0,5°C.',true);input.focus();return;
  }
  if(!confirm('Ustawić '+value.toLocaleString('pl-PL',{maximumFractionDigits:1})+'°C w apartamencie 401?'))return;
  const body={room:401,kind,name:el.dataset.name,value};
  const success=await doAction(async()=>{
   await request('/api/control',body);
   toast('Temperatura ustawiona. Sprawdzam aktualny stan urządzenia.');
   await loadData(true,true);
  });
  if(success)refreshAfterControl(kind);
  return;
 }
 if(a==='command'){
  const body={room:401,kind:el.dataset.kind,name:el.dataset.name,value:el.dataset.value};
  if(['trv','ac_temp'].includes(body.kind))body.value=Number(body.value);
  if(['ac','ac_temp','trv'].includes(body.kind)&&!confirm('Wysłać polecenie do urządzeń apartamentu 401?'))return;
  const success=await doAction(async()=>{
   await request('/api/control',body);
   toast('Polecenie wysłane. Sprawdzam aktualny stan urządzenia.');
   await loadData(true,true);
  });
  if(success)refreshAfterControl(body.kind);
  return;
 }
 if(a==='disable'){
  if(!confirm('Zmienić dostęp tego managera?'))return;
  await doAction(async()=>{await request('/api/users/disable',{id:el.dataset.id});toast('Uprawnienia zostały zmienione.');await loadUsers()});
 }
});
root.addEventListener('change',async e=>{
 if(e.target.id==='tv-update-upload'){
  try{const asset=await window.SISUTVAdmin.upload(e.target,S.csrf,ASSET_BASE);if(asset)toast('Plik dodany do biblioteki. Zapisz szkic, aby użyć go w TV.')}
  catch(err){toast(err.message,true)}
  return;
 }
 if(e.target.id==='hall-voice'){hallDraft.voice=e.target.value;hallDraft.id=null;const send=root.querySelector('[data-action="hall-send"]');if(send)send.disabled=true;return;}
  if(e.target.id==='music-station-select'){
  const option=e.target.selectedOptions?.[0];
  const name=root.querySelector('#music-station-name');
  const desc=root.querySelector('#music-station-description');
  if(name)name.textContent=option?.value||'';
  if(desc)desc.textContent=option?.dataset.description||'';
  return;
 }
 if(e.target.id==='hall-volume-slider'){
   const volume=Number(e.target.value);
   e.target.blur();
   if(!Number.isInteger(volume)||volume<0||volume>100)return;
   const success=await doAction(async()=>{
     await request('/api/music/volume',{volume});
     toast('Głośność holu: '+volume+'%');
     await loadData(true,true);
   });
   if(success)refreshAfterControl('music-volume');
   return;
 }
 if(e.target.dataset.action!=='room-status')return;
 const room=Number(e.target.dataset.room),status=e.target.value;
 const success=await doAction(async()=>{
  await request('/api/room-status',{room,status});
  toast('Apartament '+room+': '+status);
  await loadData(true,true);
 });
 if(success)refreshAfterControl('status');
});
root.addEventListener('input',e=>{
  if(e.target.id==='hall-message'){
    hallDraft.text=e.target.value;hallDraft.id=null;
    const counter=root.querySelector('#hall-counter');if(counter)counter.textContent=hallDraft.text.length+' / 650 znaków';
    const send=root.querySelector('[data-action="hall-send"]');if(send)send.disabled=true;
    return;
  }
 if(e.target.id==='hall-volume-slider'){
   const label=root.querySelector('#hall-volume-label');
   if(label)label.textContent=e.target.value+'%';
   return;
 }
 if(e.target.id==='search'){
  const at=e.target.selectionStart;
  S.query=e.target.value;render();
  const f=root.querySelector('#search');if(f){f.focus();f.setSelectionRange(at,at);}
 }
});
root.addEventListener('submit',async e=>{
 if(e.target.id==='tv-update-form'){
  e.preventDefault();
  await doAction(async()=>{await window.SISUTVAdmin.save(e.target,request);toast('Szkic zapisany. Opublikuj, aby telewizory zobaczyły zmianę.')});
  return;
 }
 if(!['login','setup','new-manager','tv-approve'].includes(e.target.id))return;
 e.preventDefault();
 const form=e.target, kind=form.id, fd=new FormData(form);
 if(kind==='tv-approve'){
  const body={code:String(fd.get('code')||'').trim(),room:Number(fd.get('room')),mode:String(fd.get('mode')||'demo')};
  const ok=await doAction(async()=>{await request('/api/tvs/approve',body);toast('Parowanie zaakceptowane. TV pobierze konfigurację.');await loadTvs()});
  if(ok)await loadTvs();
  return;
 }

 const body={email:String(fd.get('email')||'').trim(),password:String(fd.get('password')||'')};
 if(kind==='setup')body.code=String(fd.get('code')||'').trim();
 if(kind==='new-manager'){
  if(body.password!==fd.get('repeat')){toast('Hasła nie są identyczne',true);return;}
  body.role='manager';
 }
 await doAction(async()=>{
  const endpoint=kind==='login'?'/api/login':kind==='setup'?'/api/setup':'/api/users';
  const res=await request(endpoint,body);
  if(kind==='new-manager'){
   toast('Konto managera zostało utworzone.');await loadUsers();return;
  }
  S.configured=true;S.user=res.user;S.csrf=res.csrf;S.tab='apartments';
  toast('Zalogowano do SISU.');await loadData(true);
 });
});
setInterval(()=>{
 if(!S.busy&&S.user&&document.visibilityState==='visible'&&S.tab!=='staff'){
  if(S.tab==='tvs'){void loadTvs();return;}
  if(S.tab==='updates')return;
  const active=document.activeElement;
  if(active&&['INPUT','SELECT','TEXTAREA'].includes(active.tagName))return;
  loadData(true);
 }
},10000);
boot();
})();