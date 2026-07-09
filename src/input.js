export const keys = {};

export const mouse = {
  screenX: 0,
  screenY: 0,
  worldX: 0,
  worldY: 0,
  pressed: false,
  rightPressed: false,
  active: false // Flag to see if mouse is actively aiming
};

let currentFormation = 'balanced';

export function setupInput(canvas, camera) {
  // Keyboard Listeners
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    
    // Prevent default scrolling keys
    if (['Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyQ', 'Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  // Mouse/Pointer Listeners
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.screenX = e.clientX - rect.left;
    mouse.screenY = e.clientY - rect.top;
    mouse.active = true;
    updateWorldCoords(canvas, camera);
  });

  canvas.addEventListener('mousedown', e => {
    mouse.active = true;
    if (e.button === 0) {
      mouse.pressed = true;
    } else if (e.button === 2) {
      mouse.rightPressed = true;
      e.preventDefault();
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (e.button === 0) {
      mouse.pressed = false;
    } else if (e.button === 2) {
      mouse.rightPressed = false;
    }
  });

  // Disable context menu on canvas
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
  });
}

// Convert screen mouse coordinates into world coordinates
export function updateWorldCoords(canvas, camera) {
  // Screen center coordinates
  const cx = mouse.screenX - canvas.width / 2;
  const cy = mouse.screenY - canvas.height / 2;

  // Scale down by zoom, then add camera tracking focus center
  mouse.worldX = (cx / camera.zoom) + camera.x;
  mouse.worldY = (cy / camera.zoom) + camera.y;
}

export function drawAimIndicator(ctx, player, ball, charge) {
  if (!mouse.active || !player.isHuman) return;

  const dx = mouse.worldX - player.x;
  const dy = mouse.worldY - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) return;

  const ang = Math.atan2(dy, dx);
  
  ctx.save();
  ctx.translate(player.x, player.y);
  
  // Aiming line
  const lineLen = 30 + charge * 80;
  
  // Outer glowing dashed target path
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ang) * lineLen, Math.sin(ang) * lineLen);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + charge * 0.45})`;
  ctx.lineWidth = 2 + charge * 4;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  
  // Triangle arrowhead indicator
  ctx.beginPath();
  ctx.moveTo(Math.cos(ang) * lineLen, Math.sin(ang) * lineLen);
  ctx.lineTo(
    Math.cos(ang) * (lineLen - 8) + Math.cos(ang + 0.5) * 5, 
    Math.sin(ang) * (lineLen - 8) + Math.sin(ang + 0.5) * 5
  );
  ctx.lineTo(
    Math.cos(ang) * (lineLen - 8) + Math.cos(ang - 0.5) * 5, 
    Math.sin(ang) * (lineLen - 8) + Math.sin(ang - 0.5) * 5
  );
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + charge * 0.6})`;
  ctx.fill();
  
  ctx.restore();
}
