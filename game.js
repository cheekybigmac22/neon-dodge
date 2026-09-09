const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const start = document.querySelector('#start');
const message = document.querySelector('#message');
const submessage = document.querySelector('#submessage');
const distanceNode = document.querySelector('#distance');
const bestNode = document.querySelector('#best');
const motionToggle = document.querySelector('#reduce-motion');
const W = canvas.width, H = canvas.height;
let car, hazards, ghosts, roadMarks, distance, best, last, running, keys, spawn, slip, corruption, shake, reduceMotion;

best = Number(localStorage.afterimageBest || 0);
bestNode.textContent = `${best}m`;

function reset() {
  car = { x: W / 2, y: H - 108, ghostX: W / 2 };
  hazards = []; ghosts = []; roadMarks = Array.from({ length: 18 }, (_, i) => i * 48 - 20);
  distance = 0; spawn = .8; slip = 0; corruption = 0; shake = 0; keys = {}; last = performance.now();
  distanceNode.textContent = '0m';
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function rand(min, max) { return min + Math.random() * (max - min); }
function glow(color, amount = 12) { ctx.shadowColor = color; ctx.shadowBlur = amount; }
function titleForDistance() { return distance < 180 ? 'THE ROAD IS BREATHING' : distance < 500 ? 'IT LEARNED YOUR NAME' : 'YOU DROVE TOO FAR'; }
function addHazard() {
  const tier = Math.min(3, Math.floor(distance / 240));
  const type = tier === 0 ? 'sign' : tier === 1 ? (Math.random() < .54 ? 'sign' : 'watcher') : tier === 2 ? (Math.random() < .4 ? 'mirror' : Math.random() < .6 ? 'watcher' : 'sign') : ['sign','watcher','mirror','fold'][Math.floor(Math.random() * 4)];
  hazards.push({ type, x: type === 'fold' ? W / 2 : rand(72, W - 72), y: -55, r: type === 'fold' ? 85 : type === 'watcher' ? 19 : 16, speed: 215 + distance * .22 + rand(-20, 45), pulse: Math.random() * 7 });
}
function addGhost() { ghosts.push({ x: car.x, y: car.y, life: 1.1, max: 1.1 }); if (ghosts.length > 18) ghosts.shift(); }
function update(dt) {
  const speed = 215 + distance * .19;
  const move = ((keys.ArrowRight || keys.d) ? 1 : 0) - ((keys.ArrowLeft || keys.a) ? 1 : 0);
  car.x = clamp(car.x + move * (250 + corruption * 15) * dt, 54, W - 54);
  car.ghostX += (car.x - car.ghostX) * dt * 2.3;
  roadMarks = roadMarks.map(y => y + speed * dt > H + 30 ? -30 : y + speed * dt);
  distance += dt * (10 + corruption * .75); corruption = Math.min(10, distance / 100);
  spawn -= dt; if (spawn <= 0) { addHazard(); spawn = Math.max(.26, .78 - corruption * .048 + Math.random() * .14); }
  hazards.forEach(h => { h.y += h.speed * dt; h.pulse += dt * 4; }); hazards = hazards.filter(h => h.y < H + 120);
  ghosts.forEach(g => g.life -= dt); ghosts = ghosts.filter(g => g.life > 0);
  if (!reduceMotion && Math.random() < dt * (.12 + corruption * .08)) slip = Math.max(slip, .12 + Math.random() * .2);
  slip = Math.max(0, slip - dt); if (Math.random() < dt * 16) addGhost();
  const hit = hazards.some(h => h.type === 'fold' ? Math.abs(h.y - car.y) < 19 && Math.abs(car.x - W / 2) > 55 : Math.hypot(h.x - car.x, h.y - car.y) < h.r + 16);
  if (hit) end(); shake = Math.max(0, shake - dt * 2.5); distanceNode.textContent = `${Math.floor(distance)}m`;
}
function drawRoad() {
  const c = corruption / 10;
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, `rgb(${10 + c * 24},${10 - c * 4},${18 + c * 8})`); bg.addColorStop(1, `rgb(${20 + c * 12},8,${17 + c * 3})`); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const bend = Math.sin(distance * .022) * c * 13;
  ctx.fillStyle = '#09090d'; ctx.beginPath(); ctx.moveTo(85 + bend, 0); ctx.lineTo(W - 85 + bend, 0); ctx.lineTo(W - 30, H); ctx.lineTo(30, H); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(${110 + c * 90},25,${58 + c * 35},.8)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(85 + bend, 0); ctx.lineTo(30, H); ctx.moveTo(W - 85 + bend, 0); ctx.lineTo(W - 30, H); ctx.stroke();
  ctx.save(); ctx.globalAlpha = .45 + c * .15; ctx.strokeStyle = '#625d69'; ctx.lineWidth = 2; roadMarks.forEach(y => { const width = 9 + y / H * 12; ctx.beginPath(); ctx.moveTo(W / 2 - width / 2, y); ctx.lineTo(W / 2 + width / 2, y); ctx.stroke(); }); ctx.restore();
  if (corruption > 2) { ctx.save(); ctx.globalAlpha = Math.min(.25, c * .18); ctx.strokeStyle = '#c32b50'; for (let x = 0; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(W / 2 + (x - W / 2) * .4, H); ctx.stroke(); } ctx.restore(); }
}
function drawWatcher() {
  const chase = Math.min(1, distance / 1050), y = H + 95 - chase * 170 + Math.sin(distance * .06) * 8;
  ctx.save(); ctx.globalAlpha = .22 + chase * .55; glow('#b91743', 28); ctx.fillStyle = '#080509'; ctx.beginPath(); ctx.ellipse(W / 2, y, 104, 138, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#d7d0c9'; ctx.beginPath(); ctx.ellipse(W / 2 - 33, y - 16, 16, 7, 0, 0, Math.PI * 2); ctx.ellipse(W / 2 + 33, y - 16, 16, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#21040c'; ctx.beginPath(); ctx.arc(W / 2 - 33, y - 16, 4, 0, Math.PI * 2); ctx.arc(W / 2 + 33, y - 16, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function drawHazard(h) {
  ctx.save(); ctx.translate(h.x, h.y); glow(h.type === 'watcher' ? '#bb1d45' : '#6b617a', h.type === 'watcher' ? 17 : 8);
  if (h.type === 'sign') { ctx.fillStyle = '#2c2632'; ctx.fillRect(-14, -22, 28, 30); ctx.fillStyle = '#aa2748'; ctx.fillRect(-10, -18, 20, 11); ctx.fillStyle = '#e0d4d5'; ctx.font = '8px DM Mono'; ctx.textAlign = 'center'; ctx.fillText('TURN', 0, -10); ctx.fillStyle = '#1c1720'; ctx.fillRect(-3, 8, 6, 26); }
  if (h.type === 'watcher') { ctx.fillStyle = '#130b13'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 27, Math.sin(h.pulse) * .1, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#eee1df'; ctx.beginPath(); ctx.ellipse(-7, -4, 7, 3, 0, 0, Math.PI * 2); ctx.ellipse(7, -4, 7, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#9e1d40'; ctx.beginPath(); ctx.arc(-7, -4, 2, 0, 7); ctx.arc(7, -4, 2, 0, 7); ctx.fill(); }
  if (h.type === 'mirror') { ctx.rotate(Math.sin(h.pulse) * .25); ctx.strokeStyle = '#b8b1d2'; ctx.lineWidth = 4; ctx.strokeRect(-13, -26, 26, 52); ctx.strokeStyle = '#3e3752'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 19); ctx.lineTo(6, -18); ctx.moveTo(-4, -22); ctx.lineTo(10, 5); ctx.stroke(); }
  if (h.type === 'fold') { ctx.strokeStyle = '#ba2d51'; ctx.lineWidth = 3; for (let i = -2; i <= 2; i++) { ctx.globalAlpha = .4 + Math.abs(i) * .1; ctx.beginPath(); ctx.moveTo(i * 32, -38); ctx.lineTo(i * 22, 38); ctx.stroke(); } ctx.globalAlpha = .8; ctx.fillStyle = '#180a17'; ctx.fillRect(-88, -7, 176, 14); }
  ctx.restore();
}
function drawCar() { ctx.save(); ctx.translate(car.x, car.y); glow('#d3cbdc', 15); ctx.fillStyle = '#dad2da'; ctx.beginPath(); ctx.moveTo(0, -27); ctx.lineTo(13, -8); ctx.lineTo(12, 23); ctx.lineTo(-12, 23); ctx.lineTo(-13, -8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#321025'; ctx.fillRect(-7, -7, 14, 18); ctx.fillStyle = '#ad264a'; ctx.fillRect(-10, 17, 5, 8); ctx.fillRect(5, 17, 5, 8); ctx.restore(); }
function draw() {
  ctx.save(); const tremor = reduceMotion ? 0 : (slip > 0 ? 3 : shake * 5); if (tremor) ctx.translate(rand(-tremor, tremor), rand(-tremor, tremor)); drawRoad(); drawWatcher();
  ghosts.forEach(g => { ctx.save(); ctx.globalAlpha = .09 + (g.life / g.max) * .15; ctx.strokeStyle = '#b54768'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y, 23 + (1 - g.life / g.max) * 15, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); });
  hazards.forEach(drawHazard); drawCar();
  if (slip > 0) { ctx.fillStyle = `rgba(190,35,73,${slip * .38})`; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = .5; ctx.fillStyle = '#e5dde8'; ctx.font = '11px DM Mono'; ctx.textAlign = 'center'; ctx.fillText('TIME SLIP', W / 2, 66); }
  if (!reduceMotion && corruption > 4) { ctx.globalAlpha = .12; ctx.fillStyle = '#e93f6c'; for (let y = 90; y < H; y += 32) ctx.fillRect(rand(0, W * .65), y, rand(20, 110), 2); } ctx.restore();
}
function end() { if (!running) return; running = false; shake = 1; best = Math.max(best, Math.floor(distance)); localStorage.afterimageBest = best; bestNode.textContent = `${best}m`; message.textContent = titleForDistance(); submessage.textContent = `You survived ${Math.floor(distance)} meters. The road is still waiting.`; start.textContent = 'DRIVE AGAIN'; overlay.classList.remove('hidden'); }
function tick(now) { if (!running) return; const dt = Math.min(.05, (now - last) / 1000); last = now; update(dt); draw(); if (running) requestAnimationFrame(tick); }
start.addEventListener('click', () => { reduceMotion = motionToggle.checked; reset(); overlay.classList.add('hidden'); running = true; requestAnimationFrame(tick); });
addEventListener('keydown', e => { keys[e.key] = true; if (['ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); });
addEventListener('keyup', e => { keys[e.key] = false; });
canvas.addEventListener('pointermove', e => { if (!running) return; const r = canvas.getBoundingClientRect(); car.x = clamp((e.clientX - r.left) * W / r.width, 54, W - 54); });
reset(); draw();
