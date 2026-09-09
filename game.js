const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const start = document.querySelector('#start');
const message = document.querySelector('#message');
const submessage = document.querySelector('#submessage');
const distanceNode = document.querySelector('#distance');
const bestNode = document.querySelector('#best');
const biomeNode = document.querySelector('#biome');
const boostNode = document.querySelector('#boost');
const eventNode = document.querySelector('#event');
const memoryOverlay = document.querySelector('#memory-overlay');
const memoryNumber = document.querySelector('#memory-number');
const doorLeft = document.querySelector('#door-left');
const doorRight = document.querySelector('#door-right');
const motionToggle = document.querySelector('#reduce-motion');

const W = canvas.width, H = canvas.height;
const TAU = Math.PI * 2;
let state, keys = {}, last = 0, raf = 0, audioCtx = null;
const bestKey = 'afterimageBest';
let best = Number(localStorage[bestKey] || 0);
bestNode.textContent = `${best}m`;

const monsters = [
  ['The Stranger', 'disguise'], ['The Long Walker', 'chase'], ['The Hollow Woman', 'disguise'],
  ['The Bent Man', 'always'], ['The Needle', 'chase'], ['The Watcher', 'always'],
  ['The Passenger', 'loop'], ['The Twin', 'loop'], ['The Runner', 'chase'], ['The Smiler', 'disguise'],
  ['The Tall Child', 'disguise'], ['The Road Bride', 'disguise'], ['The Antler', 'always'], ['The Crawling One', 'chase'],
  ['The Window Face', 'always'], ['The Backward Walker', 'loop'], ['The Pale Driver', 'chase'], ['The Bellman', 'always'],
  ['The Split Figure', 'disguise'], ['The Thin One', 'always'], ['The Mirror Twin', 'loop'], ['The Sleeper', 'always'],
  ['The Red Giant', 'chase'], ['The Distant Woman', 'loop'], ['The Bent Child', 'disguise'], ['The Long Arms', 'chase'],
  ['The Empty Suit', 'disguise'], ['The Black Deer', 'always'], ['The False Friend', 'disguise'], ['The Stilt Man', 'chase'],
  ['The Face in the Fog', 'always'], ['The Double', 'loop'], ['The Crooked One', 'disguise'], ['The Runner Two', 'chase'],
  ['The Tower', 'always'], ['The Pale Group', 'loop'], ['The Mouth', 'always'], ['The Guest', 'disguise'],
  ['The Red Walker', 'chase'], ['The Last Stranger', 'rare']
];
const biomeNames = ['HIGHWAY', 'DESERT', 'JUNGLE', 'DEAD CITY', 'RED FOREST', 'THE HOLLOW', 'MONSTER WORLD'];

function freshState() {
  return {
    running: false, paused: false, distance: 0, x: W / 2, y: H - 108,
    boostMeter: 0, speedBurst: 0, mainThreat: 0,
    road: true, eventTimer: 4, monsterTimer: 5, loopTimer: 9,
    monsters: [], pickups: [], particles: [], roadMarks: Array.from({length: 20}, (_, i) => i * 44 - 30),
    shake: 0, redFlash: 0, biome: 0, reduceMotion: false,
    memory: null, eventText: '', eventUntil: 0
  };
}
function reset() {
  state = freshState();
  distanceNode.textContent = '0m'; biomeNode.textContent = biomeNames[0]; boostNode.textContent = '—'; eventNode.textContent = '';
  memoryOverlay.classList.add('hidden'); draw();
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function showEvent(text, seconds = 2.5) { state.eventText = text; state.eventUntil = performance.now() / 1000 + seconds; eventNode.textContent = text; }
function beep(freq = 220, duration = .08, type = 'sine', volume = .025) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = volume; o.connect(g); g.connect(audioCtx.destination);
    const now = audioCtx.currentTime; g.gain.setValueAtTime(volume, now); g.gain.exponentialRampToValueAtTime(.0001, now + duration);
    o.start(now); o.stop(now + duration);
  } catch (_) {}
}
function setBiome() {
  const d = state.distance;
  let b = d < 180 ? 0 : d < 360 ? 1 : d < 620 ? 2 : d < 950 ? 3 : d < 1250 ? 4 : d < 1550 ? 5 : 6;
  if (b !== state.biome) { state.biome = b; showEvent(biomeNames[b], 2.2); beep(110 + b * 24, .18, 'triangle', .035); }
  biomeNode.textContent = biomeNames[b]; state.road = d < 260;
}
function addBoost() {
  state.pickups.push({ x: state.road ? rand(W * .39, W * .61) : rand(38, W - 38), y: -25, r: 12, spin: rand(0, TAU) });
}
function useBoost() {
  if (!state.running || state.memory || state.paused || state.boostMeter <= .02) return;
  state.boostMeter = 0; state.speedBurst = 2.15; state.shake = Math.max(state.shake, .25); showEvent('BOOST', 1.1); beep(420, .08, 'sawtooth', .035);
  for (let i = 0; i < 12; i++) state.particles.push({ x: state.x + rand(-12,12), y: state.y + rand(10,30), life: .45, max: .45, vx: rand(-35,35), vy: rand(80,180), kind: 'boost' });
}
function addMainThreatBurst() {
  state.mainThreat = 1; state.redFlash = .8; state.shake = Math.max(state.shake, .75); showEvent('SHE IS CLOSER', 1.6); beep(72, .28, 'sawtooth', .045);
}
function addMonster(forceType = null) {
  const available = Math.min(monsters.length, 5 + Math.floor(state.distance / 130));
  let choice = monsters[Math.floor(Math.random() * available)];
  if (forceType) choice = pick(monsters.filter(m => m[1] === forceType)) || choice;
  const [name, type] = choice;
  const disguised = type === 'disguise';
  state.monsters.push({
    name, type, x: state.road ? rand(W * .38, W * .62) : rand(28, W - 28), y: -70, life: 5.2, age: 0,
    revealed: !disguised, revealAt: disguised ? rand(110, 185) : 0, chase: type === 'chase' ? rand(1.4, 2.8) : 0,
    phase: rand(0, TAU), scale: rand(.8, 1.18), speed: rand(95, 145) + state.distance * .012, variant: Math.floor(rand(0, 6))
  });
}
function triggerEncounter() {
  const d = state.distance, chance = .22 + Math.min(.55, d / 2300);
  if (Math.random() < chance) addMonster(Math.random() < .62 ? 'disguise' : (Math.random() < .55 ? 'chase' : null));
  if (d > 700 && Math.random() < .16 + d / 8000) addMonster('always');
}
function startMemoryGame() {
  if (state.memory || !state.running) return;
  const d = state.distance, digits = d < 450 ? 2 : d < 850 ? 3 : d < 1250 ? 4 : d < 1750 ? 5 : d < 2500 ? 6 : 7;
  const min = 10 ** (digits - 1), max = 10 ** digits - 1, number = String(Math.floor(rand(min, max + 1)));
  const fakeIndex = Math.floor(Math.random() * digits), fake = number.split('');
  fake[fakeIndex] = String((Number(fake[fakeIndex]) + (Math.random() < .5 ? 1 : -1) + 10) % 10);
  if (fake.join('') === number) fake[fakeIndex] = String((Number(fake[fakeIndex]) + 3) % 10);
  state.memory = { answer: number, fake: fake.join(''), until: performance.now() / 1000 + Math.max(1.25, 2.35 - d / 1800) };
  memoryNumber.textContent = number;
  doorLeft.textContent = Math.random() < .5 ? number : fake.join('');
  doorRight.textContent = doorLeft.textContent === number ? fake.join('') : number;
  memoryOverlay.classList.remove('hidden'); showEvent('REMEMBER', 1.5); beep(520, .1, 'square', .025);
}
function chooseDoor(value) {
  if (!state.memory) return;
  if (value === state.memory.answer) {
    state.memory = null; memoryOverlay.classList.add('hidden'); showEvent('CORRECT', 1.1); beep(760, .12, 'triangle', .03); return;
  }
  state.memory = null; memoryOverlay.classList.add('hidden'); showEvent('WRONG DOOR', 1.2); state.redFlash = 1; state.shake = 1; beep(48, .5, 'sawtooth', .05); end('THE DOOR REMEMBERED YOU');
}
function maybeLoopEvent(dt) {
  state.loopTimer -= dt; if (state.loopTimer > 0) return;
  state.loopTimer = rand(11, 19) - Math.min(5, state.distance / 800); if (state.distance < 500) return;
  state.monsters.push({ name:'The Loop Person', type:'loop', x:state.road ? W/2 + rand(-55,55) : rand(80,W-80), y:-55, life:8, age:0, revealed:false, revealAt:220, chase:0, phase:rand(0,TAU), scale:1, speed:115, variant:0 });
  showEvent('HAVE I SEEN THEM BEFORE?', 2.2);
}
function update(dt) {
  if (!state.running || state.paused || state.memory) return;
  const now = performance.now() / 1000, d = state.distance;
  const danger = smoothstep(300, 1600, d);
  const move = ((keys.ArrowRight || keys.d) ? 1 : 0) - ((keys.ArrowLeft || keys.a) ? 1 : 0);
  state.x += move * (state.road ? 260 : 390 + danger * 170) * dt;
  if (state.road) {
    const roadCenter = W / 2 + Math.sin(d * .012) * 20, half = 102 + Math.sin(d * .008) * 10;
    state.x = clamp(state.x, roadCenter - half, roadCenter + half);
  } else state.x = clamp(state.x, 18, W - 18);
  const worldSpeed = 115 + Math.min(80, d * .025) + (state.speedBurst > 0 ? 150 : 0);
  state.distance += dt * (worldSpeed / 7.5); state.speedBurst = Math.max(0, state.speedBurst - dt);
  state.mainThreat = Math.max(0, state.mainThreat - dt * .18); state.redFlash = Math.max(0, state.redFlash - dt * 1.8); state.shake = Math.max(0, state.shake - dt * 1.6);
  setBiome(); state.roadMarks = state.roadMarks.map(y => y + worldSpeed * dt > H + 40 ? -40 : y + worldSpeed * dt);
  state.monsterTimer -= dt; state.eventTimer -= dt;
  if (state.monsterTimer <= 0) { triggerEncounter(); state.monsterTimer = Math.max(.9, rand(2.8,5.2) - Math.min(2.1,d/1500)); }
  if (state.eventTimer <= 0 && d > 220) {
    if (Math.random() < .16 + danger * .25) startMemoryGame(); else if (Math.random() < .7) addBoost();
    state.eventTimer = rand(3.5,7.2);
  }
  maybeLoopEvent(dt);
  if (Math.random() < dt * (.055 + danger * .2)) addBoost();
  state.pickups.forEach(p => { p.y += worldSpeed * dt; p.spin += dt * 5; });
  state.pickups = state.pickups.filter(p => {
    if (Math.hypot(p.x-state.x,p.y-state.y) < p.r+18) { state.boostMeter=1; showEvent('BOOST READY',1.2); beep(650,.09,'triangle',.03); return false; }
    return p.y < H+50;
  });
  state.monsters.forEach(m => {
    m.age += dt; m.y += (worldSpeed*.78+m.speed)*dt;
    if (m.type==='disguise' && !m.revealed && m.y > H*.46) { m.revealed=true; m.chase=rand(1.4,2.8); state.redFlash=Math.max(state.redFlash,.45); state.shake=Math.max(state.shake,.4); showEvent(m.name.toUpperCase(),1.4); beep(62,.18,'sawtooth',.04); }
    if (m.type==='chase' || (m.revealed && m.type==='disguise')) { m.x += Math.sign(state.x-m.x)*(45+danger*95)*dt; m.chase-=dt; if(m.chase<=0 && Math.abs(m.y-state.y)<250)m.life=0; }
    if (m.type==='loop') { m.x += Math.sin(m.age*1.5+m.phase)*18*dt; if(m.y>H*.52&&!m.revealed){m.revealed=true;showEvent('THAT WAS THE SAME PERSON',1.8);} }
  });
  state.monsters = state.monsters.filter(m => m.life > 0 && m.y < H+150);
  const threat = state.monsters.find(m => m.revealed && Math.abs(m.y-state.y)<120 && Math.abs(m.x-state.x)<35);
  if (threat && state.speedBurst<=0 && (threat.type==='chase'||threat.type==='disguise')) {
    if(state.boostMeter>.02) showEvent('BOOST TO ESCAPE',1.1);
    else { state.shake=Math.max(state.shake,.55); state.redFlash=Math.max(state.redFlash,.5); threat.life=0; state.distance=Math.max(0,state.distance-20); }
  }
  if (Math.random()<dt*8) state.particles.push({x:state.x+rand(-8,8),y:state.y+25,life:.25,max:.25,vx:rand(-15,15),vy:rand(20,50),kind:'dust'});
  state.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=(p.vy+worldSpeed)*dt;p.life-=dt;}); state.particles=state.particles.filter(p=>p.life>0);
  if(Math.random()<dt*(.006+danger*.014)){addMainThreatBurst();}
  if(d>1200&&state.boostMeter<=.02&&state.pickups.length===0&&Math.random()<dt*.28)addBoost();
  distanceNode.textContent=`${Math.floor(state.distance)}m`; boostNode.textContent=state.boostMeter>.02?'READY':'—';
  if(state.eventUntil<now)eventNode.textContent='';
}
function skyColor() {
  const r=smoothstep(0,1500,state.distance); return `rgb(${Math.floor(12+r*105)},${Math.floor(28-r*20)},${Math.floor(54-r*42)})`;
}
function drawBackground() {
  const d=state.distance, red=smoothstep(0,1500,d), g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,skyColor()); g.addColorStop(.48,`rgb(${18+red*48},${17-red*12},${25-red*13})`); g.addColorStop(1,`rgb(${12+red*28},${8-red*5},${12-red*3})`); ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const horizon=230, farColor=red>.7?'#261019':'#111a24';ctx.save();ctx.globalAlpha=.8;ctx.fillStyle=farColor;
  for(let x=-20;x<W+40;x+=34){const h=20+((x*17+Math.floor(d/50)*13)%70);ctx.fillRect(x,horizon-h,25,h);}ctx.restore();
  if(state.biome===1)drawDesert(); else if(state.biome===2)drawJungle(); else if(state.biome===3)drawDeadCity(); else if(state.biome===4)drawRedForest(); else if(state.biome>=5)drawMonsterWorld();
}
function drawDesert(){ctx.fillStyle='#5b3929';ctx.fillRect(0,235,W,H-235);ctx.fillStyle='#8b5135';for(let i=0;i<18;i++){const x=(i*83+Math.sin(state.distance*.01+i)*30)%W,y=270+(i*47)%280;ctx.fillRect(x,y,18,5);ctx.fillRect(x+8,y-8,5,8);}}
function drawJungle(){ctx.fillStyle='#163025';ctx.fillRect(0,225,W,H-225);ctx.fillStyle='#0e211b';for(let i=0;i<12;i++){const x=(i*61+Math.sin(state.distance*.015+i)*25+W)%W,h=90+(i%4)*35;ctx.fillRect(x,225-h,9,h);ctx.fillRect(x-20,225-h+18,42,7);ctx.fillRect(x-26,225-h+42,54,7);}}
function drawDeadCity(){ctx.fillStyle='#27222b';ctx.fillRect(0,225,W,H-225);ctx.fillStyle='#0f0d12';for(let i=0;i<8;i++){const x=i*72-18,h=75+(i%3)*45;ctx.fillRect(x,225-h,58,h);ctx.fillStyle='#8e3045';for(let yy=245-h;yy<215;yy+=18)ctx.fillRect(x+10,yy,7,7);ctx.fillStyle='#0f0d12';}}
function drawRedForest(){ctx.fillStyle='#32131b';ctx.fillRect(0,225,W,H-225);ctx.strokeStyle='#14090d';ctx.lineWidth=12;for(let i=0;i<11;i++){const x=i*57+Math.sin(i+state.distance*.01)*20;ctx.beginPath();ctx.moveTo(x,225);ctx.lineTo(x-15,120);ctx.lineTo(x+5,72);ctx.stroke();ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-10,145);ctx.lineTo(x-42,112);ctx.moveTo(x,132);ctx.lineTo(x+30,95);ctx.stroke();ctx.lineWidth=12;}}
function drawMonsterWorld(){ctx.fillStyle=state.biome===5?'#24111e':'#120810';ctx.fillRect(0,225,W,H-225);ctx.fillStyle='#4b1830';for(let i=0;i<9;i++){const x=40+i*60+Math.sin(i*3+state.distance*.008)*25,y=250+(i%4)*65;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+25,y-70);ctx.lineTo(x+45,y);ctx.closePath();ctx.fill();}if(state.biome>=6){ctx.fillStyle='rgba(240,60,90,.18)';for(let i=0;i<20;i++)ctx.fillRect(rand(0,W),rand(80,H),rand(2,7),rand(18,60));}}
function drawRoad(){if(!state.road)return;const d=state.distance,bend=Math.sin(d*.012)*18,roadLeft=78+bend,roadRight=W-78+bend;ctx.fillStyle='#08090c';ctx.beginPath();ctx.moveTo(roadLeft,0);ctx.lineTo(roadRight,0);ctx.lineTo(W-18,H);ctx.lineTo(18,H);ctx.closePath();ctx.fill();ctx.strokeStyle=`rgba(180,50,70,${.55+smoothstep(300,1500,d)*.35})`;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(roadLeft,0);ctx.lineTo(18,H);ctx.moveTo(roadRight,0);ctx.lineTo(W-18,H);ctx.stroke();ctx.fillStyle='#8c8189';state.roadMarks.forEach(y=>{const w=7+y/H*13;ctx.fillRect(W/2-w/2+Math.sin(d*.01)*y*.002,y,w,Math.max(3,y/H*7));});}
function drawBoosts(){state.pickups.forEach(p=>{ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.spin);ctx.shadowColor='#70e6ff';ctx.shadowBlur=18;ctx.fillStyle='#b9f6ff';ctx.fillRect(-7,-7,14,14);ctx.fillStyle='#256b82';ctx.fillRect(-3,-11,6,22);ctx.fillRect(-11,-3,22,6);ctx.restore();});}
function drawPixelBike(){ctx.save();ctx.translate(state.x,state.y);ctx.fillStyle='#111016';ctx.fillRect(-10,-28,20,17);ctx.fillStyle='#c8c2ca';ctx.fillRect(-8,-22,16,10);ctx.fillStyle='#19151d';ctx.fillRect(-13,-13,26,30);ctx.fillStyle='#9d2847';ctx.fillRect(-9,-8,18,15);ctx.fillStyle='#d7d0d5';ctx.fillRect(-4,-31,8,5);ctx.fillStyle='#0b0a0e';ctx.fillRect(-17,17,8,7);ctx.fillRect(9,17,8,7);ctx.fillStyle='#e2dce1';ctx.fillRect(-2,-2,4,17);ctx.restore();}
function drawMainWoman(){const d=state.distance,t=smoothstep(0,1500,d),surge=state.mainThreat,x=state.x+Math.sin(d*.015)*18,y=H+75-t*185-surge*95,s=.72+t*.55+surge*.2;ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.globalAlpha=.2+.75*t+.2*surge;if(t<.3){ctx.fillStyle='#141118';ctx.fillRect(-9,-58,18,32);ctx.fillRect(-14,-26,28,48);ctx.fillStyle='#cfc8c8';ctx.fillRect(-7,-63,14,10);ctx.fillStyle='#9c9aa2';ctx.fillRect(-10,-22,20,5);}else{ctx.shadowColor='#c31d45';ctx.shadowBlur=20+surge*25;ctx.fillStyle='#0b070a';ctx.beginPath();ctx.ellipse(0,-18,48+18*t,72+25*t,0,0,TAU);ctx.fill();ctx.fillStyle='#d9d0ca';ctx.beginPath();ctx.ellipse(-17,-39,11,17,0,0,TAU);ctx.ellipse(17,-39,11,17,0,0,TAU);ctx.fill();ctx.fillStyle='#15060a';ctx.beginPath();ctx.arc(-17,-39,4+surge*2,0,TAU);ctx.arc(17,-39,4+surge*2,0,TAU);ctx.fill();ctx.strokeStyle='#e8ddd8';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-18,-5);ctx.quadraticCurveTo(0,22,18,-5);ctx.stroke();ctx.lineWidth=5;for(let i=-12;i<=12;i+=8){ctx.beginPath();ctx.moveTo(i,-1);ctx.lineTo(i,10);ctx.stroke();}ctx.strokeStyle='#171016';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-35,8);ctx.lineTo(-65,70);ctx.moveTo(35,8);ctx.lineTo(65,70);ctx.stroke();}ctx.restore();}
function drawMonster(m){if(!m.revealed){ctx.save();ctx.translate(m.x,m.y);ctx.fillStyle='#17141a';ctx.fillRect(-8,-30,16,27);ctx.fillRect(-13,-4,26,32);ctx.fillStyle='#d1c9c5';ctx.fillRect(-6,-35,12,10);ctx.fillStyle='#77727a';ctx.fillRect(-9,0,18,4);ctx.restore();return;}const s=m.scale;ctx.save();ctx.translate(m.x,m.y);ctx.scale(s,s);ctx.rotate(Math.sin(m.age*2+m.phase)*.05);ctx.shadowColor=state.biome>=5?'#e33a61':'#9c2748';ctx.shadowBlur=10+(m.type==='chase'?12:0);const v=m.variant;const lean=v%2?-0.08:0.08;ctx.fillStyle=v%3===0?'#b8aea9':'#817a7b';ctx.beginPath();ctx.ellipse(0,8,22+v*2,38+v*3,lean,0,TAU);ctx.fill();ctx.fillStyle='#d4cbc5';ctx.beginPath();ctx.ellipse(0,-26,24+(v%3)*4,31+(v%2)*8,lean,0,TAU);ctx.fill();ctx.fillStyle='#120a0e';if(v%4===0){ctx.beginPath();ctx.arc(-9,-30,5,0,TAU);ctx.arc(9,-30,5,0,TAU);ctx.fill();}else if(v%4===1){ctx.fillRect(-15,-34,10,5);ctx.fillRect(5,-34,10,5);}else{ctx.beginPath();ctx.ellipse(0,-29,5,15,0,0,TAU);ctx.fill();}ctx.strokeStyle='#16090e';ctx.lineWidth=3;ctx.beginPath();if(v%3===0)ctx.arc(0,-15,11,0,Math.PI);else{ctx.moveTo(-10,-12);ctx.quadraticCurveTo(0,2,10,-12);}ctx.stroke();const limb=45+(v%5)*10;ctx.lineWidth=5;ctx.strokeStyle='#665e60';ctx.beginPath();ctx.moveTo(-16,22);ctx.lineTo(-limb,70+(v%4)*8);ctx.moveTo(16,22);ctx.lineTo(limb,70+(v%3)*12);ctx.stroke();if(v===2||m.name==='The Long Arms'){ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-20,8);ctx.lineTo(-55,55);ctx.moveTo(20,8);ctx.lineTo(55,55);ctx.stroke();}if(v===4||m.name==='The Mouth'){ctx.fillStyle='#f0e9e2';ctx.beginPath();ctx.ellipse(0,-7,15,10,0,0,TAU);ctx.fill();ctx.fillStyle='#191014';ctx.fillRect(-11,-10,22,6);}ctx.restore();}
function drawParticles(){state.particles.forEach(p=>{ctx.save();ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.kind==='boost'?'#8feeff':'#c4a9aa';ctx.fillRect(p.x,p.y,3,3);ctx.restore();});}
function draw(){if(!state)return;ctx.save();const tremor=state.reduceMotion?0:(state.shake*7+state.redFlash*2);if(tremor)ctx.translate(rand(-tremor,tremor),rand(-tremor,tremor));drawBackground();drawRoad();drawBoosts();state.monsters.forEach(drawMonster);drawMainWoman();drawPixelBike();drawParticles();const red=smoothstep(0,1500,state.distance);if(red>.02){ctx.fillStyle=`rgba(185,22,52,${red*.18})`;ctx.fillRect(0,0,W,H);ctx.strokeStyle=`rgba(255,50,75,${red*.16})`;ctx.lineWidth=18;ctx.strokeRect(0,0,W,H);}if(state.redFlash>0){ctx.fillStyle=`rgba(255,30,55,${state.redFlash*.28})`;ctx.fillRect(0,0,W,H);}ctx.restore();}
function end(title='THE ROAD CAUGHT YOU'){if(!state.running)return;state.running=false;const score=Math.floor(state.distance);best=Math.max(best,score);localStorage[bestKey]=best;bestNode.textContent=`${best}m`;message.textContent=title;submessage.textContent=`You made it ${score} meters. The deeper world is still there.`;start.textContent='DRIVE AGAIN';overlay.classList.remove('hidden');cancelAnimationFrame(raf);draw();}
function tick(now){if(!state.running)return;const dt=Math.min(.05,(now-last)/1000);last=now;update(dt);draw();raf=requestAnimationFrame(tick);}
function startGame(){state=freshState();state.running=true;state.reduceMotion=motionToggle.checked;overlay.classList.add('hidden');last=performance.now();if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();raf=requestAnimationFrame(tick);beep(180,.1,'triangle',.025);}
start.addEventListener('click',startGame);doorLeft.addEventListener('click',()=>chooseDoor(doorLeft.textContent));doorRight.addEventListener('click',()=>chooseDoor(doorRight.textContent));
addEventListener('keydown',e=>{keys[e.key]=true;if(['ArrowLeft','ArrowRight',' ','a','d','A','D'].includes(e.key))e.preventDefault();if(e.key===' '||e.key==='Shift')useBoost();});
addEventListener('keyup',e=>{keys[e.key]=false;});
canvas.addEventListener('pointerdown',e=>{if(!state.running||state.memory)return;canvas.setPointerCapture?.(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!state.running||state.memory||state.paused)return;const r=canvas.getBoundingClientRect();state.x=clamp((e.clientX-r.left)*W/r.width,18,W-18);});
reset();draw();
