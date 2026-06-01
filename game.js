/* ============================================================
   STAR-FIGHTER — Three.js dogfighting game (separate page)
   Player flies a Rebel X-wing (xwing.glb) vs waves of TIE
   fighters (tie.obj). AI co-pilot reuses config.js (AI_* / API).
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader }  from 'three/addons/loaders/OBJLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------------- tunables ---------------- */
const CFG = window.SMC_CONFIG || {};
const API_BASE = CFG.API_BASE || 'http://localhost:5050/api';
const AI = {
  url:   CFG.AI_URL   || 'https://api.openai.com/v1/chat/completions',
  key:   CFG.AI_KEY   || '',
  model: CFG.AI_MODEL || 'gpt-4o-mini',
};

const TUNE = {
  playerSize: 7,        // target length of the X-wing in world units
  tieSize: 6,
  baseSpeed: 60,        // forward units/sec at 100% throttle
  boostMul: 1.9,
  yawRate: 1.4,         // rad/sec at full mouse deflection
  pitchRate: 1.2,
  rollRate: 2.2,
  playerHp: 100,
  playerRadius: 3.2,
  tieRadius: 3.0,
  tieHp: 2,
  tieSpeed: 34,
  tieFireRange: 520,
  tieFireCd: 1.6,
  laserSpeed: 520,
  laserLife: 1.4,
  playerFireCd: 0.13,
  playerDmgPerHit: 8,
  // model orientation corrections (radians). Tweak if a nose points wrong.
  xwingRot: { x: 0, y: Math.PI, z: 0 },
  tieRot:   { x: 0, y: 0, z: 0 },
  // --- flight feel (tweak to taste) ---
  invertY: false,
  steerSmoothing: 9,     // higher = snappier response
  bankAmount: 0.6,       // visual roll into turns (radians)
  // --- enemy aggression / variety / difficulty ---
  tieTurn: 2.2,          // tracking agility (higher = tighter pursuit)
  tieFireAim: 0.55,      // dot threshold to open fire (lower = fires sooner)
  tieLead: 0.5,          // seconds of target lead when shooting
  interceptorChance: 0.3,
  interceptorSpeedMul: 1.5,
  tieBreakoffStart: 90,   // distance at which a TIE breaks off its attack run
  tieBreakoffEnd: 260,    // distance at which it re-engages
  tieBreakoffTime: 1.3,   // seconds it disengages (flies past, not tailing you)
  flipDur: 0.42,          // seconds for the snap-180 maneuver
  cobraDur: 0.9,          // seconds for the cobra maneuver
  cobraAngle: 2.0,        // peak nose-up angle (radians, ~115°)
  cobraSlow: 0.12,        // speed multiplier at the apex (bleeds energy)
  cobraTravel: 0.6,       // overall travel-speed multiplier during the whole cobra
  autopilotTurn: 1.9,     // autopilot steering agility (rad/s)
  lockRange: 750,         // max auto lock-on distance
  lockCone: 0.55,         // how far off-axis a target can be to lock (dot)
};

/* ---------------- DOM ---------------- */
const $ = s => document.querySelector(s);
const canvas = $('#game-canvas');
const elLoad = $('#loading'), elLoadPct = $('#load-pct');
const elMenu = $('#menu'), elGameover = $('#gameover'), elPause = $('#pause');
const r2Badge = $('#r2-badge');
const elScore = $('#score-val'), elWave = $('#wave-val'), elEnemies = $('#enemies-val');
const elHp = $('#hp-bar'), elBoost = $('#boost-bar'), elThrottle = $('#throttle-val');
const elBanner = $('#banner');
const radar = $('#radar'), radarCtx = radar.getContext('2d');
const muteInd = $('#mute-ind');
const lockReticle = $('#lock-reticle'), modeInd = $('#mode-ind');

/* ---------------- audio (synthesized, no asset files) ---------------- */
const audio = (() => {
  let ctx; let on = true;
  const ac = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  function tone({ freq = 600, to = null, dur = 0.12, type = 'square', vol = 0.15 }) {
    if (!on) return; const c = ac(); const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  }
  function boom({ dur = 0.5, vol = 0.5 }) {
    if (!on) return; const c = ac(); const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1000, c.currentTime);
    const g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f).connect(g).connect(c.destination); src.start();
  }
  return {
    resume() { ac(); },
    laser()      { tone({ freq: 900, to: 180, dur: 0.13, type: 'sawtooth', vol: 0.10 }); },
    enemyLaser() { tone({ freq: 300, to: 110, dur: 0.16, type: 'square',   vol: 0.06 }); },
    hit()        { tone({ freq: 220, to: 90,  dur: 0.09, type: 'square',   vol: 0.16 }); },
    explosion()  { boom({ dur: 0.5, vol: 0.45 }); tone({ freq: 120, to: 35, dur: 0.4, type: 'sawtooth', vol: 0.18 }); },
    toggle() { on = !on; muteInd.textContent = on ? '🔊' : '🔇'; if (on) ac(); return on; },
    get on() { return on; }
  };
})();

/* ---------------- three.js core ---------------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x01030a);
scene.fog = new THREE.FogExp2(0x01030a, 0.00045);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 8000);
camera.position.set(0, 4, 14);

// PBR environment so the GLB doesn't render black
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0x9fc6ff, 0x10131c, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(60, 80, 40); scene.add(sun);
const rim = new THREE.DirectionalLight(0x4488ff, 1.0);
rim.position.set(-50, -20, -60); scene.add(rim);

/* ---- starfield (recentred on the player so it feels infinite) ---- */
const starGeo = new THREE.BufferGeometry();
const STAR_N = 6000, starPos = new Float32Array(STAR_N * 3);
for (let i = 0; i < STAR_N; i++) {
  const r = 1500 * Math.cbrt(Math.random()) + 200;
  const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
  starPos[i*3]   = r * Math.sin(p) * Math.cos(t);
  starPos[i*3+1] = r * Math.sin(p) * Math.sin(t);
  starPos[i*3+2] = r * Math.cos(p);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfe0ff, size: 2.2, sizeAttenuation: false }));
scene.add(stars);

// a distant planet for scenery
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(260, 48, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a5a8f, roughness: 1, metalness: 0, emissive: 0x0a1830, emissiveIntensity: .4 })
);
planet.position.set(-700, -300, -1400);
scene.add(planet);

/* ---------------- helpers ---------------- */
function normalize(obj, targetSize, rot) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetSize / maxDim;
  obj.scale.setScalar(s);
  obj.position.sub(center.multiplyScalar(s));   // recenter
  const pivot = new THREE.Group();
  pivot.add(obj);
  obj.rotation.set(rot.x, rot.y, rot.z);        // orientation correction
  return pivot;
}

/* ---------------- asset loading ---------------- */
let xwingTemplate = null, tieTemplate = null;
const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => {
  elLoadPct.textContent = `Loading starfighters… ${Math.round((loaded/total)*100)}%`;
};

function loadAssets() {
  const gltfL = new GLTFLoader(manager);
  const objL  = new OBJLoader(manager);
  const pX = new Promise((res, rej) => gltfL.load('models/xwing.glb',
    g => { xwingTemplate = normalize(g.scene, TUNE.playerSize, TUNE.xwingRot); res(); },
    xhr => { if (xhr.total) elLoadPct.textContent = `Loading X-wing… ${Math.round(xhr.loaded/xhr.total*100)}%`; },
    rej));
  const pT = new Promise((res, rej) => objL.load('models/tie.obj',
    o => {
      o.traverse(m => { if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: 0x44484f, metalness: .7, roughness: .45 }); });
      tieTemplate = normalize(o, TUNE.tieSize, TUNE.tieRot); res();
    }, undefined, rej));
  return Promise.all([pX, pT]);
}

/* ---------------- game state ---------------- */
const G = {
  running: false, paused: false, over: false,
  player: null, vel: new THREE.Vector3(),
  throttle: 1, boost: 1, hp: TUNE.playerHp,
  enemies: [], bolts: [], fx: [],
  fireCd: 0, wave: 0, score: 0, kills: 0,
  lowHpWarned: false,
  smx: 0, smy: 0, bank: 0, curSpeed: 0,
  fwd: new THREE.Vector3(0, 0, -1), playerModel: null,
  flip: null, cobra: null, autopilot: false, autoFire: false, lockOn: false, lockTarget: null,
};
const input = { mx: 0, my: 0, firing: false, w: false, s: false, a: false, d: false, boost: false };

/* shared geometry/materials for bolts */
const boltGeo = new THREE.BoxGeometry(0.35, 0.35, 5);
const boltMatP = new THREE.MeshBasicMaterial({ color: 0x66ff66 });
const boltMatE = new THREE.MeshBasicMaterial({ color: 0xff4d4d });

/* ---------------- player ---------------- */
function spawnPlayer() {
  G.player = xwingTemplate.clone(true);
  G.player.position.set(0, 0, 0);
  G.player.quaternion.identity();
  G.playerModel = G.player.children[0];   // inner model, used for visual banking
  scene.add(G.player);
  G.hp = TUNE.playerHp; G.throttle = 1; G.boost = 1;
  G.smx = 0; G.smy = 0; G.bank = 0;
  G.flip = null; G.cobra = null; G.autopilot = false; G.autoFire = false; G.lockOn = false; G.lockTarget = null;
  G.vel.set(0, 0, 0);
}
const _fwd = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _axisX = new THREE.Vector3(1, 0, 0), _tmpQ = new THREE.Quaternion();
function forwardOf(obj, out) { return out.set(0, 0, -1).applyQuaternion(obj.quaternion).normalize(); }

/* ---------------- enemies ---------------- */
function spawnEnemy(offset, wave) {
  const e = tieTemplate.clone(true);
  e.position.copy(G.player.position).add(offset);
  // face the player immediately so they engage rather than fly off
  _m4.lookAt(e.position, G.player.position, new THREE.Vector3(0, 1, 0));
  e.quaternion.setFromRotationMatrix(_m4);
  const interceptor = Math.random() < TUNE.interceptorChance;
  const speedScale = 1 + (wave - 1) * 0.06;          // gets faster each wave
  if (interceptor) {
    e.traverse(m => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.color.setHex(0x7a2230);
        m.material.emissive = new THREE.Color(0x551015);
        m.material.emissiveIntensity = 0.6;
      }
    });
  }
  e.userData = {
    hp: interceptor ? 1 : TUNE.tieHp,
    radius: TUNE.tieRadius,
    speed: (interceptor ? TUNE.tieSpeed * TUNE.interceptorSpeedMul : TUNE.tieSpeed) * speedScale,
    fireCdBase: TUNE.tieFireCd / (interceptor ? 1.6 : 1) / (1 + (wave - 1) * 0.05),
    fireCd: Math.random() * TUNE.tieFireCd,
    interceptor,
    state: 'attack',
    stateT: 0
  };
  scene.add(e);
  G.enemies.push(e);
}
function startWave(n) {
  G.wave = n;
  const count = Math.min(3 + n, 12);
  const fwd = forwardOf(G.player, _fwd);
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const off = new THREE.Vector3(Math.cos(ang) * 140, (Math.random() - .5) * 80, -260 - Math.random() * 220)
      .applyQuaternion(G.player.quaternion);
    spawnEnemy(off, n);
  }
  banner(`WAVE ${n}`);
  copilotSay(n === 1
    ? `Shields up — ${count} TIE fighters inbound. Good hunting!`
    : `Wave ${n}: ${count} hostiles on the scope. Watch your six.`);
}

/* ---------------- projectiles ---------------- */
function fireBolt(pos, dir, fromPlayer) {
  const m = new THREE.Mesh(boltGeo, fromPlayer ? boltMatP : boltMatE);
  m.position.copy(pos);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  m.userData = { dir: dir.clone(), life: TUNE.laserLife, player: fromPlayer };
  scene.add(m); G.bolts.push(m);
}
function playerFire() {
  const fwd = forwardOf(G.player, _fwd).clone();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(G.player.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(G.player.quaternion);
  // two wingtip emitters
  const base = G.player.position.clone().add(fwd.clone().multiplyScalar(4)).add(up.clone().multiplyScalar(-0.5));
  // auto lock-on: aim bolts at the locked target instead of straight ahead
  const aim = (G.lockOn && G.lockTarget)
    ? G.lockTarget.position.clone().sub(base).normalize()
    : fwd;
  fireBolt(base.clone().add(right.clone().multiplyScalar(2.5)), aim, true);
  fireBolt(base.clone().add(right.clone().multiplyScalar(-2.5)), aim, true);
  audio.laser();
}

/* ---------------- explosions ---------------- */
function explode(pos, color = 0xffaa33, scale = 1) {
  const flash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.4 * scale, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending })
  );
  flash.position.copy(pos);
  scene.add(flash);
  G.fx.push({ mesh: flash, life: 0.6, max: 0.6, grow: 26 * scale });
}

/* ---------------- HUD / banner ---------------- */
let bannerTimer = 0;
function banner(text) { elBanner.textContent = text; elBanner.classList.add('show'); bannerTimer = 1.6; }
function updateHud() {
  elScore.textContent = G.score;
  elWave.textContent = G.wave;
  elEnemies.textContent = G.enemies.length;
  const pct = Math.max(0, G.hp) / TUNE.playerHp * 100;
  elHp.style.width = pct + '%';
  elHp.className = pct < 25 ? 'crit' : pct < 55 ? 'warn' : '';
  elBoost.style.width = (G.boost * 100) + '%';
  elThrottle.textContent = Math.round(G.throttle * 100) + '%';
  // mode indicators
  let m = '';
  if (G.autopilot) m += '<span class="m-auto">AUTOPILOT</span>';
  if (G.lockOn) m += '<span class="m-lock">LOCK-ON' + (G.lockTarget ? ' ●' : '') + '</span>';
  modeInd.innerHTML = m;
  // R2-D2 badge while autopilot flies (only if images/r2d2.png loaded)
  r2Badge.style.display = (G.autopilot && !r2Badge.dataset.failed) ? 'block' : 'none';
}

/* ---------------- damage / death ---------------- */
function damagePlayer(d) {
  if (G.over) return;
  G.hp -= d;
  if (G.hp <= 30 && !G.lowHpWarned) { G.lowHpWarned = true; copilotSay('Hull integrity critical! Evasive maneuvers — break off and recover.'); }
  if (G.hp <= 0) gameOver();
}
function killEnemy(e, idx) {
  explode(e.position, 0xff8844, 1.2); audio.explosion();
  scene.remove(e);
  G.enemies.splice(idx, 1);
  G.score += 100; G.kills++;
  if (G.kills % 10 === 0) copilotSay(`${G.kills} confirmed kills. You're a menace out there, pilot.`);
  if (G.enemies.length === 0 && G.running) {
    copilotSay('Sector clear. Reinforcements jumping in…');
    setTimeout(() => { if (G.running) startWave(G.wave + 1); }, 2200);
  }
}

/* ---------------- main update ---------------- */
const clock = new THREE.Clock();
function update(dt) {
  // throttle / boost
  if (input.w) G.throttle = Math.min(1, G.throttle + dt * 0.8);
  if (input.s) G.throttle = Math.max(0.15, G.throttle - dt * 0.8);
  let speed = TUNE.baseSpeed * G.throttle;
  if (input.boost && G.boost > 0) { speed *= TUNE.boostMul; G.boost = Math.max(0, G.boost - dt * 0.5); }
  else G.boost = Math.min(1, G.boost + dt * 0.25);

  // smoothed mouse input (tracked even while a maneuver/autopilot overrides steering)
  const k = Math.min(1, dt * TUNE.steerSmoothing);
  G.smx += (input.mx - G.smx) * k;
  G.smy += (input.my - G.smy) * k;

  // control priority: flip > cobra > autopilot > manual
  if (G.flip) {
    G.flip.t += dt;
    const a = Math.min(1, G.flip.t / G.flip.dur);
    G.player.quaternion.slerpQuaternions(G.flip.from, G.flip.to, a);
    if (a >= 1) G.flip = null;
  } else if (G.cobra) {
    G.cobra.t += dt;
    const a = Math.min(1, G.cobra.t / G.cobra.dur);
    const s = Math.sin(Math.PI * a);                    // 0 -> 1 -> 0 over the maneuver
    _tmpQ.setFromAxisAngle(_axisX, TUNE.cobraAngle * s); // pitch nose up, then back down
    G.player.quaternion.copy(G.cobra.from).multiply(_tmpQ);
    speed *= (1 - (1 - TUNE.cobraSlow) * s) * TUNE.cobraTravel; // bleed speed + overall slower travel
    if (a >= 1) G.cobra = null;
  } else if (G.autopilot && G.enemies.length) {
    autoSteer(dt);
  } else {
    const my = TUNE.invertY ? -G.smy : G.smy;
    G.player.rotateY(-G.smx * TUNE.yawRate * dt);
    G.player.rotateX(-my * TUNE.pitchRate * dt);
    if (input.a) G.player.rotateZ(TUNE.rollRate * dt);
    if (input.d) G.player.rotateZ(-TUNE.rollRate * dt);
  }

  // visual bank into turns (cosmetic, applied to the model only)
  if (G.playerModel) {
    G.bank += (-G.smx * TUNE.bankAmount - G.bank) * Math.min(1, dt * 4);
    G.playerModel.rotation.z = TUNE.xwingRot.z + G.bank;
  }

  // move forward — during a cobra, keep travelling along the entry heading
  // (nose rears up but the ship coasts forward & brakes, so pursuers overshoot)
  if (G.cobra) _fwd.copy(G.cobra.fwd0);
  else forwardOf(G.player, _fwd);
  G.fwd.copy(_fwd); G.curSpeed = speed;
  G.player.position.addScaledVector(_fwd, speed * dt);

  // auto lock-on target acquisition (updates the HUD reticle)
  updateLockOn();

  // firing — manual, or autopilot when it has a shot
  G.fireCd -= dt;
  if ((input.firing || (G.autopilot && G.autoFire)) && G.fireCd <= 0) { playerFire(); G.fireCd = TUNE.playerFireCd; }

  // keep stars + planet relative
  stars.position.copy(G.player.position);

  // chase camera — during a cobra hold a stable view and keep the reared-up ship framed
  const inCobra = !!G.cobra;
  const camQuat = inCobra ? G.cobra.from : G.player.quaternion;
  const offVec = inCobra ? new THREE.Vector3(0, 4, 17) : new THREE.Vector3(0, 2.6, 11);
  const camOff = offVec.applyQuaternion(camQuat).add(G.player.position);
  camera.position.lerp(camOff, 1 - Math.pow(0.0001, dt));
  // look at the ship itself during a cobra (it rears up); otherwise look ahead
  const look = inCobra
    ? G.player.position.clone().add(new THREE.Vector3(0, 2.5, 0))
    : G.player.position.clone().addScaledVector(_fwd, 30);
  camera.lookAt(look);
  camera.up.set(0, 1, 0).applyQuaternion(camQuat);
  const targetFov = (input.boost && G.boost > 0) ? 82 : 70;
  if (Math.abs(camera.fov - targetFov) > 0.1) { camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }

  updateEnemies(dt);
  updateBolts(dt);
  updateFx(dt);

  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) elBanner.classList.remove('show'); }
  drawRadar();
  updateHud();
}

const _toPlayer = new THREE.Vector3(), _eFwd = new THREE.Vector3(), _q = new THREE.Quaternion();
const _lead = new THREE.Vector3(), _flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const _m4 = new THREE.Matrix4();
const _worldUp = new THREE.Vector3(0, 1, 0);
function updateEnemies(dt) {
  for (let i = 0; i < G.enemies.length; i++) {
    const e = G.enemies[i];
    const ud = e.userData;
    _toPlayer.copy(G.player.position).sub(e.position);
    const dist = _toPlayer.length();
    _toPlayer.normalize();
    forwardOf(e, _eFwd);

    // collision with player (any state)
    if (dist < TUNE.playerRadius + ud.radius) {
      explode(e.position, 0xff8844, 1.3); audio.explosion(); damagePlayer(25);
      scene.remove(e); G.enemies.splice(i, 1); i--; continue;
    }

    // ---- BREAK-OFF: zoom past without tracking, so they don't glue to your tail ----
    if (ud.state === 'breakoff') {
      e.position.addScaledVector(_eFwd, ud.speed * 1.15 * dt);
      ud.stateT -= dt;
      if (ud.stateT <= 0 || dist > TUNE.tieBreakoffEnd) ud.state = 'attack';
      continue; // no tracking, no firing while disengaging
    }

    // ---- ATTACK: pursue + shoot ----
    _lead.copy(G.player.position).addScaledVector(G.fwd, G.curSpeed * TUNE.tieLead); // lead for shots
    _m4.lookAt(e.position, G.player.position, _worldUp); // -Z (forward) points at the player
    _q.setFromRotationMatrix(_m4);
    e.quaternion.rotateTowards(_q, TUNE.tieTurn * dt);

    forwardOf(e, _eFwd);
    const facing = _eFwd.dot(_toPlayer); // ~1 when nose-on to the player
    let desired = ud.speed;
    if (dist > 150 && facing > 0.2) desired = Math.max(ud.speed, G.curSpeed * 1.25); // don't let them be outrun
    e.position.addScaledVector(_eFwd, desired * dt);

    // fire at player (lead-aimed)
    ud.fireCd -= dt;
    if (dist < TUNE.tieFireRange && facing > TUNE.tieFireAim && ud.fireCd <= 0) {
      ud.fireCd = ud.fireCdBase * (0.7 + Math.random() * 0.6);
      const dir = _lead.clone().sub(e.position).normalize();
      const muzzle = e.position.clone().addScaledVector(_eFwd, 4);
      fireBolt(muzzle, dir, false);
      audio.enemyLaser();
    }

    // commit to a strafing pass once close: break off and fly past
    if (dist < TUNE.tieBreakoffStart) {
      ud.state = 'breakoff';
      ud.stateT = TUNE.tieBreakoffTime * (0.8 + Math.random() * 0.5);
    }
  }
}

/* ---------------- autopilot & auto lock-on ---------------- */
function nearestEnemy() {
  let best = null, bd = Infinity;
  for (const e of G.enemies) { const d = e.position.distanceTo(G.player.position); if (d < bd) { bd = d; best = e; } }
  return best;
}
function autoSteer(dt) {
  const t = nearestEnemy();
  if (!t) { G.autoFire = false; return; }
  _m4.lookAt(G.player.position, t.position, _worldUp); // -Z toward the target
  _q.setFromRotationMatrix(_m4);
  G.player.quaternion.rotateTowards(_q, TUNE.autopilotTurn * dt);
  forwardOf(G.player, _fwd);
  _v1.copy(t.position).sub(G.player.position).normalize();
  G.autoFire = _fwd.dot(_v1) > 0.985; // only shoot when nearly on target
}
function updateLockOn() {
  if (!G.lockOn || !G.player) { G.lockTarget = null; lockReticle.style.display = 'none'; return; }
  forwardOf(G.player, _fwd);
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    _v1.copy(e.position).sub(G.player.position);
    const d = _v1.length();
    if (d > TUNE.lockRange) continue;
    _v1.divideScalar(d);
    if (_fwd.dot(_v1) < TUNE.lockCone) continue; // must be in front
    if (d < bd) { bd = d; best = e; }
  }
  G.lockTarget = best;
  if (best) {
    _v1.copy(best.position).project(camera);
    if (_v1.z < 1) {
      lockReticle.style.display = 'block';
      lockReticle.style.left = ((_v1.x * 0.5 + 0.5) * innerWidth) + 'px';
      lockReticle.style.top = ((-_v1.y * 0.5 + 0.5) * innerHeight) + 'px';
    } else lockReticle.style.display = 'none';
  } else lockReticle.style.display = 'none';
}

// distance from point p to the segment a->b (prevents fast bolts tunneling through small hitboxes)
const _segAB = new THREE.Vector3(), _segP = new THREE.Vector3();
function segDist(a, b, p) {
  _segAB.copy(b).sub(a);
  const len2 = _segAB.lengthSq();
  let t = len2 > 0 ? _segP.copy(p).sub(a).dot(_segAB) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  _segP.copy(a).addScaledVector(_segAB, t);
  return _segP.distanceTo(p);
}
const _boltA = new THREE.Vector3();
function updateBolts(dt) {
  for (let i = 0; i < G.bolts.length; i++) {
    const b = G.bolts[i];
    _boltA.copy(b.position);                                  // segment start (this frame)
    b.position.addScaledVector(b.userData.dir, TUNE.laserSpeed * dt); // segment end
    b.userData.life -= dt;
    let hit = false;
    if (b.userData.player) {
      for (let j = 0; j < G.enemies.length; j++) {
        const e = G.enemies[j];
        if (segDist(_boltA, b.position, e.position) < e.userData.radius + 2) {
          e.userData.hp--; hit = true;
          if (e.userData.hp <= 0) { killEnemy(e, j); }
          else { explode(b.position, 0x66ff66, 0.4); audio.hit(); }
          break;
        }
      }
    } else {
      if (segDist(_boltA, b.position, G.player.position) < TUNE.playerRadius + 2) {
        hit = true; damagePlayer(TUNE.playerDmgPerHit); explode(b.position, 0xff4d4d, 0.4); audio.hit();
      }
    }
    if (hit || b.userData.life <= 0) { scene.remove(b); G.bolts.splice(i, 1); i--; }
  }
}

function updateFx(dt) {
  for (let i = 0; i < G.fx.length; i++) {
    const f = G.fx[i];
    f.life -= dt;
    const t = 1 - f.life / f.max;
    f.mesh.scale.setScalar(1 + t * f.grow);
    f.mesh.material.opacity = Math.max(0, 1 - t);
    if (f.life <= 0) { scene.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); G.fx.splice(i, 1); i--; }
  }
}

/* ---------------- radar / minimap ---------------- */
const _rRight = new THREE.Vector3(), _rRel = new THREE.Vector3();
const RADAR_RANGE = 700;
function drawRadar() {
  const c = radarCtx, W = radar.width, H = radar.height, cx = W / 2, cy = H / 2, R = W / 2 - 6;
  c.clearRect(0, 0, W, H);
  // rings + crosshair
  c.strokeStyle = 'rgba(120,200,255,.18)'; c.lineWidth = 1;
  c.beginPath(); c.arc(cx, cy, R * 0.5, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
  if (!G.player) return;
  _rRight.set(1, 0, 0).applyQuaternion(G.player.quaternion);
  for (const e of G.enemies) {
    _rRel.copy(e.position).sub(G.player.position);
    const fx = _rRel.dot(G.fwd);      // forward component
    const rx = _rRel.dot(_rRight);    // right component
    const px = cx + (rx / RADAR_RANGE) * R;
    const py = cy - (fx / RADAR_RANGE) * R;   // forward = up on radar
    if (Math.hypot(px - cx, py - cy) > R) continue;
    c.fillStyle = e.userData.interceptor ? '#ff5b6b' : '#ffd34d';
    c.beginPath(); c.arc(px, py, 3, 0, Math.PI * 2); c.fill();
  }
  // player marker (triangle pointing up = forward)
  c.fillStyle = '#7fe0ff';
  c.beginPath(); c.moveTo(cx, cy - 6); c.lineTo(cx - 4, cy + 4); c.lineTo(cx + 4, cy + 4); c.closePath(); c.fill();
}

/* ---------------- loop ---------------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.running && !G.paused && !G.over) update(dt);
  renderer.render(scene, camera);
}

/* ---------------- game flow ---------------- */
function startGame() {
  audio.resume(); // unlock WebAudio on this user gesture
  elMenu.classList.add('hidden');
  elGameover.classList.add('hidden');
  elPause.classList.add('hidden');
  // clear leftovers
  G.enemies.forEach(e => scene.remove(e)); G.bolts.forEach(b => scene.remove(b)); G.fx.forEach(f => scene.remove(f.mesh));
  G.enemies = []; G.bolts = []; G.fx = [];
  if (G.player) scene.remove(G.player);
  G.score = 0; G.kills = 0; G.wave = 0; G.over = false; G.paused = false; G.lowHpWarned = false;
  spawnPlayer();
  G.running = true;
  startWave(1);
  copilot.classList.add('open');
}
function gameOver() {
  G.running = false; G.over = true;
  $('#final-score').textContent = G.score;
  $('#final-wave').textContent = G.wave;
  $('#final-kills').textContent = G.kills;
  $('#gameover-quip').textContent = gameoverQuip();
  elGameover.classList.remove('hidden');
  copilotSay(`We're hit! Punch out! Final tally: ${G.kills} kills, ${G.score} points across ${G.wave} waves.`);
  submitAndShowLeaderboard();
}

/* ---- scores / leaderboard (backend) ---- */
function currentPlayer() {
  try { const u = JSON.parse(localStorage.getItem('smc_user')); if (u && u.username) return { id: u.id || 0, name: u.username }; } catch {}
  return { id: 0, name: 'Pilot' };
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
async function submitAndShowLeaderboard() {
  const list = $('#lb-list');
  const p = currentPlayer();
  // submit (skip empty runs to avoid cluttering the board with 0s)
  if (G.score > 0) {
    try {
      await fetch(API_BASE + '/scores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: p.id, playerName: p.name, points: G.score, wave: G.wave, kills: G.kills })
      });
    } catch {}
  }
  // fetch + render top 10
  try {
    const res = await fetch(API_BASE + '/scores?count=10');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!rows.length) { list.innerHTML = '<li class="lb-empty">No scores yet — be the first!</li>'; return; }
    let highlighted = false;
    list.innerHTML = rows.map((r, i) => {
      const mine = !highlighted && r.playerName === p.name && r.points === G.score;
      if (mine) highlighted = true;
      return `<li class="${mine ? 'me' : ''}"><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(r.playerName)}</span><span class="lb-pts">${r.points}</span></li>`;
    }).join('');
  } catch {
    list.innerHTML = '<li class="lb-empty">Leaderboard offline (API unreachable).</li>';
  }
}
function gameoverQuip() {
  const q = [
    'Stay on target next time, pilot.',
    'The Force was not with you… today.',
    'Even Red Squadron loses a bird now and then.',
    'Re-deploy and make them pay.',
  ];
  return q[Math.floor(Math.random() * q.length)];
}

/* ---------------- input ---------------- */
addEventListener('mousemove', e => {
  const cx = innerWidth / 2, cy = innerHeight / 2;
  const dz = 40; // deadzone px
  let dx = e.clientX - cx, dy = e.clientY - cy;
  dx = Math.abs(dx) < dz ? 0 : dx - Math.sign(dx) * dz;
  dy = Math.abs(dy) < dz ? 0 : dy - Math.sign(dy) * dz;
  input.mx = Math.max(-1, Math.min(1, dx / (cx - dz)));
  input.my = Math.max(-1, Math.min(1, dy / (cy - dz)));
});
addEventListener('mousedown', e => { if (e.target === canvas || e.target.id === 'hud' || e.target.closest('#hud')) input.firing = true; });
addEventListener('mouseup', () => input.firing = false);
addEventListener('keydown', e => {
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyW': input.w = true; break;
    case 'KeyS': input.s = true; break;
    case 'KeyA': input.a = true; break;
    case 'KeyD': input.d = true; break;
    case 'ShiftLeft': case 'ShiftRight': input.boost = true; break;
    case 'Space': input.firing = true; e.preventDefault(); break;
    case 'KeyP': if (G.running && !G.over) { setPaused(!G.paused); } break;
    case 'KeyM': audio.toggle(); break;
    case 'KeyQ': // snap-180: whip around to face whoever's on your tail
      if (G.running && !G.paused && !G.over && !G.flip && !G.cobra && G.player) {
        const to = G.player.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
        G.flip = { t: 0, dur: TUNE.flipDur, from: G.player.quaternion.clone(), to };
      }
      break;
    case 'KeyC': // cobra: rear the nose up, brake hard, let a pursuer overshoot
      if (G.running && !G.paused && !G.over && !G.flip && !G.cobra && G.player) {
        const fwd0 = new THREE.Vector3(0, 0, -1).applyQuaternion(G.player.quaternion);
        G.cobra = { t: 0, dur: TUNE.cobraDur, from: G.player.quaternion.clone(), fwd0 };
      }
      break;
    case 'KeyO': // autopilot toggle
      if (G.running && !G.over) {
        G.autopilot = !G.autopilot; G.autoFire = false;
        banner(G.autopilot ? 'AUTOPILOT ON' : 'AUTOPILOT OFF');
        copilotSay(G.autopilot ? 'Autopilot engaged — I\'ll fly and fire. Take a breather.' : 'Autopilot off — you have the stick, pilot.');
      }
      break;
    case 'KeyL': // auto lock-on toggle
      if (G.running && !G.over) {
        G.lockOn = !G.lockOn;
        banner(G.lockOn ? 'LOCK-ON ARMED' : 'LOCK-ON OFF');
      }
      break;
  }
});
addEventListener('keyup', e => {
  switch (e.code) {
    case 'KeyW': input.w = false; break;
    case 'KeyS': input.s = false; break;
    case 'KeyA': input.a = false; break;
    case 'KeyD': input.d = false; break;
    case 'ShiftLeft': case 'ShiftRight': input.boost = false; break;
    case 'Space': input.firing = false; break;
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// keep co-pilot input from triggering flight keys
['keydown','keyup'].forEach(ev => $('#copilot-text').addEventListener(ev, e => e.stopPropagation()));

$('#start-btn').addEventListener('click', startGame);
$('#restart-btn').addEventListener('click', startGame);

/* ============================================================
   AI CO-PILOT  (reuses config.js AI_* — mock unless a key is set)
   ============================================================ */
const copilot = $('#copilot'), cpMsgs = $('#copilot-msgs'), cpText = $('#copilot-text'), cpSend = $('#copilot-send');
const cpSuggest = $('#copilot-suggest');
$('#copilot-head').addEventListener('click', () => copilot.classList.toggle('open'));
$('#copilot-status').textContent = AI.key ? 'AI online' : 'online';

// pause helper — also surfaces the co-pilot above the pause overlay so you can chat
function setPaused(p) {
  G.paused = p;
  elPause.classList.toggle('hidden', !p);
  copilot.classList.toggle('elevated', p);
  if (p) copilot.classList.add('open');
}
$('#resume-btn').addEventListener('click', () => setPaused(false));

/* ---- typing suggestions ---- */
const SUGGESTIONS = ['How do I play?', "What's my hull?", 'How many TIEs are left?', "What's my score?", 'How does boost work?', 'Give me a tip', 'Hello R2'];
function renderSuggest() {
  const v = cpText.value.trim().toLowerCase();
  const list = v ? SUGGESTIONS.filter(s => s.toLowerCase().includes(v)) : SUGGESTIONS;
  if (!list.length) { cpSuggest.style.display = 'none'; cpSuggest.innerHTML = ''; return; }
  cpSuggest.style.display = 'flex';
  cpSuggest.innerHTML = list.slice(0, 5).map(s => `<button type="button" class="cp-sug">${s}</button>`).join('');
}
cpText.addEventListener('input', renderSuggest);
cpText.addEventListener('focus', renderSuggest);
cpText.addEventListener('blur', () => setTimeout(() => { cpSuggest.style.display = 'none'; }, 150));
cpSuggest.addEventListener('click', e => {
  const btn = e.target.closest('.cp-sug'); if (!btn) return;
  cpText.value = btn.textContent;
  cpSuggest.style.display = 'none';
  sendCopilot();
});

let cpHistory = [{ role: 'system', content: 'You are R2, a witty Rebel Alliance astromech co-pilot in a space dogfight. Keep replies to 1-2 short sentences, in-character and helpful.' }];
function cpAdd(role, text) {
  const d = document.createElement('div');
  d.className = 'cp-msg ' + (role === 'user' ? 'user' : 'bot');
  d.textContent = text; cpMsgs.appendChild(d); cpMsgs.scrollTop = cpMsgs.scrollHeight;
  return d;
}
function copilotSay(text) { cpAdd('bot', text); }

cpSend.addEventListener('click', sendCopilot);
cpText.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendCopilot(); } });

async function sendCopilot() {
  const text = cpText.value.trim(); if (!text) return;
  cpText.value = ''; cpSuggest.style.display = 'none'; cpAdd('user', text); cpHistory.push({ role: 'user', content: text });
  const typing = cpAdd('bot', '…'); typing.classList.add('typing'); cpSend.disabled = true;
  try {
    const reply = AI.key ? await callLLM() : mockReply(text);
    typing.classList.remove('typing'); typing.textContent = reply;
    cpHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    typing.classList.remove('typing'); typing.textContent = '⚠ ' + (err.message || 'comms down');
  } finally { cpSend.disabled = false; cpMsgs.scrollTop = cpMsgs.scrollHeight; }
}
async function callLLM() {
  // give the model live battle context
  const ctx = `Battle status — hull ${Math.max(0,Math.round(G.hp))}%, wave ${G.wave}, ${G.enemies.length} hostiles, score ${G.score}, ${G.kills} kills.`;
  const msgs = [cpHistory[0], { role: 'system', content: ctx }, ...cpHistory.slice(1).slice(-10)];
  const res = await fetch(AI.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI.key },
    body: JSON.stringify({ model: AI.model, messages: msgs })
  });
  if (!res.ok) throw new Error('LLM HTTP ' + res.status);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '(no response)';
}
function mockReply(q) {
  const s = q.toLowerCase();
  if (/\b(hi|hello|hey|r2)\b/.test(s)) return 'Beep-boop. Co-pilot ready. Keep the crosshair on those TIEs!';
  if (s.includes('how') && (s.includes('play') || s.includes('control'))) return 'Steer with the mouse, Space or click to fire, W/S for throttle, Shift to boost, A/D to roll.';
  if (s.includes('hull') || s.includes('health') || s.includes('shield')) return `Hull at ${Math.max(0,Math.round(G.hp))}%. ${G.hp < 40 ? 'Disengage and let it recover!' : 'Holding steady.'}`;
  if (s.includes('enemy') || s.includes('enemies') || s.includes('tie') || s.includes('hostile')) return `${G.enemies.length} hostile(s) on the scope this wave. Pick them off one at a time.`;
  if (s.includes('score') || s.includes('kill')) return `Score ${G.score}, ${G.kills} kills, wave ${G.wave}. Keep it up!`;
  if (s.includes('boost')) return 'Hold Shift to burn the boost gauge — great for closing in or breaking off.';
  if (s.includes('tip') || s.includes('help') || s.includes('strategy')) return 'Stay moving, never fly straight at a TIE, and use boost to escape when your hull dips.';
  return `Copy that. Hull ${Math.max(0,Math.round(G.hp))}%, ${G.enemies.length} hostiles, ${G.kills} kills so far.`;
}

/* ---------------- boot ---------------- */
animate(); // render loop runs even on menu
loadAssets().then(() => {
  elLoad.classList.add('hidden');
  elMenu.classList.remove('hidden');
  copilotSay('R2 online and strapped in. Hit Launch when you\'re ready, pilot.');
}).catch(err => {
  elLoadPct.textContent = 'Failed to load models: ' + (err.message || err);
  console.error(err);
});
