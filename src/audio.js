// ─── Sound System (Web Audio API) ──────────────────────────
export let soundEnabled = true;
let audioCtx = null;
let crowdGainNode = null;
let crowdSource = null;

export function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    setupCrowdAmbiance();
  }
}

export function toggleSound() {
  soundEnabled = !soundEnabled;
  if (audioCtx) {
    if (!soundEnabled) {
      audioCtx.suspend();
    } else {
      audioCtx.resume();
    }
  }
  return soundEnabled;
}

// Generate continuous pink/white noise for crowd ambiance
function setupCrowdAmbiance() {
  try {
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds loop
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Create soft brownian/pink noise
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Brownian filter
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // boost slightly
    }

    crowdSource = audioCtx.createBufferSource();
    crowdSource.buffer = buffer;
    crowdSource.loop = true;

    // Filter to make it sound like a stadium crowd
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, audioCtx.currentTime);

    crowdGainNode = audioCtx.createGain();
    crowdGainNode.gain.setValueAtTime(0.04, audioCtx.currentTime); // Low baseline volume

    crowdSource.connect(filter);
    filter.connect(crowdGainNode);
    crowdGainNode.connect(audioCtx.destination);
    crowdSource.start(0);
  } catch (e) {
    console.warn("Could not setup crowd ambiance:", e);
  }
}

// Dynamically swell crowd volume as the ball nears a goal post
export function updateCrowdAmbiance(ballY, height, F) {
  if (!soundEnabled || !crowdGainNode || !audioCtx) return;

  const distToTopGoal = Math.abs(ballY - F.gT.y);
  const distToBottomGoal = Math.abs(ballY - F.gB.y);
  const minDist = Math.min(distToTopGoal, distToBottomGoal);

  // Normalize distance: closer than 200px starts raising volume
  const threshold = 220;
  let targetGain = 0.04; // baseline

  if (minDist < threshold) {
    const factor = 1 - (minDist / threshold); // 0 to 1
    targetGain = 0.04 + factor * 0.16; // up to 0.2
  }

  // Smoothly transition volume
  const now = audioCtx.currentTime;
  crowdGainNode.gain.setTargetAtTime(targetGain, now, 0.2);
}

export function playSound(type) {
  if (!soundEnabled) return;
  initAudio();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  try {
    const now = audioCtx.currentTime;
    if (type === 'kick') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'tackle') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'chip') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'goal') {
      // Crowd Cheer (burst of noise)
      const bufferSize = audioCtx.sampleRate * 2.0;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.frequency.exponentialRampToValueAtTime(250, now + 1.8);

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.8);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      noise.start(now);

      // Fanfare
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        oscGain.gain.setValueAtTime(0.15, now + idx * 0.08);
        oscGain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.5);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.5);
      });
    } else if (type === 'whistle') {
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1000, now);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1040, now); // beat frequency

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } else if (type === 'powerup') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.linearRampToValueAtTime(550, now + 0.1);
      osc.frequency.linearRampToValueAtTime(850, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'bounce') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    }
  } catch (e) {
    console.warn("Audio play error:", e);
  }
}
