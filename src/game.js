import { 
  soundEnabled, toggleSound, playSound, initAudio, updateCrowdAmbiance 
} from './audio.js';

import {
  parts, spawnGoalParticles, spawnTouchParticles, spawnPowerupParticles,
  spawnSprintParticles, spawnFrostParticles, spawnSlideParticles,
  updateParticles, drawParticles, clearParticles
} from './particles.js';

import {
  keys, mouse, setupInput, updateWorldCoords, drawAimIndicator
} from './input.js';

import {
  d, cl, lr, a2, rand, TEAMS, POWERUP_TYPES, makePlayer,
  updateFormations, updateBall, updateAIPlayer, updateGoalies,
  checkSlideTackles, updateTornado
} from './physics.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 950, H = 700;

// DOM elements
const scoreYouEl = document.getElementById('score-you');
const scoreAiEl = document.getElementById('score-ai');
const timerEl = document.getElementById('timer');
const powerMeter = document.getElementById('power-meter-container');
const powerFill = document.getElementById('power-meter-fill');
const overlay = document.getElementById('overlay-screen');
const btnStart = document.getElementById('btn-start');
const comboEl = document.getElementById('combo-display');
const comboCountEl = document.getElementById('combo-count');
const soundToggle = document.getElementById('sound-toggle');
const selectTeamYou = document.getElementById('select-team-you');
const selectTeamAi = document.getElementById('select-team-ai');
const selectDifficulty = document.getElementById('select-difficulty');
const selectFormation = document.getElementById('select-formation');
const badgeYou = document.getElementById('badge-you');
const badgeAi = document.getElementById('badge-ai');

// Pitch layout limits
const F = {
  l: 60, r: W - 60, t: 70, b: H - 70,
  cx: W / 2, cy: H / 2,
  gT: { l: W / 2 - 65, r: W / 2 + 65, y: 70 },
  gB: { l: W / 2 - 65, r: W / 2 + 65, y: H - 70 }
};

// Game State
const S = {
  phase: 'menu',
  sYou: 0, sAi: 0,
  time: 120,
  half: 1,
  goalTimer: 0,
  goalBy: null,
  shake: 0,
  shakeI: 0,
  netBulgeTop: 0,
  netBulgeBottom: 0,
  combo: 0,
  comboTimer: 0,
  difficulty: 'medium',
  formation: 'balanced',
  teamYou: 'FRA',
  teamAi: 'ARG'
};

// Camera Config
const camera = {
  x: W / 2,
  y: H / 2,
  zoom: 1.0,
  targetX: W / 2,
  targetY: H / 2,
  targetZoom: 1.0
};

// Replay buffer
const replayBuffer = [];
let isReplaying = false;
let replayFrameIndex = 0;
let replayTimer = 0;

// Tornado Wind Hazard
const tornado = {
  x: W / 2,
  y: H / 2,
  pulse: 0,
  r: 40
};

// Entities
const ball = {
  x: W/2, y: H/2, z: 0,
  vx: 0, vy: 0, vz: 0,
  r: 8, trail: [], spin: 0,
  rotX: 0, rotY: 0
};

const you = makePlayer(W/2, H - 160, 'you', true, 7);
const youMates = [
  makePlayer(W/2 - 140, H - 200, 'you', false, 10),
  makePlayer(W/2 + 140, H - 200, 'you', false, 11)
];

const aiTeam = [
  makePlayer(W/2, 160, 'ai', false, 9),
  makePlayer(W/2 - 130, 220, 'ai', false, 8),
  makePlayer(W/2 + 130, 220, 'ai', false, 4)
];

const aiG = { x: W/2, y: F.gT.y + 28, r: 12, spd: 240, tx: W/2, team: 'ai' };
const youG = { x: W/2, y: F.gB.y - 28, r: 12, spd: 240, tx: W/2, team: 'you' };

let powerups = [];

function allOutfield() { 
  return [you, ...youMates, ...aiTeam]; 
}

// ─── Setup Input ──────────────────────────────────────────
setupInput(canvas, camera);

// ─── Power-ups ────────────────────────────────────────────
function spawnPowerup() {
  if (powerups.length >= 2) return;
  const types = Object.keys(POWERUP_TYPES);
  const type = types[~~(rand(0, types.length))];
  powerups.push({
    x: rand(F.l + 80, F.r - 80),
    y: rand(F.t + 100, F.b - 100),
    type,
    pulse: 0
  });
}

function updatePowerups(dt) {
  for (let i = powerups.length - 1; i >= 0; i--) {
    const p = powerups[i];
    p.pulse += dt * 5;

    // Check player collision
    if (d(you, p) < you.r + 16 && you.staggerTimer <= 0) {
      applyPowerup(you, p.type);
      powerups.splice(i, 1);
      continue;
    }

    // Check mates collision
    let hit = false;
    for (const mate of youMates) {
      if (d(mate, p) < mate.r + 16 && mate.staggerTimer <= 0) {
        applyPowerup(mate, p.type);
        hit = true;
        break;
      }
    }
    if (hit) {
      powerups.splice(i, 1);
      continue;
    }

    // Check AI team collision
    for (const ap of aiTeam) {
      if (d(ap, p) < ap.r + 16 && ap.staggerTimer <= 0) {
        applyPowerup(ap, p.type);
        hit = true;
        break;
      }
    }
    if (hit) {
      powerups.splice(i, 1);
    }
  }
}

function applyPowerup(entity, type) {
  entity.powerupType = type;
  entity.powerupTimer = 7.0; // 7 seconds duration
  playSound('powerup');
  spawnPowerupParticles(entity.x, entity.y, POWERUP_TYPES[type].color);
}

// ─── Camera Logic ──────────────────────────────────────────
function updateCamera(dt) {
  // Focus target is midpoint between active human player and the ball
  camera.targetX = (you.x + ball.x) / 2;
  camera.targetY = (you.y + ball.y) / 2;

  // Zoom in if near either goal box for cinematic closeness, zoom out when in midfield
  const distGoal = Math.min(Math.abs(ball.y - F.t), Math.abs(ball.y - F.b));
  camera.targetZoom = distGoal < 240 ? 1.25 : 1.0;

  // Apply smooth interpolation
  camera.x = lr(camera.x, camera.targetX, 4 * dt);
  camera.y = lr(camera.y, camera.targetY, 4 * dt);
  camera.zoom = lr(camera.zoom, camera.targetZoom, 2 * dt);

  // Clamp camera center so we don't show black boundaries
  const halfW = (W / 2) / camera.zoom;
  const halfH = (H / 2) / camera.zoom;

  camera.x = cl(camera.x, halfW, W - halfW);
  camera.y = cl(camera.y, halfH, H - halfH);
  
  // Re-sync mouse world coords after camera moves
  updateWorldCoords(canvas, camera);
}

// ─── Replay Recorder ───────────────────────────────────────
function recordFrame() {
  const frame = {
    ball: { x: ball.x, y: ball.y, z: ball.z, spin: ball.spin, rotX: ball.rotX, rotY: ball.rotY, trail: [...ball.trail] },
    players: allOutfield().map(p => ({
      x: p.x, y: p.y, fx: p.fx, fy: p.fy, number: p.number, team: p.team, isHuman: p.isHuman,
      slideTimer: p.slideTimer, staggerTimer: p.staggerTimer, powerupType: p.powerupType
    })),
    goalies: {
      ai: { x: aiG.x, y: aiG.y },
      you: { x: youG.x, y: youG.y }
    },
    netBulgeTop: S.netBulgeTop,
    netBulgeBottom: S.netBulgeBottom
  };

  replayBuffer.push(frame);
  if (replayBuffer.length > 150) {
    replayBuffer.shift();
  }
}

// ─── Outfield Human Update ─────────────────────────────────
function updateYou(dt) {
  if (you.staggerTimer > 0) {
    you.staggerTimer -= dt;
    you.vx *= (1 - 5 * dt);
    you.vy *= (1 - 5 * dt);
    you.x += you.vx * dt;
    you.y += you.vy * dt;
    you.x = cl(you.x, F.l + you.r, F.r - you.r);
    you.y = cl(you.y, F.t + 80, F.b - you.r);
    return;
  }

  // Slide Tackle trigger
  if (keys['KeyF'] && you.slideTimer <= 0) {
    you.slideTimer = 0.5; // 0.5 second slide duration
    playSound('kick');
    spawnSlideParticles(you.x, you.y);
  }

  // Teammate pass commands
  if (keys['KeyQ']) {
    // Request pass from nearest teammate
    const nearestMate = youMates.reduce((prev, curr) => {
      return d(curr, ball) < d(prev, ball) ? curr : prev;
    });
    
    // Direct ball towards player
    if (d(nearestMate, ball) < nearestMate.r + ball.r + 15) {
      const ang = a2(ball, you);
      ball.vx = Math.cos(ang) * 340;
      ball.vy = Math.sin(ang) * 340;
      playSound('kick');
    }
  }

  // Slide tackle update
  if (you.slideTimer > 0) {
    you.slideTimer -= dt;
    // Boost player forward in face direction during slide
    const slideSpd = 450;
    you.vx = you.fx * slideSpd;
    you.vy = you.fy * slideSpd;
    you.x += you.vx * dt;
    you.y += you.vy * dt;
    you.x = cl(you.x, F.l + you.r, F.r - you.r);
    you.y = cl(you.y, F.t + 80, F.b - you.r);
    spawnSlideParticles(you.x, you.y);

    // Slide tackle collision check
    for (const opp of aiTeam) {
      if (opp.staggerTimer <= 0 && d(you, opp) < you.r + opp.r + 6) {
        opp.staggerTimer = 1.2;
        const ang = a2(you, opp);
        opp.vx = Math.cos(ang) * 380;
        opp.vy = Math.sin(ang) * 380;
        playSound('tackle');
      }
    }
    return;
  }

  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp']) dy = -1;
  if (keys['KeyS'] || keys['ArrowDown']) dy = 1;
  if (keys['KeyA'] || keys['ArrowLeft']) dx = -1;
  if (keys['KeyD'] || keys['ArrowRight']) dx = 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    you.fx = dx; you.fy = dy;
    you.animTimer += dt;
    if (you.animTimer > 0.1) { 
      you.animFrame = (you.animFrame + 1) % 4; 
      you.animTimer = 0; 
    }
  } else {
    you.animFrame = 0;
  }

  if (you.powerupTimer > 0) {
    you.powerupTimer -= dt;
    if (you.powerupTimer <= 0) you.powerupType = null;
  }

  const sprinting = keys['ShiftLeft'] || keys['ShiftRight'];
  let currentSpd = you.spd;
  
  // Brazil team speed stats boost
  if (S.teamYou === 'BRA') currentSpd *= 1.15;
  if (you.powerupType === 'speed') currentSpd *= 1.4;

  const spd = sprinting && you.sprintMeter > 0 ? you.sprintSpd : currentSpd;
  if (sprinting && you.sprintMeter > 0) {
    you.sprintMeter = Math.max(0, you.sprintMeter - 35 * dt);
    spawnSprintParticles(you.x, you.y + you.r);
  } else {
    you.sprintMeter = Math.min(100, you.sprintMeter + 18 * dt);
  }

  you.vx = dx * spd;
  you.vy = dy * spd;
  you.x += you.vx * dt;
  you.y += you.vy * dt;
  
  you.x = cl(you.x, F.l + you.r, F.r - you.r);
  you.y = cl(you.y, F.t + 80, F.b - you.r);

  // Magnet powerup pull for human
  if (you.powerupType === 'magnet' && d(you, ball) < 180 && ball.z < 25) {
    const pullAngle = a2(ball, you);
    const pullForce = 220 * dt;
    ball.vx += Math.cos(pullAngle) * pullForce;
    ball.vy += Math.sin(pullAngle) * pullForce;
  }

  // Shield protection push away
  if (you.powerupType === 'shield') {
    for (const opp of aiTeam) {
      if (opp.staggerTimer <= 0 && d(you, opp) < you.r + opp.r + 4) {
        const pushAngle = a2(you, opp);
        opp.vx = Math.cos(pushAngle) * 450;
        opp.vy = Math.sin(pushAngle) * 450;
        opp.staggerTimer = 1.0;
        playSound('tackle');
      }
    }
  }

  // Kick charging
  const startKick = mouse.pressed || keys['Space'];
  if (startKick && !you.charging) {
    you.charging = true;
    you.charge = 0;
  }

  if (you.charging) {
    if (startKick) {
      you.charge = Math.min(you.charge + dt * 2.2, 1);
      powerMeter.classList.add('visible');
      powerFill.style.width = (you.charge * 100) + '%';
    } else {
      if (you.charge > 0.05) {
        // Germany strength shot stats boost
        let powerMult = 1.0;
        if (S.teamYou === 'GER') powerMult = 1.18;

        let sp = (220 + you.charge * 520) * powerMult;
        if (you.powerupType === 'supershot') sp *= 1.35;

        // France precision shot accuracy
        let deviation = 0.5;
        if (S.teamYou === 'FRA') deviation = 0.15;

        // Aim towards mouse if mouse is active, otherwise face direction
        let shootX = you.fx;
        let shootY = you.fy;
        if (mouse.active) {
          const aimAng = a2(you, mouse);
          shootX = Math.cos(aimAng);
          shootY = Math.sin(aimAng);
        }

        ball.vx = shootX * sp + (Math.random() - 0.5) * 40 * deviation;
        ball.vy = shootY * sp + (Math.random() - 0.5) * 40 * deviation;
        ball.spin = (Math.random() - 0.5) * 320;
        
        playSound('kick');
        S.shake = 0.25; 
        S.shakeI = 5;
        spawnTouchParticles(ball.x, ball.y, you.powerupType === 'supershot' ? '#f97316' : '#fff', 12);
      }
      you.charging = false;
      you.charge = 0;
      powerMeter.classList.remove('visible');
    }
  }

  // Dribble & normal contact collision
  const distToBall = d(you, ball);
  if (distToBall < you.r + ball.r + 4 && ball.z < 20) {
    const ang = a2(you, ball);
    ball.vx += Math.cos(ang) * 120 * dt;
    ball.vy += Math.sin(ang) * 120 * dt;
    if (distToBall < you.r + ball.r + 2) {
      if (Math.abs(you.vx) > 10 || Math.abs(you.vy) > 10) {
        ball.vx += you.fx * 70 * dt;
        ball.vy += you.fy * 70 * dt;
      }
    }
  }
}

// Chip shots
function handleChipShot() {
  if (you.staggerTimer > 0 || you.slideTimer > 0) return;
  const distToBall = d(you, ball);
  if (distToBall < you.r + ball.r + 15 && ball.z < 15) {
    const sp = 250;
    let aimX = you.fx;
    let aimY = you.fy;
    if (mouse.active) {
      const aimAng = a2(you, mouse);
      aimX = Math.cos(aimAng);
      aimY = Math.sin(aimAng);
    }
    ball.vx = aimX * sp;
    ball.vy = aimY * sp;
    ball.vz = 190; // vertical lift
    ball.spin = (Math.random() - 0.5) * 120;
    playSound('chip');
    spawnTouchParticles(ball.x, ball.y, '#38bdf8', 8);
  }
}

window.addEventListener('keydown', e => {
  if (e.code === 'KeyE' && S.phase === 'playing') {
    handleChipShot();
  }
});

// Trigger chip shot via right click as well
canvas.addEventListener('mousedown', e => {
  if (e.button === 2 && S.phase === 'playing') {
    handleChipShot();
  }
});

// ─── Goal / Reset Pos ──────────────────────────────────────
function goal(by) {
  S.goalBy = by;
  S.goalTimer = 4.5; // Longer timer to fit the slow-motion replay!
  S.shake = 0.8;
  S.shakeI = 18;
  spawnGoalParticles(ball.x, ball.y, F, W);
  playSound('goal');

  if (by === 'you') {
    S.sYou++;
    scoreYouEl.textContent = S.sYou;
    S.combo++;
    comboEl.classList.add('visible');
    comboCountEl.textContent = S.combo;
    S.comboTimer = 4;
  } else {
    S.sAi++;
    scoreAiEl.textContent = S.sAi;
    S.combo = 0;
    comboEl.classList.remove('visible');
  }

  isReplaying = true;
  replayFrameIndex = 0;
  replayTimer = 0.0;
  S.phase = 'goal';
}

function resetPos() {
  ball.x = W/2; ball.y = H/2; ball.z = 0; ball.vx = 0; ball.vy = 0; ball.vz = 0; ball.trail = []; ball.spin = 0;
  
  // Re-sync formations home coordinate configs
  updateFormations(youMates, aiTeam, S.formation, W, H);

  for (const p of allOutfield()) {
    p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0;
    p.charge = 0; p.charging = false;
    p.powerupType = null; p.powerupTimer = 0;
    p.slideTimer = 0; p.staggerTimer = 0;
    p.state = 'defend'; p.stateTimer = 0;
  }
  
  aiG.x = W/2; aiG.tx = W/2;
  youG.x = W/2; youG.tx = W/2;
  S.netBulgeTop = 0; S.netBulgeBottom = 0;
  powerups = [];
  replayBuffer.length = 0;
  isReplaying = false;
}

// ─── Drawing ──────────────────────────────────────────────
function drawField() {
  // Field pitch grass texture
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#115e59'); // dark teal green
  grad.addColorStop(0.5, '#134e4a');
  grad.addColorStop(1, '#115e59');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Striped grass bands
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
    ctx.fillRect(F.l, F.t + i * ((F.b - F.t) / 14), F.r - F.l, (F.b - F.t) / 14);
  }

  // Borders & Crowd Spectator stands
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, W, F.t);
  ctx.fillRect(0, F.b, W, H - F.b);
  ctx.fillRect(0, 0, F.l, H);
  ctx.fillRect(F.r, 0, W - F.r, H);

  // Stadium spectators
  for (let x = 30; x < W; x += 22) {
    const topBob = Math.sin(Date.now() / 150 + x) * 2.2;
    ctx.beginPath();
    ctx.arc(x, F.t - 15 + topBob, 4, 0, Math.PI * 2);
    ctx.fillStyle = ['#f43f5e','#3b82f6','#eab308','#a855f7','#10b981','#ffffff'][~~((x * 7) % 6)];
    ctx.fill();

    const botBob = Math.cos(Date.now() / 150 + x) * 2.2;
    ctx.beginPath();
    ctx.arc(x, F.b + 15 + botBob, 4, 0, Math.PI * 2);
    ctx.fillStyle = ['#f43f5e','#3b82f6','#eab308','#a855f7','#10b981','#ffffff'][~~((x * 3) % 6)];
    ctx.fill();
  }

  // Pitch chalk outlines
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.strokeRect(F.l, F.t, F.r - F.l, F.b - F.t);

  // Midfield line
  ctx.beginPath();
  ctx.moveTo(F.l, F.cy);
  ctx.lineTo(F.r, F.cy);
  ctx.stroke();

  // Midfield circle
  ctx.beginPath();
  ctx.arc(F.cx, F.cy, 65, 0, Math.PI * 2);
  ctx.stroke();

  // Midfield dot
  ctx.beginPath();
  ctx.arc(F.cx, F.cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fill();

  // Penalty areas
  ctx.strokeRect(F.gT.l - 85, F.t, 280, 80);
  ctx.strokeRect(F.gB.l - 85, F.b - 80, 280, 80);

  // Goal area boxes
  ctx.strokeRect(F.gT.l - 40, F.t, 190, 35);
  ctx.strokeRect(F.gB.l - 40, F.b - 35, 190, 35);

  // Goals Netting
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  
  // Top Goal (AI)
  ctx.beginPath();
  ctx.moveTo(F.gT.l, F.t);
  ctx.lineTo(F.gT.l, F.t - 15 - S.netBulgeTop);
  ctx.lineTo(F.gT.r, F.t - 15 - S.netBulgeTop);
  ctx.lineTo(F.gT.r, F.t);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 13; i++) {
    const x = F.gT.l + i * 10;
    ctx.beginPath();
    ctx.moveTo(x, F.t);
    const bulgeFactor = 1 - Math.abs(x - F.cx) / 65;
    const currentBulge = Math.max(0, S.netBulgeTop * bulgeFactor);
    ctx.lineTo(x, F.t - 15 - currentBulge);
    ctx.stroke();
  }
  for (let j = 1; j <= 3; j++) {
    ctx.beginPath();
    ctx.moveTo(F.gT.l, F.t - j * 4);
    ctx.quadraticCurveTo(F.cx, F.t - j * 4 - S.netBulgeTop, F.gT.r, F.t - j * 4);
    ctx.stroke();
  }

  // Bottom Goal (Player)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(F.gB.l, F.b);
  ctx.lineTo(F.gB.l, F.b + 15 + S.netBulgeBottom);
  ctx.lineTo(F.gB.r, F.b + 15 + S.netBulgeBottom);
  ctx.lineTo(F.gB.r, F.b);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 13; i++) {
    const x = F.gB.l + i * 10;
    ctx.beginPath();
    ctx.moveTo(x, F.b);
    const bulgeFactor = 1 - Math.abs(x - F.cx) / 65;
    const currentBulge = Math.max(0, S.netBulgeBottom * bulgeFactor);
    ctx.lineTo(x, F.b + 15 + currentBulge);
    ctx.stroke();
  }
  for (let j = 1; j <= 3; j++) {
    ctx.beginPath();
    ctx.moveTo(F.gB.l, F.b + j * 4);
    ctx.quadraticCurveTo(F.cx, F.b + j * 4 + S.netBulgeBottom, F.gB.r, F.b + j * 4);
    ctx.stroke();
  }
}

function drawPlayer(p) {
  const isHumanTeam = p.team === 'you';
  const team = TEAMS[isHumanTeam ? S.teamYou : S.teamAi];

  // Dynamic shadow
  ctx.beginPath();
  ctx.ellipse(p.x + 2, p.y + 6, p.r, p.r * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  // Run bobbing
  let bob = 0;
  if (Math.abs(p.vx) > 10 || Math.abs(p.vy) > 10) {
    bob = Math.sin(p.animFrame * Math.PI / 2) * 2.8;
  }

  // Slide tackle visual rotation
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  if (p.slideTimer > 0) {
    const slideAngle = Math.atan2(p.fy, p.fx);
    ctx.rotate(slideAngle + Math.PI / 2);
  }

  // Glow ring
  const frozen = !isHumanTeam && you.powerupType === 'freeze';
  if (frozen) {
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 18;
  } else {
    ctx.shadowColor = team.primary;
    ctx.shadowBlur = 12;
  }

  // Player body
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  
  const grad = ctx.createRadialGradient(-3, -3, 0, 0, 0, p.r);
  if (frozen) {
    grad.addColorStop(0, '#e0f7fa');
    grad.addColorStop(1, '#00acc1');
  } else {
    grad.addColorStop(0, team.secondary);
    grad.addColorStop(1, team.primary);
  }
  ctx.fillStyle = grad;
  ctx.fill();
  
  ctx.shadowBlur = 0;
  ctx.strokeStyle = team.primary;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Draw jersey stripes
  ctx.strokeStyle = team.secondary;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-p.r * 0.65, -p.r * 0.25);
  ctx.lineTo(p.r * 0.65, -p.r * 0.25);
  ctx.stroke();

  // Stunned/Staggered dizzy icon or Tactical Badge
  if (p.staggerTimer > 0) {
    ctx.fillStyle = '#facc15';
    ctx.font = '10px Arial';
    ctx.fillText('💫', 0, -p.r - 2);
  } else if (!p.isHuman && p.tacticalState) {
    // Tactical Role / State badge for AI players & teammates
    ctx.font = 'bold 8.5px sans-serif';
    let label = '';
    let badgeColor = '#94a3b8';
    if (p.tacticalState === 'press') {
      label = '🎯 PRESS';
      badgeColor = '#ef4444';
    } else if (p.tacticalState === 'support') {
      label = '▲ RUN';
      badgeColor = '#38bdf8';
    } else if (p.tacticalState === 'cover') {
      label = '🛡 COVER';
      badgeColor = '#eab308';
    }
    if (label) {
      const textW = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-textW/2 - 4, -p.r - 16, textW + 8, 11, 3) : ctx.fillRect(-textW/2 - 4, -p.r - 16, textW + 8, 11);
      ctx.fill();
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = badgeColor;
      ctx.fillText(label, 0, -p.r - 10);
    }
  } else if (p.isHuman) {
    ctx.font = 'bold 8.5px sans-serif';
    const label = '★ YOU';
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-textW/2 - 4, -p.r - 16, textW + 8, 11, 3) : ctx.fillRect(-textW/2 - 4, -p.r - 16, textW + 8, 11);
    ctx.fill();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.fillText(label, 0, -p.r - 10);
  }

  // Player number
  ctx.fillStyle = team.text;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center'; 
  ctx.textBaseline = 'middle';
  ctx.fillText(p.number, 0, 1);

  // Direction face arrow
  if (p.slideTimer <= 0) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(p.fx * (p.r + 6), p.fy * (p.r + 6));
    ctx.strokeStyle = isHumanTeam ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.8;
    ctx.stroke();
  }

  ctx.restore();

  // Powerup Glowing Auras
  if (p.powerupType) {
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.strokeStyle = POWERUP_TYPES[p.powerupType].color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Pulsing aura radius
    const auraRad = p.r + 5 + Math.sin(Date.now() / 100) * 2;
    ctx.arc(0, 0, auraRad, 0, Math.PI * 2);
    ctx.stroke();
    
    // Extra visual helper for Shield/Magnet
    if (p.powerupType === 'shield') {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
      ctx.fill();
    } else if (p.powerupType === 'magnet') {
      ctx.fillStyle = 'rgba(236, 72, 153, 0.12)';
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawGoalie(g, isHuman) {
  const team = TEAMS[isHuman ? S.teamYou : S.teamAi];

  ctx.beginPath();
  ctx.ellipse(g.x + 2, g.y + 5, g.r, g.r * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
  ctx.fillStyle = team.primary;
  ctx.fill();
  ctx.strokeStyle = team.secondary;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Gloves
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.arc(g.x - 6, g.y - 4, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(g.x + 6, g.y - 4, 4.5, 0, Math.PI * 2); ctx.fill();
}

function drawBall(ballData) {
  // Trail
  for (const t of ballData.trail) {
    ctx.beginPath();
    ctx.arc(t.x, t.y - t.z, ballData.r * t.life * (1 + t.z * 0.01), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${t.life * 0.28})`;
    ctx.fill();
  }

  // Shadow scales and fades with height
  const shadowScale = cl(1 - ballData.z * 0.005, 0.18, 1);
  ctx.beginPath();
  ctx.ellipse(ballData.x + 1 + ballData.z * 0.1, ballData.y + 5 + ballData.z * 0.1, ballData.r * shadowScale, ballData.r * 0.45 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0,0,0,${0.3 * shadowScale})`;
  ctx.fill();

  // Fast ball glow
  const speed = Math.hypot(ballData.vx, ballData.vy);
  if (speed > 220) {
    ctx.shadowColor = you.powerupType === 'supershot' ? '#f97316' : 'rgba(255,255,255,0.45)';
    ctx.shadowBlur = Math.min(28, speed / 12);
  }

  // Render ball scale based on height
  const renderR = ballData.r * (1 + ballData.z * 0.008);
  ctx.beginPath();
  ctx.arc(ballData.x, ballData.y - ballData.z, renderR, 0, Math.PI * 2);

  const bg = ctx.createRadialGradient(ballData.x - 2, ballData.y - 2 - ballData.z, 0, ballData.x, ballData.y - ballData.z, renderR);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.7, '#f3f4f6');
  bg.addColorStop(1, '#9ca3af');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draw Rotating Pentagons
  ctx.fillStyle = '#111827';
  const px = ballData.x;
  const py = ballData.y - ballData.z;
  const pentagons = [
    { dx: -2.2, dy: -2.2 },
    { dx: 3.2, dy: 2.2 },
    { dx: -3.2, dy: 3.2 },
    { dx: 3.2, dy: -3.2 }
  ];
  pentagons.forEach(p => {
    const rx = p.dx * Math.cos(ballData.rotX) - p.dy * Math.sin(ballData.rotY);
    const ry = p.dx * Math.sin(ballData.rotX) + p.dy * Math.cos(ballData.rotY);
    if (Math.hypot(rx, ry) < ballData.r - 1.2) {
      ctx.beginPath();
      ctx.arc(px + rx, py + ry, 1.8 * (1 + ballData.z * 0.008), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawPowerupsList() {
  for (const p of powerups) {
    const size = 13 + Math.sin(p.pulse) * 3;
    ctx.shadowColor = POWERUP_TYPES[p.type].color;
    ctx.shadowBlur = 18;
    
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fill();
    ctx.strokeStyle = POWERUP_TYPES[p.type].color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.fillText(POWERUP_TYPES[p.type].label, p.x, p.y);
  }
}

function drawTornado() {
  ctx.save();
  ctx.translate(tornado.x, tornado.y);
  
  // Rotating spinning wind visual helper
  const numRings = 4;
  for (let i = 0; i < numRings; i++) {
    const angle = (Date.now() / 200 + i * (Math.PI / 2)) % (Math.PI * 2);
    const size = tornado.r * (0.4 + 0.6 * (i / numRings));
    
    ctx.strokeStyle = `rgba(148, 163, 184, ${0.1 + 0.15 * (1 - i / numRings)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.4, angle, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw vortex center dust/leaves particles
  ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
  for (let i = 0; i < 8; i++) {
    const dist = rand(5, tornado.r);
    const angle = Date.now() / 300 + i;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist * 0.4, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSprintMeter() {
  if (you.sprintMeter < 100) {
    const x = 20, y = H - 35, w = 90, h = 8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 4) : ctx.fillRect(x, y, w, h);
    ctx.fill();

    const pct = you.sprintMeter / 100;
    ctx.fillStyle = pct > 0.3 ? '#3b82f6' : '#f43f5e';
    ctx.fillRect(x + 1, y + 1, (w - 2) * pct, h - 2);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left'; 
    ctx.textBaseline = 'bottom';
    ctx.fillText('SPRINT', x, y - 2);
  }
}

// ─── Main Game Loop ────────────────────────────────────────
let lastTime = 0;
let powerupSpawnTimer = 5.0;

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (S.phase === 'playing') {
    S.time -= dt;

    // Power-up Spawner
    powerupSpawnTimer -= dt;
    if (powerupSpawnTimer <= 0) {
      spawnPowerup();
      powerupSpawnTimer = rand(9, 15);
    }

    if (S.time <= 0) {
      S.time = 0;
      playSound('whistle');
      if (S.half === 1) {
        S.half = 2;
        S.time = 120;
        resetPos();
        overlay.classList.remove('hidden');
        overlay.querySelector('h1').textContent = '⚽ Second Half';
        overlay.querySelector('.sub').textContent = `${S.sYou} - ${S.sAi}`;
        overlay.querySelector('.btn').textContent = 'Continue';
        S.phase = 'halftime';
        return;
      } else {
        S.phase = 'fulltime';
        overlay.classList.remove('hidden');
        if (S.sYou > S.sAi) {
          overlay.querySelector('h1').textContent = '🏆 You Win!';
          overlay.querySelector('.sub').textContent = `Final Score: ${S.sYou} - ${S.sAi}`;
        } else if (S.sAi > S.sYou) {
          overlay.querySelector('h1').textContent = '😢 AI Wins';
          overlay.querySelector('.sub').textContent = `Final Score: ${S.sYou} - ${S.sAi}`;
        } else {
          overlay.querySelector('h1').textContent = '🤝 Draw!';
          overlay.querySelector('.sub').textContent = `${S.sYou} - ${S.sAi} · Golden Goal!`;
        }
        overlay.querySelector('.btn').textContent = 'Play Again';
        return;
      }
    }

    // Freeze particles on frozen AI
    if (you.powerupType === 'freeze') {
      aiTeam.forEach(ap => {
        if (Math.random() < 0.15) {
          spawnFrostParticles(ap.x, ap.y);
        }
      });
    }

    updateYou(dt);
    // Opponents update
    aiTeam.forEach(ap => {
      updateAIPlayer(ap, ball, you, aiTeam, youMates, S, F, W, H, dt, playSound, spawnTouchParticles);
    });
    // Teammates update
    youMates.forEach(mate => {
      updateAIPlayer(mate, ball, you, aiTeam, youMates, S, F, W, H, dt, playSound, spawnTouchParticles);
    });

    updateGoalies(aiG, youG, ball, F, dt, playSound, spawnTouchParticles);
    
    // slide tackles AI opponents check
    checkSlideTackles(allOutfield(), allOutfield(), playSound, spawnSlideParticles, dt);
    
    updateBall(ball, F, W, H, S, dt, playSound, spawnTouchParticles, goal);
    
    updateTornado(tornado, ball, allOutfield(), dt);
    
    updatePowerups(dt);
    updateParticles(dt);
    updateCrowdAmbiance(ball.y, H, F);

    // Camera follow update
    updateCamera(dt);

    // Record frame into replay ring buffer
    recordFrame();

    // Combo multiplier checks
    if (S.combo > 0) {
      S.comboTimer -= dt;
      if (S.comboTimer <= 0) {
        S.combo = 0;
        comboEl.classList.remove('visible');
      }
    }

    if (S.shake > 0) { 
      S.shake -= dt; 
      S.shakeI *= (1 - dt * 2.5); 
    }

    const m = Math.floor(S.time / 60);
    const s = Math.floor(S.time % 60);
    timerEl.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Goal phase with slow motion replay ───
  if (S.phase === 'goal') {
    S.goalTimer -= dt;
    updateParticles(dt);
    if (S.shake > 0) { S.shake -= dt; S.shakeI *= (1 - dt * 2.5); }
    
    if (S.goalTimer <= 0) { 
      resetPos(); 
      S.phase = 'playing'; 
    }
  }

  // ─── Render Viewport ───
  ctx.clearRect(0, 0, W, H);
  ctx.save();

  // Screenshake translate
  if (S.shake > 0) {
    ctx.translate((Math.random() - 0.5) * S.shakeI * 2.2, (Math.random() - 0.5) * S.shakeI * 2.2);
  }

  if (S.phase === 'goal' && isReplaying) {
    // 🎥 REPLAY MODE: Step through recorded frame ring buffer
    // Replay speed is roughly 0.3x
    replayTimer += dt;
    replayFrameIndex = Math.floor(replayTimer * 20); // 20 frames per sec
    if (replayFrameIndex >= replayBuffer.length) {
      replayFrameIndex = replayBuffer.length - 1;
    }

    const frame = replayBuffer[replayFrameIndex];
    if (frame) {
      // Re-apply viewport camera using recorded values at goal time
      // Center camera slowly on goal
      const targetReplayX = F.cx;
      const targetReplayY = S.goalBy === 'you' ? F.gT.y + 40 : F.gB.y - 40;
      camera.x = lr(camera.x, targetReplayX, 3 * dt);
      camera.y = lr(camera.y, targetReplayY, 3 * dt);
      camera.zoom = lr(camera.zoom, 1.35, 3 * dt);

      const rHalfW = (W / 2) / camera.zoom;
      const rHalfH = (H / 2) / camera.zoom;
      camera.x = cl(camera.x, rHalfW, W - rHalfW);
      camera.y = cl(camera.y, rHalfH, H - rHalfH);

      ctx.translate(W / 2, H / 2);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x, -camera.y);

      // Render field
      drawField();
      drawTornado();
      
      // Render goalies
      drawGoalie(frame.goalies.ai, false);
      drawGoalie(frame.goalies.you, true);
      
      // Render players
      frame.players.forEach(p => {
        drawPlayer(p);
      });
      
      // Render ball
      drawBall(frame.ball);

      // Render live particles
      drawParticles(ctx);
    }
  } else {
    // 🎮 LIVE GAME MODE
    ctx.translate(W / 2, H / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    drawField();
    drawTornado();
    drawPowerupsList();
    drawGoalie(aiG, false);
    drawGoalie(youG, true);
    
    // Sort players by Y coordinate for proper depth rendering
    const playersSorted = allOutfield().sort((a, b) => a.y - b.y);
    playersSorted.forEach(p => drawPlayer(p));
    
    drawBall(ball);
    drawAimIndicator(ctx, you, ball, you.charge);
    drawParticles(ctx);
  }

  ctx.restore();

  // Scoreboard / HUD text UI (drawn in screen space, outside camera transform)
  if (S.phase === 'goal') {
    drawGoalText();
    drawReplayOverlay();
  }
  
  if (S.phase === 'playing') {
    drawSprintMeter();
  }

  requestAnimationFrame(loop);
}

function drawGoalText() {
  const alpha = cl(S.goalTimer * 2, 0, 1);
  const scale = 1.0 + (1.0 - alpha) * 0.4;
  ctx.save();
  ctx.translate(W / 2, H / 2 - 80);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = 'black 68px sans-serif';
  ctx.textAlign = 'center'; 
  ctx.textBaseline = 'middle';
  ctx.fillText('⚽ GOAL!', 4, 4);

  ctx.fillStyle = S.goalBy === 'you' ? '#22c55e' : '#ef4444';
  ctx.shadowColor = S.goalBy === 'you' ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)';
  ctx.shadowBlur = 30;
  ctx.fillText('⚽ GOAL!', 0, 0);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawReplayOverlay() {
  if (!isReplaying) return;
  
  // Glowing neon red "REPLAY" banner
  ctx.save();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
  ctx.fillRect(0, 30, W, 45);
  
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 30); ctx.lineTo(W, 30);
  ctx.moveTo(0, 75); ctx.lineTo(W, 75);
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('● SLOW MOTION REPLAY', W / 2, 52);
  ctx.restore();
}

// ─── Start / Click event ──────────────────────────────────
function startGame() {
  initAudio();

  S.teamYou = selectTeamYou.value;
  S.teamAi = selectTeamAi.value;
  S.difficulty = selectDifficulty.value;
  S.formation = selectFormation.value;

  badgeYou.textContent = S.teamYou;
  badgeAi.textContent = S.teamAi;
  badgeYou.className = `badge you ${S.teamYou}`;
  badgeAi.className = `badge ai ${S.teamAi}`;

  badgeYou.style.background = `linear-gradient(135deg, ${TEAMS[S.teamYou].primary}, ${TEAMS[S.teamYou].secondary})`;
  badgeYou.style.color = TEAMS[S.teamYou].text;
  badgeAi.style.background = `linear-gradient(135deg, ${TEAMS[S.teamAi].primary}, ${TEAMS[S.teamAi].secondary})`;
  badgeAi.style.color = TEAMS[S.teamAi].text;

  S.phase = 'playing';
  S.sYou = 0; S.sAi = 0;
  S.half = 1; S.time = 120;
  clearParticles();
  S.combo = 0; S.comboTimer = 0;
  comboEl.classList.remove('visible');
  scoreYouEl.textContent = '0'; scoreAiEl.textContent = '0';
  timerEl.textContent = '2:00';
  resetPos();
  overlay.classList.add('hidden');
  playSound('whistle');
}

btnStart.addEventListener('click', startGame);

// Sound icon toggle
soundToggle.addEventListener('click', () => {
  const enabled = toggleSound();
  soundToggle.textContent = enabled ? '🔊' : '🔇';
});

// Run loop
requestAnimationFrame(loop);
