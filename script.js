/* ============================================================
   CONFIG  (real values live in config.js via window.SMC_CONFIG)
   ============================================================ */
const CONFIG = {
  API_BASE: (window.SMC_CONFIG && window.SMC_CONFIG.API_BASE) || 'http://localhost:5050/api'
};

/* ============================================================
   SMALL HELPERS
   ============================================================ */
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function getUser(){ try{return JSON.parse(localStorage.getItem('smc_user'));}catch{return null;} }
function setUser(u){ localStorage.setItem('smc_user', JSON.stringify(u)); }
function clearUser(){ localStorage.removeItem('smc_user'); }

/* ============================================================
   STARFIELD (animated auth/app background)
   ============================================================ */
(function buildStars(){
  const c=$('#stars'); if(!c) return;
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
    showMessage('Access granted. Launching hangar…',false);
    setTimeout(()=>enterApp(),700);
  }catch(err){
    // API offline -> allow demo login so the rest of the app is usable
    setUser({id:0,username:email.split('@')[0]||'Pilot',email,role:'User',message:'demo'});
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
    showMessage('Registration successful! Welcome to the squadron.',false);
    setTimeout(()=>{registerForm.reset();switchTab(true);},1500);
  }catch(err){
    showMessage('API offline — registration unavailable in demo mode.');
  }
});

/* ============================================================
   ROUTING / VIEW SWITCHING
   ============================================================ */
const viewAuth=$('#view-auth'), viewApp=$('#view-app');
const viewGame=$('#view-game'), viewProfile=$('#view-profile');
const gameFrame=$('#game-frame');

function enterApp(){
  const u=getUser(); if(!u){showAuth();return;}
  viewAuth.classList.add('hidden');
  viewApp.classList.remove('hidden');
  $('#topbar-user').textContent=u.username||'Pilot';
  if(gameFrame && !gameFrame.getAttribute('src')) gameFrame.setAttribute('src','game.html'); // load game on first entry
  route('app');
}
function showAuth(){
  viewApp.classList.add('hidden');
  viewAuth.classList.remove('hidden');
}
function route(name){
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===name));
  if(name==='profile'){
    viewGame.classList.add('hidden');
    viewProfile.classList.remove('hidden');
    fillProfile();
  }else{
    viewProfile.classList.add('hidden');
    viewGame.classList.remove('hidden');
  }
}
$$('.nav button').forEach(b=>b.addEventListener('click',()=>route(b.dataset.route)));
$('#logout-btn').addEventListener('click',()=>{clearUser();showAuth();});

function fillProfile(){
  const u=getUser()||{};
  $('#prof-avatar').textContent=(u.username||'P').charAt(0).toUpperCase();
  $('#prof-name').textContent=u.username||'Pilot';
  $('#prof-username').textContent=u.username||'—';
  $('#prof-email').textContent=u.email||'—';
  $('#prof-id').textContent=u.id??'—';
  $('#prof-role').textContent=u.role||'User';
}

/* ============================================================
   BOOT
   ============================================================ */
if(getUser()) enterApp(); else showAuth();
