'use strict';
(() => {
const root=document.getElementById('app');
const notices=document.getElementById('toast-stack');
const ASSET_BASE=new URL('./',document.currentScript?.src||window.location.href);
const S={user:null,csrf:null,configured:true,tab:'apartments',floor:0,query:'',focusRoom:null,overview:null,users:[],busy:false,updated:null};
const FLOORS=[4,3,2,1];
const STATUSES=['Nieustalony','Oczekuje na przyjazd','Zameldowany','Do sprzątania','Sprzątanie','Gotowy'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const temp=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('pl-PL',{maximumFractionDigits:1})+'°C':'—';
const connected=()=>!!S.overview?.room401;
const rooms=()=>S.overview?.rooms||[];
const room401=()=>S.overview?.room401||null;
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
function pageTitle(){return {apartments:'Apartamenty',room401:'Apartament 401',operations:'Obsługa i statusy',alerts:'Okna i czujniki',staff:'Kontrola dostępu'}[S.tab]||'Centrum zarządzania'}
function layout(content){
 const role=S.user.role==='admin'?'Administrator':'Manager';
 return '<div class="shell"><aside class="side"><div class="brand"><span class="logo">SISU</span><small>BOUTIQUE APARTMENTS<br>WŁODKOWICA</small></div><div class="label">CENTRUM ZARZĄDZANIA</div><nav>'+
 nav('apartments','Apartamenty','⌂')+nav('room401','Sterowanie 401','◈')+nav('operations','Obsługa','▤')+nav('alerts','Czujniki','◇')+
 (S.user.role==='admin'?nav('staff','Personel','♙'):'')+
 '</nav><div class="sidefoot"><span class="statusdot '+(connected()?'ok':'')+'"></span>'+ (connected()?'Home Assistant połączony':'Oczekiwanie na odczyty')+
 '<div style="margin-top:11px">30 apartamentów · 4 piętra<br>Bez dostępu gości do panelu</div></div></aside>'+
 '<main class="main"><header class="header"><div><span class="label">SISU / WŁODKOWICA</span><h1>'+pageTitle()+'</h1><p class="subtitle">Wrocław · prywatny panel obsługi</p></div><div class="header-right"><div class="userbadge">'+role+'<small>'+esc(S.user.email)+'</small></div><button class="btn subtle" data-action="refresh" '+(S.busy?'disabled':'')+'>Odśwież</button><button class="btn subtle" data-action="logout">Wyloguj</button></div></header>'+
 content+'<footer><span>SISU Boutique Apartments · Oddzielny dostęp managerów</span><span>Aktualizacja '+esc(S.updated||'—')+'</span></footer></main></div>';
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
function dashboard(){
 const all=rooms();
 return '<div class="kpis">'+kpi(all.length,'Apartamentów','Na czterech piętrach')+
 kpi('1 / 30','Automatyka','Pilotaż apartamentu 401')+
 kpi(count('Zameldowany'),'Zameldowani','Stan według obsługi')+
 kpi(count('Do sprzątania'),'Do sprzątania','Wymagana obsługa')+'</div>'+
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
 '<div class="controlrow"><span>Temperatura docelowa</span><div class="controls">'+
 cmd('ac_temp','',Math.max(16,Number(ac.target||22)-.5),'−',false,blocked||windowsUnsafe)+
 '<span class="current">'+temp(ac.target)+'</span>'+
 cmd('ac_temp','',Math.min(30,Number(ac.target||22)+.5),'+',false,blocked||windowsUnsafe)+
 '</div></div></div><div class="panel devicebox"><h3>Telewizor Samsung</h3>'+
 deviceRow('Stan',v.tv.state,v.tv.state)+'<div class="controlrow"><span>Zasilanie</span><div class="controls">'+
 cmd('tv','','off','Wyłącz',v.tv.state==='off',blocked||!v.tv.available)+
 cmd('tv','','on','Włącz',v.tv.state==='on'||v.tv.state==='playing',blocked||!v.tv.available)+
 '</div></div></div></div>'+
 '<div><div class="panel devicebox"><h3>Grzejniki · regulacja</h3>'+
 v.heating.map(x=>'<div class="controlrow"><span><b>'+esc(x.name)+'</b><small>Aktualnie '+temp(x.temperature)+'</small></span><div class="controls">'+
 cmd('trv',x.name,Math.max(8,Number(x.target||22)-.5),'−',false,blocked||!x.available)+
 '<span class="current">'+temp(x.target)+'</span>'+
 cmd('trv',x.name,Math.min(28,Number(x.target||22)+.5),'+',false,blocked||!x.available)+
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
function render(){
 if(!S.configured){root.innerHTML=authForm(true);return;}
 if(!S.user){root.innerHTML=authForm(false);return;}
 let content=dashboard();
 if(S.tab==='room401')content=hvac();
 if(S.tab==='operations')content=operations();
 if(S.tab==='alerts')content=alerts();
 if(S.tab==='staff')content=staff();
 root.innerHTML=layout(content);
}
async function loadData(silent=false){
 if(!S.user)return;
 try{
  const data=await request('/api/overview');
  S.overview=data;
  S.updated=new Date().toLocaleTimeString('pl-PL');
  if(S.tab!=='staff')render();
 }catch(e){
  S.overview=null;
  if(!silent)toast(e.message,true);
  if(S.tab!=='staff')render();
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
 if(S.busy)return;
 S.busy=true;
 try{await cb();}
 catch(e){toast(e.message,true);}
 finally{S.busy=false;render();}
}
root.addEventListener('click',async e=>{
 const el=e.target.closest('[data-action]');if(!el)return;
 const a=el.dataset.action;
 if(a==='tab'){S.tab=el.dataset.tab;S.focusRoom=null;render();if(S.tab==='staff')await loadUsers();return;}
 if(a==='floor'){S.floor=Number(el.dataset.floor);render();return;}
 if(a==='room'){const number=Number(el.dataset.room);S.tab=number===401?'room401':'operations';S.focusRoom=number===401?null:number;render();return;}
 if(a==='refresh'){await doAction(()=>loadData());if(S.tab==='staff')await loadUsers();return;}
 if(a==='logout'){await doAction(async()=>{await request('/api/logout',{});S.user=null;S.csrf=null;S.overview=null;S.tab='apartments';render()});return;}
 if(a==='command'){
  const body={room:401,kind:el.dataset.kind,name:el.dataset.name,value:el.dataset.value};
  if(['trv','ac_temp'].includes(body.kind))body.value=Number(body.value);
  if(['ac','ac_temp','trv'].includes(body.kind)&&!confirm('Wysłać polecenie do urządzeń apartamentu 401?'))return;
  await doAction(async()=>{
   await request('/api/control',body);
   toast('Polecenie zostało przyjęte przez Home Assistant.');
   await loadData(true);
  });return;
 }
 if(a==='disable'){
  if(!confirm('Zmienić dostęp tego managera?'))return;
  await doAction(async()=>{await request('/api/users/disable',{id:el.dataset.id});toast('Uprawnienia zostały zmienione.');await loadUsers()});
 }
});
root.addEventListener('change',async e=>{
 if(e.target.dataset.action!=='room-status')return;
 const room=Number(e.target.dataset.room),status=e.target.value;
 await doAction(async()=>{
  await request('/api/room-status',{room,status});
  toast('Apartament '+room+': '+status);
  await loadData(true);
 });
});
root.addEventListener('input',e=>{
 if(e.target.id==='search'){
  const at=e.target.selectionStart;
  S.query=e.target.value;render();
  const f=root.querySelector('#search');if(f){f.focus();f.setSelectionRange(at,at);}
 }
});
root.addEventListener('submit',async e=>{
 if(!['login','setup','new-manager'].includes(e.target.id))return;
 e.preventDefault();
 const form=e.target, kind=form.id, fd=new FormData(form);
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
  const active=document.activeElement;
  if(active&&['INPUT','SELECT','TEXTAREA'].includes(active.tagName))return;
  loadData(true);
 }
},20000);
boot();
})();
