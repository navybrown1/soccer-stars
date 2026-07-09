import { cl, rand } from './physics.js';

export let parts = [];

export function spawnGoalParticles(x, y, F, W) {
  // Burst at goal
  for (let i = 0; i < 90; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(120, 380);
    parts.push({
      x, y, 
      vx: Math.cos(a) * s, 
      vy: Math.sin(a) * s,
      life: 1.0, 
      decay: rand(0.2, 0.45),
      r: rand(2.5, 6.5),
      c: ['#22c55e', '#fbbf24', '#3b82f6', '#ef4444', '#ffffff', '#a855f7'][~~(rand(0, 6))],
      useGravity: true
    });
  }

  // Falling confetti from stadium roof
  for (let i = 0; i < 50; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(60, 200);
    parts.push({
      x: rand(F.l, F.r), 
      y: rand(F.t, F.t + 100),
      vx: Math.cos(a) * s, 
      vy: Math.sin(a) * s + 80,
      life: 2.0, 
      decay: rand(0.12, 0.25),
      r: rand(3, 8),
      c: ['#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][~~(rand(0, 6))],
      useGravity: false,
      swing: rand(2, 6) // side-to-side swing factor
    });
  }
}

export function spawnTouchParticles(x, y, color = 'rgba(255,255,255,0.6)', count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(50, 120);
    parts.push({
      x, y, 
      vx: Math.cos(a) * s, 
      vy: Math.sin(a) * s,
      life: 0.6, 
      decay: rand(1.4, 2.5),
      r: rand(1.5, 4.0),
      c: color,
      useGravity: true
    });
  }
}

export function spawnPowerupParticles(x, y, color) {
  for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(25, 75);
    parts.push({
      x, y, 
      vx: Math.cos(a) * s, 
      vy: Math.sin(a) * s,
      life: 0.9, 
      decay: rand(0.9, 1.8),
      r: rand(2, 4.5),
      c: color,
      useGravity: false
    });
  }
}

export function spawnSprintParticles(x, y, color = 'rgba(255, 255, 255, 0.35)') {
  // A tiny puff of dust/turf kicked up
  parts.push({
    x, y,
    vx: rand(-30, 30),
    vy: rand(20, 50), // slightly upward relative to grass
    life: 0.4,
    decay: 2.5,
    r: rand(1, 3.5),
    c: color,
    useGravity: false
  });
}

export function spawnFrostParticles(x, y) {
  // Small ice crystals rising
  parts.push({
    x: x + rand(-12, 12),
    y: y + rand(-12, 12),
    vx: rand(-10, 10),
    vy: rand(-30, -10),
    life: 0.7,
    decay: 1.4,
    r: rand(1.5, 3),
    c: 'rgba(34, 211, 238, 0.7)',
    useGravity: false
  });
}

export function spawnSlideParticles(x, y) {
  // Turf particles from slide tackling
  for (let i = 0; i < 3; i++) {
    parts.push({
      x, y,
      vx: rand(-80, 80),
      vy: rand(-40, 40),
      life: 0.5,
      decay: 2.0,
      r: rand(2, 4),
      c: '#15803d', // Grass green
      useGravity: true
    });
  }
}

export function clearParticles() {
  parts.length = 0;
}

export function updateParticles(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx * dt; 
    p.y += p.vy * dt;
    
    if (p.useGravity) {
      p.vy += 170 * dt; // gravity force
    }

    if (p.swing) {
      p.x += Math.sin(Date.now() / 200 + p.y) * p.swing * dt * 20;
    }

    p.life -= p.decay * dt;
    if (p.life <= 0) {
      parts.splice(i, 1);
    }
  }
}

export function drawParticles(ctx) {
  for (const p of parts) {
    ctx.globalAlpha = cl(p.life, 0, 1);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.c;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
