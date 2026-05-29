/* ============================================================
   CONFIG
   ============================================================ */
const CONFIG = {
  // Base URL of the .NET Web API. Default targets the dockerized API
  // (docker-compose http port 5050); override in config.js if needed.
  API_BASE: (window.SMC_CONFIG && window.SMC_CONFIG.API_BASE) || 'http://localhost:5050/api',

  // ---- AI provider (OpenAI-compatible chat-completions endpoint) ----
  // Real values live in config.js (git-ignored) via window.SMC_CONFIG.
  // While AI_KEY is empty the chat runs in self-contained offline mock mode.
  AI_URL:   (window.SMC_CONFIG && window.SMC_CONFIG.AI_URL)   || 'https://api.openai.com/v1/chat/completions',
  AI_KEY:   (window.SMC_CONFIG && window.SMC_CONFIG.AI_KEY)   || '',
  AI_MODEL: (window.SMC_CONFIG && window.SMC_CONFIG.AI_MODEL) || 'gpt-4o-mini',

  // Rocket types that should be drawn/listed as "satellites".
  SATELLITE_TYPES: ['Fighter','Explorer','Probe','Satellite','Recon'],

  // Physics tuning
  G: 2600,            // gravitational constant (tuned for the seed world)
  VEL_SCALE: 6,       // world-units/sec per unit of API "Speed"
  MAX_SPEED: 900,     // velocity cap to keep the sim stable
  SAVE: false         // client-sim only — never write back to the API
};

/* Fallback seed data (matches the API seeds) used when the API is
   unreachable so the SPA still runs as a self-contained demo. */
const FALLBACK = {
  planets:[
    {id:1,name:'Earth',description:'Our home planet, rich in resources and life.',coordinateX:500,coordinateY:500,radius:40,planetType:'Rocky',color:'#4CAF50',resources:80,isHabitable:true},
    {id:2,name:'Mars',description:'The Red Planet, potential for colonization.',coordinateX:800,coordinateY:300,radius:35,planetType:'Desert',color:'#FF5722',resources:60,isHabitable:false},
    {id:3,name:'Jupiter',description:'The largest gas giant in the system.',coordinateX:200,coordinateY:700,radius:80,planetType:'Gas',color:'#FFC107',resources:90,isHabitable:false},
    {id:4,name:'Venus',description:'A hot planet with a thick atmosphere.',coordinateX:300,coordinateY:200,radius:38,planetType:'Lava',color:'#FF3333',resources:40,isHabitable:false},
    {id:5,name:'Ice Moon',description:'A small icy planet on the outskirts.',coordinateX:900,coordinateY:800,radius:25,planetType:'Ice',color:'#64B5F6',resources:30,isHabitable:false}
  ],
  rockets:[
    {id:1,name:'Star Explorer',description:'Advanced exploration vessel.',coordinateX:500,coordinateY:500,width:30,height:20,crewCount:8,captain:'Captain Ivan Ivanov',crewMembers:['Ivan Ivanov','Maria Petrova','George Dimitrov'],speed:15,fuelCapacity:200,currentFuel:200,rocketType:'Explorer',status:'Parked',directionDegrees:0,currentPlanetId:1},
    {id:2,name:'Cargo Giant',description:'Large cargo transport ship.',coordinateX:800,coordinateY:300,width:50,height:30,crewCount:4,captain:'Captain Elena Stoyanova',crewMembers:['Elena Stoyanova','Peter Petrov'],speed:8,fuelCapacity:500,currentFuel:450,rocketType:'Transport',status:'Parked',directionDegrees:180,currentPlanetId:2},
    {id:3,name:'Fast Falcon',description:'Fast reconnaissance ship.',coordinateX:200,coordinateY:700,width:20,height:15,crewCount:2,captain:'Captain Dimitar Nikolov',crewMembers:['Dimitar Nikolov'],speed:25,fuelCapacity:100,currentFuel:80,rocketType:'Fighter',status:'Parked',directionDegrees:270,currentPlanetId:3}
  ]
};

/* ============================================================
   SMALL HELPERS
   ============================================================ */
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const isSatellite = r => CONFIG.SATELLITE_TYPES.includes(r.rocketType);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

function getUser(){ try{return JSON.parse(localStorage.getItem('smc_user'));}catch{return null;} }
function setUser(u){ localStorage.setItem('smc_user', JSON.stringify(u)); }
function clearUser(){ localStorage.removeItem('smc_user'); }

/* ============================================================
   STARFIELD
   ============================================================ */
(function buildStars(){
  const c=$('#stars');
  for(let i=0;i<150;i++){
    const s=document.createElement('div');s.className='star';
    const sz=Math.random()*3;
    s.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${Math.random()*3+2}s`;
    c.appendChild(s);
  }
})();

/* ============================================================
   AUTH
   ============================================================ */
const tabLogin=$('#tab-login'), tabRegister=$('#tab-register');
const loginForm=$('#login-form'), registerForm=$('#register-form');
const msgBox=$('#message-container');

function showMessage(text, isError=true){
  msgBox.textContent=text;
  msgBox.className=`message ${isError?'error':'success'}`;
}
function switchTab(showLogin){
  msgBox.className='message hidden';
  tabLogin.classList.toggle('active',showLogin);
  tabRegister.classList.toggle('active',!showLogin);
  loginForm.classList.toggle('hidden',!showLogin);
  registerForm.classList.toggle('hidden',showLogin);
}
tabLogin.addEventListener('click',()=>switchTab(true));
tabRegister.addEventListener('click',()=>switchTab(false));

$$('.toggle-password').forEach(btn=>btn.addEventListener('click',function(){
  const input=this.previousElementSibling;
  input.type = input.type==='password' ? 'text' : 'password';
}));

loginForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const email=$('#login-email').value.trim();
  const password=$('#login-password').value.trim();
  if(!email) return showMessage('Email cannot be empty.');
  if(!password) return showMessage('Password cannot be empty.');
  showMessage('Authenticating…',false);
  try{
    const res=await fetch(`${CONFIG.API_BASE}/auth/login`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password})
    });
    const data=await res.json();
    if(!res.ok || data.isSuccess===false){
      return showMessage(data.message || 'Login failed.');
    }
    setUser(data);
    showMessage('Access granted. Launching console…',false);
    setTimeout(()=>enterApp(),700);
  }catch(err){
    // API offline -> allow demo login so the rest of the app is usable
    setUser({id:0,username:email.split('@')[0]||'Commander',email,role:'User',message:'demo'});
    showMessage('API offline — entering demo mode…',false);
    setTimeout(()=>enterApp(),700);
  }
});

registerForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const email=$('#reg-email').value.trim();
  const username=$('#reg-username').value.trim();
  const password=$('#reg-password').value.trim();
  const age=$('#reg-age').value.trim();
  const role=$('#reg-role').value;
  if(!email) return showMessage('Email cannot be empty.');
  if(username.length<3) return showMessage('Username must be at least 3 characters.');
  if(password.length<6) return showMessage('Password must be at least 6 characters.');
  if(!age||isNaN(age)||parseInt(age)<13) return showMessage('You must be a valid number and at least 13 years old.');
  if(!role) return showMessage('Please select a role.');
  showMessage('Establishing connection…',false);
  try{
    const res=await fetch(`${CONFIG.API_BASE}/auth/register`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,username,password,confirmPassword:password,age:parseInt(age),role})
    });
    const data=await res.json();
    if(!res.ok || data.isSuccess===false){
      return showMessage(data.message || 'Registration failed.');
    }
    showMessage('Registration successful! Welcome to the galaxy.',false);
    setTimeout(()=>{registerForm.reset();switchTab(true);},1500);
  }catch(err){
    showMessage('API offline — registration unavailable in demo mode.');
  }
});

/* ============================================================
   ROUTING / VIEW SWITCHING
   ============================================================ */
const viewAuth=$('#view-auth'), viewApp=$('#view-app');
const viewDash=$('#view-dashboard'), viewProfile=$('#view-profile');

function enterApp(){
  const u=getUser(); if(!u){showAuth();return;}
  viewAuth.classList.add('hidden');
  viewApp.classList.remove('hidden');
  $('#topbar-user').textContent=u.username||'Commander';
  route('app');
  initWorld();
}
function showAuth(){
  viewApp.classList.add('hidden');
  viewAuth.classList.remove('hidden');
}
function route(name){
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===name));
  if(name==='profile'){
    viewDash.classList.add('hidden');
    viewProfile.classList.remove('hidden');
    fillProfile();
  }else{
    viewProfile.classList.add('hidden');
    viewDash.classList.remove('hidden');
    requestAnimationFrame(fitView);
  }
}
$$('.nav button').forEach(b=>b.addEventListener('click',()=>route(b.dataset.route)));
$('#logout-btn').addEventListener('click',()=>{clearUser();stopSim();showAuth();});

function fillProfile(){
  const u=getUser()||{};
  $('#prof-avatar').textContent=(u.username||'C').charAt(0).toUpperCase();
  $('#prof-name').textContent=u.username||'Commander';
  $('#prof-username').textContent=u.username||'—';
  $('#prof-email').textContent=u.email||'—';
  $('#prof-id').textContent=u.id??'—';
  $('#prof-role').textContent=u.role||'User';
}

/* ============================================================
   WORLD STATE + DATA LOADING
   ============================================================ */
const state={
  planets:[],   // fixed gravity wells
  bodies:[],    // mobile rockets/satellites {..., x,y,vx,vy}
  selectedId:null,
  paused:false
};

async function fetchJSON(url){
  const res=await fetch(url);
  if(!res.ok) throw new Error('HTTP '+res.status);
  return res.json();
}

async function loadData(){
  try{
    const [planets,rockets]=await Promise.all([
      fetchJSON(`${CONFIG.API_BASE}/planets`),
      fetchJSON(`${CONFIG.API_BASE}/spacerockets`)
    ]);
    return {planets,rockets,live:true};
  }catch(err){
    console.warn('API unreachable, using fallback seed data:',err.message);
    return {planets:FALLBACK.planets,rockets:FALLBACK.rockets,live:false};
  }
}

function makeBody(r){
  const rad=(r.directionDegrees||0)*Math.PI/180;
  const v=(r.speed||10)*CONFIG.VEL_SCALE;
  return {
    ...r,
    x:r.coordinateX, y:r.coordinateY,
    vx:Math.cos(rad)*v, vy:Math.sin(rad)*v,
    speed:r.speed||10,
    isSat:isSatellite(r),
    trail:[]
  };
}

async function initWorld(){
  const data=await loadData();
  state.planets=data.planets.map(p=>({...p,x:p.coordinateX,y:p.coordinateY}));
  state.bodies=data.rockets.map(makeBody);
  $('#ai-status').textContent = 'Mission AI online' + (data.live?'':' · demo data');
  buildLists();
  setupCanvas();
  fitView();
  startSim();
}

/* ============================================================
   SIDEBAR LISTS
   ============================================================ */
function entityRow(obj,kind){
  const div=document.createElement('div');
  div.className='entity';
  div.dataset.kind=kind;
  div.dataset.id=obj.id;
  const color = kind==='planet'? obj.color : (kind==='sat'? '#00ffff':'#c89bff');
  const badge = kind==='planet'?'<span class="badge plt">planet</span>'
              : kind==='sat'?'<span class="badge sat">sat</span>'
              : '<span class="badge rkt">rocket</span>';
  const sub = kind==='planet'? `${obj.planetType} · r${obj.radius}` : `${obj.rocketType} · spd ${obj.speed}`;
  div.innerHTML=`<span class="dot" style="color:${color};background:${color}"></span>
    <div class="meta"><div class="nm">${obj.name}</div><div class="sub">${sub}</div></div>${badge}`;
  div.addEventListener('click',()=>{
    if(kind==='planet'){ focusOn(obj.x,obj.y); }
    else { selectBody(obj.id); focusOn(obj.x,obj.y); }
  });
  return div;
}
function buildLists(){
  const lp=$('#list-planets'),lr=$('#list-rockets'),ls=$('#list-sats');
  lp.innerHTML='';lr.innerHTML='';ls.innerHTML='';
  state.planets.forEach(p=>lp.appendChild(entityRow(p,'planet')));
  const sats=state.bodies.filter(b=>b.isSat), rkts=state.bodies.filter(b=>!b.isSat);
  rkts.forEach(r=>lr.appendChild(entityRow(r,'rocket')));
  sats.forEach(s=>ls.appendChild(entityRow(s,'sat')));
  $('#cnt-planets').textContent=`(${state.planets.length})`;
  $('#cnt-rockets').textContent=`(${rkts.length})`;
  $('#cnt-sats').textContent=`(${sats.length})`;
}
function highlightList(){
  $$('.entity').forEach(e=>{
    const sel = (e.dataset.kind!=='planet') && Number(e.dataset.id)===state.selectedId;
    e.classList.toggle('selected',sel);
  });
}

/* ============================================================
   CANVAS / CAMERA / RENDER
   ============================================================ */
const canvas=$('#space-canvas');
const ctx=canvas.getContext('2d');
const cam={x:500,y:500,zoom:0.6};
let dpr=window.devicePixelRatio||1;

function setupCanvas(){
  resizeCanvas();
  window.addEventListener('resize',resizeCanvas);
}
function resizeCanvas(){
  const r=canvas.parentElement.getBoundingClientRect();
  dpr=window.devicePixelRatio||1;
  canvas.width=r.width*dpr; canvas.height=r.height*dpr;
  canvas.style.width=r.width+'px'; canvas.style.height=r.height+'px';
}
const cw=()=>canvas.width/dpr, ch=()=>canvas.height/dpr;
function worldToScreen(x,y){return {x:(x-cam.x)*cam.zoom+cw()/2, y:(y-cam.y)*cam.zoom+ch()/2};}
function screenToWorld(sx,sy){return {x:(sx-cw()/2)/cam.zoom+cam.x, y:(sy-ch()/2)/cam.zoom+cam.y};}

function worldBounds(){
  const xs=[],ys=[];
  state.planets.forEach(p=>{xs.push(p.x-p.radius,p.x+p.radius);ys.push(p.y-p.radius,p.y+p.radius);});
  state.bodies.forEach(b=>{xs.push(b.x);ys.push(b.y);});
  if(!xs.length){return {minX:0,minY:0,maxX:1000,maxY:1000};}
  return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)};
}
function fitView(){
  resizeCanvas();
  const b=worldBounds();
  const w=Math.max(b.maxX-b.minX,200), h=Math.max(b.maxY-b.minY,200);
  cam.x=(b.minX+b.maxX)/2; cam.y=(b.minY+b.maxY)/2;
  cam.zoom=Math.min(cw()/w,ch()/h)*0.82;
}
function focusOn(x,y){cam.x=x;cam.y=y;}

$('#btn-fit').addEventListener('click',fitView);
$('#btn-zoom-in').addEventListener('click',()=>cam.zoom*=1.2);
$('#btn-zoom-out').addEventListener('click',()=>cam.zoom/=1.2);
$('#btn-pause').addEventListener('click',function(){state.paused=!state.paused;this.textContent=state.paused?'▶':'⏸';});

/* ---- mouse: pan + select ---- */
let dragging=false,moved=false,last={x:0,y:0};
canvas.addEventListener('mousedown',e=>{dragging=true;moved=false;last={x:e.clientX,y:e.clientY};});
window.addEventListener('mousemove',e=>{
  if(!dragging)return;
  const dx=e.clientX-last.x, dy=e.clientY-last.y;
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  cam.x-=dx/cam.zoom; cam.y-=dy/cam.zoom;
  last={x:e.clientX,y:e.clientY};
});
window.addEventListener('mouseup',e=>{
  if(dragging && !moved) handleClick(e);
  dragging=false;
});
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  const rect=canvas.getBoundingClientRect();
  const before=screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
  cam.zoom*=e.deltaY<0?1.12:0.89;
  cam.zoom=clamp(cam.zoom,0.05,8);
  const after=screenToWorld(e.clientX-rect.left,e.clientY-rect.top);
  cam.x+=before.x-after.x; cam.y+=before.y-after.y;
},{passive:false});

function handleClick(e){
  const rect=canvas.getBoundingClientRect();
  const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
  let hit=null,hd=18;
  state.bodies.forEach(b=>{
    const p=worldToScreen(b.x,b.y);
    const d=Math.hypot(p.x-sx,p.y-sy);
    if(d<hd){hd=d;hit=b;}
  });
  if(hit) selectBody(hit.id); else deselect();
}

/* ============================================================
   PHYSICS — planets are fixed attractors, bodies feel gravity
   ============================================================ */
let simRAF=null,lastT=0;
function startSim(){ if(simRAF)return; lastT=performance.now(); simRAF=requestAnimationFrame(loop); }
function stopSim(){ if(simRAF)cancelAnimationFrame(simRAF); simRAF=null; }

function step(dt){
  for(const b of state.bodies){
    let ax=0,ay=0;
    for(const p of state.planets){
      const dx=p.x-b.x, dy=p.y-b.y;
      const soft=p.radius*1.2;
      const d2=Math.max(dx*dx+dy*dy, soft*soft);
      const d=Math.sqrt(d2);
      const a=CONFIG.G*p.radius/d2;       // mass ∝ radius
      ax+=a*dx/d; ay+=a*dy/d;
      // bounce off the planet surface so bodies don't sink/explode
      if(d < p.radius+8){
        const nx=-dx/d, ny=-dy/d;
        const dot=b.vx*nx+b.vy*ny;
        if(dot<0){b.vx-=2*dot*nx; b.vy-=2*dot*ny; b.vx*=0.7; b.vy*=0.7;}
        b.x=p.x-nx*(p.radius+8); b.y=p.y-ny*(p.radius+8);
      }
    }
    b.vx+=ax*dt; b.vy+=ay*dt;
    // cap speed
    const sp=Math.hypot(b.vx,b.vy);
    if(sp>CONFIG.MAX_SPEED){b.vx*=CONFIG.MAX_SPEED/sp;b.vy*=CONFIG.MAX_SPEED/sp;}
    b.x+=b.vx*dt; b.y+=b.vy*dt;
    // live mirror of the persisted-style fields
    b.coordinateX=b.x; b.coordinateY=b.y;
    b.directionDegrees=(Math.atan2(b.vy,b.vx)*180/Math.PI+360)%360;
    // trail
    b.trail.push({x:b.x,y:b.y});
    if(b.trail.length>40)b.trail.shift();
  }
}

function loop(now){
  let dt=(now-lastT)/1000; lastT=now;
  dt=Math.min(dt,0.05);
  if(!state.paused) step(dt);
  render();
  updateInspectorLive();
  simRAF=requestAnimationFrame(loop);
}

/* ============================================================
   RENDER
   ============================================================ */
function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cw(),ch());

  // planets (locked)
  for(const p of state.planets){
    const s=worldToScreen(p.x,p.y);
    const r=p.radius*cam.zoom;
    const g=ctx.createRadialGradient(s.x-r*0.3,s.y-r*0.3,r*0.1,s.x,s.y,r);
    g.addColorStop(0,'#ffffff22'); g.addColorStop(0.2,p.color); g.addColorStop(1,shade(p.color,-50));
    ctx.beginPath();ctx.arc(s.x,s.y,r,0,7);ctx.fillStyle=g;ctx.fill();
    // glow
    ctx.beginPath();ctx.arc(s.x,s.y,r+6,0,7);
    ctx.strokeStyle=p.color+'55';ctx.lineWidth=2;ctx.stroke();
    if(p.planetType==='Gas'){
      ctx.beginPath();ctx.ellipse(s.x,s.y,r*1.6,r*0.5,-0.4,0,7);
      ctx.strokeStyle='#ffffff44';ctx.lineWidth=2;ctx.stroke();
    }
    // label
    ctx.fillStyle='#cfe';ctx.font='12px Orbitron, sans-serif';ctx.textAlign='center';
    ctx.fillText(p.name,s.x,s.y+r+16);
  }

  // bodies
  for(const b of state.bodies){
    // trail
    if(b.trail.length>1){
      ctx.beginPath();
      b.trail.forEach((t,i)=>{const s=worldToScreen(t.x,t.y);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});
      ctx.strokeStyle=(b.isSat?'#00ffff':'#c89bff')+'44';ctx.lineWidth=1.5;ctx.stroke();
    }
    const s=worldToScreen(b.x,b.y);
    const ang=Math.atan2(b.vy,b.vx);
    ctx.save();ctx.translate(s.x,s.y);ctx.rotate(ang);
    const sel=b.id===state.selectedId;
    if(b.isSat){
      // satellite: body + two solar panels
      ctx.fillStyle=sel?'#fff':'#00ffff';
      ctx.fillRect(-5,-4,10,8);
      ctx.fillStyle='#0bf';
      ctx.fillRect(-14,-3,7,6);ctx.fillRect(7,-3,7,6);
      ctx.strokeStyle='#88f';ctx.lineWidth=1;ctx.strokeRect(-14,-3,7,6);ctx.strokeRect(7,-3,7,6);
    }else{
      // rocket: triangle
      ctx.beginPath();ctx.moveTo(12,0);ctx.lineTo(-8,-7);ctx.lineTo(-8,7);ctx.closePath();
      ctx.fillStyle=sel?'#fff':'#c89bff';ctx.fill();
      ctx.fillStyle='#ff7b00';ctx.beginPath();ctx.moveTo(-8,-3);ctx.lineTo(-15,0);ctx.lineTo(-8,3);ctx.closePath();ctx.fill();
    }
    ctx.restore();
    if(sel){ctx.beginPath();ctx.arc(s.x,s.y,16,0,7);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}
    ctx.fillStyle=sel?'#fff':'#9fb';ctx.font='11px Rajdhani';ctx.textAlign='center';
    ctx.fillText(b.name,s.x,s.y-18);
  }
}
function shade(hex,amt){
  const n=parseInt(hex.replace('#',''),16);
  let r=(n>>16)+amt,g=(n>>8&255)+amt,b=(n&255)+amt;
  r=clamp(r,0,255);g=clamp(g,0,255);b=clamp(b,0,255);
  return `rgb(${r},${g},${b})`;
}

/* ============================================================
   SELECTION / INSPECTOR
   ============================================================ */
const inspector=$('#inspector');
function selectBody(id){
  state.selectedId=id;
  const b=state.bodies.find(x=>x.id===id);
  if(!b){deselect();return;}
  inspector.classList.remove('hidden');
  $('#insp-name').textContent=b.name;
  $('#insp-desc').textContent=b.description||'';
  $('#insp-dot').style.background=b.isSat?'#00ffff':'#c89bff';
  const badge=$('#insp-badge');
  badge.textContent=b.isSat?'satellite':'rocket';
  badge.className='badge '+(b.isSat?'sat':'rkt');
  $('#insp-type').textContent=b.rocketType;
  $('#insp-crew').textContent=`${b.crewCount} · ${b.captain||'—'}`;
  const sp=Math.hypot(b.vx,b.vy)/CONFIG.VEL_SCALE;
  $('#ctrl-speed').value=Math.round(sp);
  $('#ctrl-dir').value=Math.round(b.directionDegrees||0);
  $('#lbl-speed').textContent=Math.round(sp);
  $('#lbl-dir').textContent=Math.round(b.directionDegrees||0)+'°';
  highlightList();
}
function deselect(){state.selectedId=null;inspector.classList.add('hidden');highlightList();}
$('#insp-close').addEventListener('click',deselect);

function updateInspectorLive(){
  const b=state.bodies.find(x=>x.id===state.selectedId);
  if(!b)return;
  $('#insp-coord').textContent=`${b.x.toFixed(1)}, ${b.y.toFixed(1)}`;
  $('#insp-vel').textContent=Math.hypot(b.vx,b.vy).toFixed(1)+' u/s';
}

// Speed control: rescale velocity magnitude, keep direction
$('#ctrl-speed').addEventListener('input',function(){
  const b=state.bodies.find(x=>x.id===state.selectedId);if(!b)return;
  const target=Number(this.value)*CONFIG.VEL_SCALE;
  const cur=Math.hypot(b.vx,b.vy)||1;
  const ang=Math.atan2(b.vy,b.vx);
  b.vx=Math.cos(ang)*target; b.vy=Math.sin(ang)*target;
  if(cur<0.001){const r=(b.directionDegrees||0)*Math.PI/180;b.vx=Math.cos(r)*target;b.vy=Math.sin(r)*target;}
  b.speed=Number(this.value);
  $('#lbl-speed').textContent=this.value;
});
// Direction control: rotate velocity to a heading, keep magnitude
$('#ctrl-dir').addEventListener('input',function(){
  const b=state.bodies.find(x=>x.id===state.selectedId);if(!b)return;
  const deg=Number(this.value);const rad=deg*Math.PI/180;
  const mag=Math.hypot(b.vx,b.vy)|| (b.speed*CONFIG.VEL_SCALE) || CONFIG.VEL_SCALE*5;
  b.vx=Math.cos(rad)*mag; b.vy=Math.sin(rad)*mag;
  b.directionDegrees=deg;
  $('#lbl-dir').textContent=deg+'°';
});

/* ============================================================
   AI CHATBOT
   ============================================================ */
const aiFab=$('#ai-fab'),aiPanel=$('#ai-panel'),aiMessages=$('#ai-messages');
const aiText=$('#ai-text'),aiSend=$('#ai-send');
let aiHistory=[{role:'system',content:'You are Mission AI, the onboard assistant for a space mission control dashboard. Be concise, helpful, and a little spacey in tone.'}];

aiFab.addEventListener('click',()=>{
  aiFab.classList.add('spin');
  setTimeout(()=>aiFab.classList.remove('spin'),800);
  aiPanel.classList.toggle('open');
  if(aiPanel.classList.contains('open') && !aiMessages.children.length){
    addAIMsg('bot','Mission AI online. Ask me about the fleet, planets, satellites, or navigation.');
  }
});
$('#ai-close').addEventListener('click',()=>aiPanel.classList.remove('open'));

function addAIMsg(role,text){
  const d=document.createElement('div');
  d.className='ai-msg '+(role==='user'?'user':'bot');
  d.textContent=text;
  aiMessages.appendChild(d);
  aiMessages.scrollTop=aiMessages.scrollHeight;
  return d;
}

aiSend.addEventListener('click',sendAI);
aiText.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAI();}});

async function sendAI(){
  const text=aiText.value.trim();if(!text)return;
  aiText.value='';addAIMsg('user',text);
  aiHistory.push({role:'user',content:text});
  const typing=addAIMsg('bot','…');typing.classList.add('typing');
  aiSend.disabled=true;
  try{
    const reply = CONFIG.AI_KEY ? await callLLM() : mockReply(text);
    typing.classList.remove('typing');typing.textContent=reply;
    aiHistory.push({role:'assistant',content:reply});
  }catch(err){
    typing.classList.remove('typing');
    typing.textContent='⚠ '+(err.message||'AI request failed');
  }finally{
    aiSend.disabled=false;
    aiMessages.scrollTop=aiMessages.scrollHeight;
  }
}

async function callLLM(){
  const res=await fetch(CONFIG.AI_URL,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+CONFIG.AI_KEY},
    body:JSON.stringify({model:CONFIG.AI_MODEL,messages:aiHistory.slice(-12)})
  });
  if(!res.ok) throw new Error('LLM HTTP '+res.status);
  const data=await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '(no response)';
}

/* Offline mock: answers simple questions from live world state. */
function mockReply(q){
  const s=q.toLowerCase();
  const sats=state.bodies.filter(b=>b.isSat),rkts=state.bodies.filter(b=>!b.isSat);
  if(/\b(hi|hello|hey|yo|greetings)\b/.test(s)) return 'Mission AI here. Ask me about planets, rockets, satellites, the selected craft, or say "help" for controls.';
  if((s.includes('who')||s.includes('what'))&&s.includes('you')) return "I'm Mission AI, your onboard mission-control assistant. I track the fleet and the map live and can report on planets, rockets and satellites.";
  if(s.includes('planet')) return `There are ${state.planets.length} planets locked in place: ${state.planets.map(p=>p.name).join(', ')}.`;
  if(s.includes('satellite')) return sats.length?`Tracking ${sats.length} satellite(s): ${sats.map(b=>b.name).join(', ')}. Click one on the map to adjust its speed and heading.`:'No satellites in range right now.';
  if(s.includes('rocket')||s.includes('ship')||s.includes('fleet')) return `Fleet status: ${rkts.length} rocket(s) and ${sats.length} satellite(s) underway. ${state.selectedId?'Selected craft is highlighted on the map.':'Select one to inspect it.'}`;
  if(s.includes('select')&&state.selectedId){const b=state.bodies.find(x=>x.id===state.selectedId);return `${b.name} is at (${b.x.toFixed(0)}, ${b.y.toFixed(0)}) moving ${Math.hypot(b.vx,b.vy).toFixed(0)} u/s on heading ${Math.round(b.directionDegrees)}°.`;}
  if(s.includes('help')) return 'Drag to pan, scroll to zoom, click a craft to change its speed/direction. Planets are gravity wells — your ships curve around them.';
  return `I can report on planets, rockets and satellites. Right now I'm tracking ${state.planets.length} planets, ${rkts.length} rockets and ${sats.length} satellites — ask me about any of them, or say "help".`;
}

/* ---- AI panel resize ---- */
(function resizeAI(){
  const handle=$('#ai-resize');let rz=false;
  handle.addEventListener('mousedown',e=>{rz=true;e.preventDefault();document.body.style.userSelect='none';});
  window.addEventListener('mousemove',e=>{
    if(!rz)return;
    const w=clamp(window.innerWidth-e.clientX,320,window.innerWidth*0.9);
    document.documentElement.style.setProperty('--aiw',w+'px');
  });
  window.addEventListener('mouseup',()=>{rz=false;document.body.style.userSelect='';});
})();

/* ============================================================
   BOOT
   ============================================================ */
if(getUser()) enterApp(); else showAuth();
