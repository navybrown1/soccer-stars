// Math helpers
export const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const cl = (v, mn, mx) => Math.max(mn, Math.min(mx, v));
export const lr = (a, b, t) => a + (b - a) * t;
export const a2 = (f, t) => Math.atan2(t.y - f.y, t.x - f.x);
export const rand = (mn, mx) => mn + Math.random() * (mx - mn);

export const TEAMS = {
  ARG: { name: 'Argentina', primary: '#74acdf', secondary: '#ffffff', text: '#000000', badge: 'ARG' },
  BRA: { name: 'Brazil', primary: '#fde047', secondary: '#16a34a', text: '#002244', badge: 'BRA' },
  FRA: { name: 'France', primary: '#1d4ed8', secondary: '#ffffff', text: '#ffffff', badge: 'FRA' },
  GER: { name: 'Germany', primary: '#111827', secondary: '#eab308', text: '#ffffff', badge: 'GER' },
  ENG: { name: 'England', primary: '#ffffff', secondary: '#dc2626', text: '#000000', badge: 'ENG' },
  USA: { name: 'USA', primary: '#1e3a8a', secondary: '#ef4444', text: '#ffffff', badge: 'USA' }
};

export const POWERUP_TYPES = {
  speed: { color: '#3b82f6', label: '⚡' },
  freeze: { color: '#22d3ee', label: '❄️' },
  supershot: { color: '#f97316', label: '🔥' },
  magnet: { color: '#ec4899', label: '🧲' },
  shield: { color: '#eab308', label: '🛡️' }
};

export function makePlayer(x, y, team, isHuman, number) {
  return {
    x, y, vx: 0, vy: 0,
    r: 15, spd: 230, sprintSpd: 340,
    fx: 0, fy: team === 'you' ? -1 : 1,
    charge: 0, charging: false,
    sprinting: false, sprintMeter: 100,
    animFrame: 0, animTimer: 0,
    powerupTimer: 0, powerupType: null,
    team, isHuman, number,
    state: 'defend', stateTimer: 0,
    homeX: x, homeY: y,
    slideTimer: 0, // sliding if > 0
    staggerTimer: 0, // staggered/knocked out if > 0
    role: team === 'you' ? (number === 7 ? 'captain' : number === 10 ? 'left_wing' : 'right_wing') : (number === 9 ? 'striker' : number === 8 ? 'left_mid' : 'right_mid'),
    tacticalState: 'cover',
    kickCooldown: 0
  };
}

// Update player home positions based on chosen formation
export function updateFormations(youMates, aiTeam, formation, W, H) {
  if (formation === 'attacking') {
    // Teammates play higher up the field
    youMates[0].homeX = W / 2 - 160; youMates[0].homeY = H - 280;
    youMates[1].homeX = W / 2 + 160; youMates[1].homeY = H - 280;

    // AI opponents compress/attack down
    aiTeam[0].homeX = W / 2;       aiTeam[0].homeY = 240;
    aiTeam[1].homeX = W / 2 - 110; aiTeam[1].homeY = 150;
    aiTeam[2].homeX = W / 2 + 110; aiTeam[2].homeY = 150;
  } else if (formation === 'defensive') {
    // Teammates stay deep
    youMates[0].homeX = W / 2 - 100; youMates[0].homeY = H - 150;
    youMates[1].homeX = W / 2 + 100; youMates[1].homeY = H - 150;

    // AI opponents stay deep defense
    aiTeam[0].homeX = W / 2;       aiTeam[0].homeY = 130;
    aiTeam[1].homeX = W / 2 - 150; aiTeam[1].homeY = 180;
    aiTeam[2].homeX = W / 2 + 150; aiTeam[2].homeY = 180;
  } else {
    // Balanced
    youMates[0].homeX = W / 2 - 140; youMates[0].homeY = H - 200;
    youMates[1].homeX = W / 2 + 140; youMates[1].homeY = H - 200;

    aiTeam[0].homeX = W / 2;       aiTeam[0].homeY = 160;
    aiTeam[1].homeX = W / 2 - 130; aiTeam[1].homeY = 220;
    aiTeam[2].homeX = W / 2 + 130; aiTeam[2].homeY = 220;
  }
}

export function updateBall(ball, F, W, H, S, dt, playSound, spawnTouchParticles, goalCallback) {
  const friction = 2.4;
  ball.vx *= (1 - friction * dt);
  ball.vy *= (1 - friction * dt);

  // Magnus curve physics
  if (Math.abs(ball.spin) > 5) {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 50) {
      const angle = Math.atan2(ball.vy, ball.vx) + Math.PI / 2;
      
      // Calculate curve multiplier based on team stat
      let curveMult = 1.0;
      if (S.goalBy === 'you' && S.teamYou === 'ARG') curveMult = 1.4;
      else if (S.goalBy === 'ai' && S.teamAi === 'ARG') curveMult = 1.4;

      const curveForce = ball.spin * speed * 0.00015 * curveMult;
      ball.vx += Math.cos(angle) * curveForce * dt;
      ball.vy += Math.sin(angle) * curveForce * dt;
    }
    ball.spin *= (1 - 2.5 * dt);
  }

  if (Math.abs(ball.vx) < 2) ball.vx = 0;
  if (Math.abs(ball.vy) < 2) ball.vy = 0;

  // 3D Height physics
  if (ball.z > 0 || ball.vz !== 0) {
    ball.vz -= 380 * dt;
    ball.z += ball.vz * dt;
    if (ball.z <= 0) {
      ball.z = 0;
      ball.vz = -ball.vz * 0.55;
      if (Math.abs(ball.vz) < 20) ball.vz = 0;
      playSound('bounce');
      spawnTouchParticles(ball.x, ball.y, 'rgba(255,255,255,0.4)', 4);
    }
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  ball.rotX += ball.vx * dt * 0.1;
  ball.rotY += ball.vy * dt * 0.1;

  // Field constraints
  if (ball.x - ball.r < F.l) {
    ball.x = F.l + ball.r; ball.vx = -ball.vx * 0.55; ball.spin *= -0.4;
    playSound('bounce');
  }
  if (ball.x + ball.r > F.r) {
    ball.x = F.r - ball.r; ball.vx = -ball.vx * 0.55; ball.spin *= -0.4;
    playSound('bounce');
  }

  // Top Goal
  if (ball.y - ball.r < F.t) {
    if (ball.x > F.gT.l && ball.x < F.gT.r) {
      if (ball.z < 35) {
        goalCallback('ai');
        return;
      }
    }
    ball.y = F.t + ball.r; ball.vy = -ball.vy * 0.55;
    playSound('bounce');
  }

  // Bottom Goal
  if (ball.y + ball.r > F.b) {
    if (ball.x > F.gB.l && ball.x < F.gB.r) {
      if (ball.z < 35) {
        goalCallback('you');
        return;
      }
    }
    ball.y = F.b - ball.r; ball.vy = -ball.vy * 0.55;
    playSound('bounce');
  }

  // Net bulges
  if (S.phase === 'playing') {
    if (ball.y < F.t + 15 && ball.x > F.gT.l && ball.x < F.gT.r) {
      S.netBulgeTop = lr(S.netBulgeTop, (F.t - ball.y) * 1.5, 10 * dt);
    } else {
      S.netBulgeTop = lr(S.netBulgeTop, 0, 8 * dt);
    }
    if (ball.y > F.b - 15 && ball.x > F.gB.l && ball.x < F.gB.r) {
      S.netBulgeBottom = lr(S.netBulgeBottom, (ball.y - F.b) * 1.5, 10 * dt);
    } else {
      S.netBulgeBottom = lr(S.netBulgeBottom, 0, 8 * dt);
    }
  }

  // Ring trail update
  ball.trail.push({ x: ball.x, y: ball.y, z: ball.z, life: 1.0 });
  if (ball.trail.length > 16) ball.trail.shift();
  for (let i = ball.trail.length - 1; i >= 0; i--) {
    ball.trail[i].life -= 3.8 * dt;
    if (ball.trail[i].life <= 0) ball.trail.splice(i, 1);
  }
}

export function updateAIPlayer(p, ball, you, aiTeam, youMates, S, F, W, H, dt, playSound, spawnTouchParticles) {
  // 1. Cooldowns & Status timers
  if (p.kickCooldown > 0) p.kickCooldown -= dt;
  if (p.staggerTimer > 0) {
    p.staggerTimer -= dt;
    p.vx *= (1 - 5 * dt);
    p.vy *= (1 - 5 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = cl(p.x, F.l + p.r, F.r - p.r);
    p.y = cl(p.y, F.t + p.r, F.b - p.r);
    return;
  }

  if (p.powerupTimer > 0) {
    p.powerupTimer -= dt;
    if (p.powerupTimer <= 0) p.powerupType = null;
  }

  // Freeze power-up check
  if (p.team === 'ai' && you.powerupType === 'freeze') {
    p.vx = 0; p.vy = 0;
    return;
  }

  // If currently executing a slide tackle, let the boost physics handle movement
  if (p.slideTimer > 0) {
    return;
  }

  const distToBall = d(p, ball);

  // 2. Identify teams and opponents
  const myTeam = p.team === 'ai' ? aiTeam : [you, ...youMates];
  const oppTeam = p.team === 'ai' ? [you, ...youMates] : aiTeam;

  // Find who on my team is closest to the ball and able to act
  let closestMate = null;
  let minMateDist = Infinity;
  for (const mate of myTeam) {
    if (mate.staggerTimer > 0) continue;
    const dist = d(mate, ball);
    if (dist < minMateDist) {
      minMateDist = dist;
      closestMate = mate;
    }
  }

  // If p is on 'you' team (human player's teammate), respect human player priority!
  // If human player 'you' is closer or actively moving to the ball, teammates shouldn't swarm the ball
  let humanGoingForBall = false;
  if (p.team === 'you') {
    const youDist = d(you, ball);
    if (youDist < 190 || (youDist < 290 && Math.hypot(you.vx, you.vy) > 20)) {
      humanGoingForBall = true;
    }
  }

  // Only ONE player on the team acts as the active ball presser/carrier
  const isActivePresser = (closestMate === p) && (!humanGoingForBall || distToBall < 60 || (closestMate === p && d(you, ball) > distToBall + 65));

  // Determine which team currently has possession or closest ball proximity
  let closestOverallDist = Infinity;
  let ballPossessingTeam = 'none';
  for (const pl of [...myTeam, ...oppTeam]) {
    const dist = d(pl, ball);
    if (dist < closestOverallDist) {
      closestOverallDist = dist;
      ballPossessingTeam = pl.team;
    }
  }

  // 3. Difficulty & Team stat speeds
  let diffMultiplier = 1.0;
  if (p.team === 'ai') {
    if (S.difficulty === 'easy') diffMultiplier = 0.78;
    if (S.difficulty === 'medium') diffMultiplier = 0.98;
    if (S.difficulty === 'hard') diffMultiplier = 1.15;
    if (S.difficulty === 'legend') diffMultiplier = 1.3;
    if (S.teamAi === 'BRA') diffMultiplier *= 1.15;
  } else {
    diffMultiplier = 0.96;
    if (S.teamYou === 'BRA') diffMultiplier *= 1.15;
  }

  let currentSpd = p.spd * diffMultiplier;
  if (p.powerupType === 'speed') currentSpd *= 1.4;

  const attackGoalY = p.team === 'ai' ? F.b : F.t;

  // 4. Calculate Tactical Target (tx, ty) based on positional role and spacing
  let tx, ty;
  let targetSpd = currentSpd;

  if (isActivePresser) {
    // ACTIVE PRESSER: Close down the ball or carry it
    p.tacticalState = 'press';
    tx = ball.x + ball.vx * 0.16; // intercept slightly ahead
    ty = ball.y + ball.vy * 0.16;
    targetSpd = currentSpd * 1.05;

    // AI Slide Tackle decision when tracking opponent ball carrier
    if (p.team === 'ai' && p.slideTimer <= 0 && distToBall < 80 && distToBall > 32) {
      const oppOnBall = oppTeam.find(o => d(o, ball) < 32);
      if (oppOnBall && Math.random() < 0.35 * dt) {
        p.slideTimer = 0.45;
        playSound('kick');
      }
    }
  } else {
    // SUPPORT OR COVER: Maintain tactical formation, open passing channels, or defensive cover
    const ballShiftX = (ball.x - W / 2) * 0.45;
    const ballShiftY = (ball.y - H / 2) * 0.4;

    if (ballPossessingTeam === p.team || (p.team === 'you' && humanGoingForBall)) {
      // TEAM HAS POSSESSION: Spread wide into attacking pockets to offer passing options
      p.tacticalState = 'support';
      targetSpd = currentSpd * 0.95;

      if (p.team === 'you') {
        if (p.number === 10) { // Left Wing / Forward
          tx = cl(p.homeX + ballShiftX - 35, F.l + 50, F.cx - 40);
          ty = cl(p.homeY + ballShiftY - 110, F.t + 110, F.b - 140);
        } else { // Right Wing / Forward (#11)
          tx = cl(p.homeX + ballShiftX + 35, F.cx + 40, F.r - 50);
          ty = cl(p.homeY + ballShiftY - 110, F.t + 110, F.b - 140);
        }
      } else {
        if (p.number === 9) { // Striker
          tx = cl(p.homeX + ballShiftX, F.gB.l - 45, F.gB.r + 45);
          ty = cl(ball.y + 110, H / 2 - 30, F.b - 110);
        } else if (p.number === 8) { // Left Mid/Wing
          tx = cl(p.homeX + ballShiftX - 45, F.l + 50, F.cx - 30);
          ty = cl(p.homeY + ballShiftY + 70, F.t + 130, F.b - 140);
        } else { // Right Mid/Wing (#4)
          tx = cl(p.homeX + ballShiftX + 45, F.cx + 30, F.r - 50);
          ty = cl(p.homeY + ballShiftY + 70, F.t + 130, F.b - 140);
        }
      }
    } else {
      // OPPONENT HAS POSSESSION: Maintain compact defensive shape between ball and goal
      p.tacticalState = 'cover';
      targetSpd = currentSpd * 0.88;

      tx = p.homeX * 0.55 + ball.x * 0.45;
      ty = p.homeY * 0.65 + ball.y * 0.35;

      // Jockey / Mark nearest opponent
      let nearestOpp = null;
      let minOppDist = Infinity;
      for (const opp of oppTeam) {
        const dOpp = d(p, opp);
        if (dOpp < minOppDist) {
          minOppDist = dOpp;
          nearestOpp = opp;
        }
      }

      // If opponent enters defensive zone, position halfway to cut off passing lane
      if (nearestOpp && minOppDist < 160) {
        tx = nearestOpp.x * 0.6 + ball.x * 0.4;
        ty = nearestOpp.y * 0.6 + (p.team === 'ai' ? F.t : F.b) * 0.4;
      }
    }

    // Dynamic Spacing Check: Repel teammates to avoid crowding each other
    for (const mate of myTeam) {
      if (mate !== p && d(p, mate) < 70) {
        const pushAng = a2(mate, p);
        tx += Math.cos(pushAng) * 45;
        ty += Math.sin(pushAng) * 45;
      }
    }
  }

  // 5. Smooth Movement Execution toward Target (tx, ty)
  const jitterAmount = p.team === 'ai'
    ? (S.difficulty === 'easy' ? 30 : (S.difficulty === 'medium' ? 15 : 4))
    : 12;
  const jitter = Math.sin(Date.now() / 800 + p.x) * jitterAmount;
  tx += jitter;

  const ang = Math.atan2(ty - p.y, tx - p.x);
  const distToTarget = Math.hypot(tx - p.x, ty - p.y);
  
  if (distToTarget > 8) {
    p.vx = Math.cos(ang) * targetSpd;
    p.vy = Math.sin(ang) * targetSpd;
    p.fx = Math.cos(ang);
    p.fy = Math.sin(ang);
  } else {
    p.vx *= 0.8;
    p.vy *= 0.8;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = cl(p.x, F.l + p.r, F.r - p.r);
  p.y = cl(p.y, F.t + p.r, F.b - p.r);

  // Magnet powerup pull
  if (p.powerupType === 'magnet' && distToBall < 180 && ball.z < 25) {
    const pullAngle = a2(ball, p);
    const pullForce = 240 * dt;
    ball.vx += Math.cos(pullAngle) * pullForce;
    ball.vy += Math.sin(pullAngle) * pullForce;
  }

  // Shield tackle protection
  if (p.powerupType === 'shield') {
    for (const opp of oppTeam) {
      if (opp.staggerTimer <= 0 && d(p, opp) < p.r + opp.r + 4) {
        const pushAngle = a2(p, opp);
        opp.vx = Math.cos(pushAngle) * 450;
        opp.vy = Math.sin(pushAngle) * 450;
        opp.staggerTimer = 1.0;
        playSound('tackle');
      }
    }
  }

  // 6. Tactical Ball Possession Decision-Making (Pass, Dribble, or Shoot)
  if (distToBall < p.r + ball.r + 8 && ball.z < 22 && p.kickCooldown <= 0) {
    let decision = 'dribble';
    let targetAngle = 0;
    let shotPower = 0;
    let spinAmount = 0;

    const attackGoalL = p.team === 'ai' ? F.gB.l : F.gT.l;
    const attackGoalR = p.team === 'ai' ? F.gB.r : F.gT.r;
    const inAttackingHalf = p.team === 'ai' ? ball.y > H / 2 - 30 : ball.y < H / 2 + 30;
    const closeToGoal = p.team === 'ai' ? ball.y > H - 230 : ball.y < 230;

    // Check if any defender is blocking direct shot angle right in front
    const defenderInFront = oppTeam.some(o => {
      const dOpp = d(p, o);
      if (dOpp > 120) return false;
      const angToOpp = a2(p, o);
      const angToGoal = Math.atan2(attackGoalY - p.y, F.cx - p.x);
      return Math.abs(angToOpp - angToGoal) < 0.45;
    });

    // Option A: Evaluate Shot
    if (closeToGoal || (inAttackingHalf && !defenderInFront && Math.random() < 0.45)) {
      decision = 'shoot';
    } else {
      // Option B: Evaluate Pass to an open teammate further forward
      let bestReceiver = null;
      let bestPassScore = -999;

      for (const mate of myTeam) {
        if (mate === p || mate.staggerTimer > 0) continue;
        
        const forwardProgress = p.team === 'ai' ? (mate.y - p.y) : (p.y - mate.y);
        if (forwardProgress < -20) continue; // prefer forward passes

        const laneBlocked = oppTeam.some(o => {
          if (d(p, o) > d(p, mate)) return false;
          const angToO = a2(p, o);
          const angToMate = a2(p, mate);
          return Math.abs(angToO - angToMate) < 0.4;
        });

        if (!laneBlocked) {
          const score = forwardProgress - d(p, mate) * 0.2 + (mate === you ? 50 : 0);
          if (score > bestPassScore) {
            bestPassScore = score;
            bestReceiver = mate;
          }
        }
      }

      const oppClose = oppTeam.some(o => d(p, o) < 85);
      if (bestReceiver && (oppClose || Math.random() < 0.55)) {
        decision = 'pass';
        const leadX = cl(bestReceiver.x + bestReceiver.vx * 0.35, F.l + 30, F.r - 30);
        const leadY = cl(bestReceiver.y + bestReceiver.vy * 0.35, F.t + 30, F.b - 30);
        targetAngle = Math.atan2(leadY - p.y, leadX - p.x);
        shotPower = cl(d(p, bestReceiver) * 1.55, 220, 360);
        spinAmount = (Math.random() - 0.5) * 60;
      }
    }

    // Execute decision
    if (decision === 'shoot') {
      const targetX = rand(attackGoalL + 18, attackGoalR - 18);
      targetAngle = Math.atan2(attackGoalY - p.y, targetX - p.x);

      let powerMult = 1.0;
      if ((p.team === 'ai' && S.teamAi === 'GER') || (p.team === 'you' && S.teamYou === 'GER')) powerMult = 1.18;
      
      shotPower = (340 + rand(0, 180)) * powerMult;
      if (p.powerupType === 'supershot') shotPower *= 1.35;

      let deviation = 0.4;
      if ((p.team === 'ai' && S.teamAi === 'FRA') || (p.team === 'you' && S.teamYou === 'FRA')) deviation = 0.12;
      
      targetAngle += (Math.random() - 0.5) * deviation;
      spinAmount = (Math.random() - 0.5) * 180 * deviation;

      ball.vx = Math.cos(targetAngle) * shotPower;
      ball.vy = Math.sin(targetAngle) * shotPower;
      ball.spin = spinAmount;
      p.kickCooldown = 0.6;
      playSound('kick');
      spawnTouchParticles(ball.x, ball.y, p.powerupType === 'supershot' ? '#f97316' : '#fff', 10);
    } else if (decision === 'pass') {
      ball.vx = Math.cos(targetAngle) * shotPower;
      ball.vy = Math.sin(targetAngle) * shotPower;
      ball.spin = spinAmount;
      p.kickCooldown = 0.45;
      playSound('kick');
      spawnTouchParticles(ball.x, ball.y, '#38bdf8', 7);
    } else {
      // Dribble / Carry forward under close control
      const dribbleAngle = Math.atan2(attackGoalY - p.y, (F.cx - p.x) * 0.3 + (ball.x - p.x));
      const carrySpd = 145;
      ball.vx = Math.cos(dribbleAngle) * carrySpd + (Math.random() - 0.5) * 30;
      ball.vy = Math.sin(dribbleAngle) * carrySpd + (Math.random() - 0.5) * 30;
      p.kickCooldown = 0.18;
      spawnTouchParticles(ball.x, ball.y, 'rgba(255,255,255,0.5)', 3);
    }
  }
}

export function updateGoalies(aiG, youG, ball, F, dt, playSound, spawnTouchParticles) {
  // AI Goalie (Top)
  const gtx = cl(ball.x, F.gT.l + 22, F.gT.r - 22);
  aiG.tx = lr(aiG.tx, gtx, 3.5 * dt);
  aiG.x = lr(aiG.x, aiG.tx, 6 * dt);
  aiG.y = F.gT.y + 22;

  const dg = d(aiG, ball);
  if (dg < aiG.r + ball.r + 6 && ball.vy < 0 && ball.z < 25) {
    ball.vx += (ball.x - aiG.x) * 3;
    ball.vy = Math.abs(ball.vy) * 0.35 + 90;
    playSound('bounce');
    spawnTouchParticles(ball.x, ball.y, '#fbbf24', 6);
  }

  // Player Goalie (Bottom)
  const btx = cl(ball.x, F.gB.l + 22, F.gB.r - 22);
  youG.tx = lr(youG.tx, btx, 3.5 * dt);
  youG.x = lr(youG.x, youG.tx, 6 * dt);
  youG.y = F.gB.y - 28;

  const dyg = d(youG, ball);
  if (dyg < youG.r + ball.r + 6 && ball.vy > 0 && ball.z < 25) {
    ball.vx += (ball.x - youG.x) * 3;
    ball.vy = -Math.abs(ball.vy) * 0.35 - 90;
    playSound('bounce');
    spawnTouchParticles(ball.x, ball.y, '#fbbf24', 6);
  }
}

// Slide tackle physics check
export function checkSlideTackles(players, opponents, playSound, spawnSlideParticles, dt) {
  for (const p of players) {
    if (p.slideTimer <= 0) continue;

    p.slideTimer -= dt;
    
    // Perform slide movement boost
    const slideSpd = 480;
    p.vx = p.fx * slideSpd;
    p.vy = p.fy * slideSpd;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    spawnSlideParticles(p.x, p.y);

    // Collision check against opponents
    for (const opp of opponents) {
      if (opp.team === p.team || opp === p) continue;
      if (opp.staggerTimer <= 0 && d(p, opp) < p.r + opp.r + 6) {
        // Successful slide tackle! Knock opponent down
        opp.staggerTimer = 1.2; // 1.2s stun
        
        // Push opponent
        const angle = a2(p, opp);
        opp.vx = Math.cos(angle) * 380;
        opp.vy = Math.sin(angle) * 380;

        playSound('tackle');
      }
    }
  }
}

// Dynamic Tornado Wind hazard physics
export function updateTornado(tornado, ball, players, dt) {
  // Move tornado randomly
  tornado.pulse += dt * 3;
  tornado.x += Math.sin(tornado.pulse) * 90 * dt;
  tornado.y += Math.cos(tornado.pulse * 0.8) * 90 * dt;

  // Clamp to field
  tornado.x = cl(tornado.x, 150, 800);
  tornado.y = cl(tornado.y, 150, 550);

  // Tornado vacuum pulls ball & players in proximity
  const distBall = d(tornado, ball);
  if (distBall < 110) {
    const pullAngle = a2(ball, tornado);
    const force = (110 - distBall) * 4.5 * dt;
    ball.vx += Math.cos(pullAngle) * force;
    ball.vy += Math.sin(pullAngle) * force;
    ball.spin += rand(-30, 30);
  }

  for (const p of players) {
    const distP = d(tornado, p);
    if (distP < 80) {
      const pullAngle = a2(p, tornado);
      const force = (80 - distP) * 2.8 * dt;
      p.x += Math.cos(pullAngle) * force;
      p.y += Math.sin(pullAngle) * force;
    }
  }
}
