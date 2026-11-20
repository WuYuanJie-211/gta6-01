export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenOsc2 = null;
  let sirenGain2 = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let noiseBuf = null;
  let started = false;
  let musicOn = true;
  let musicStep = 0;
  let nextNoteTime = 0;
  let musicTimerId = null;
  const BASS = [110, 87, 131];
  const LEAD = [
    [220, 262, 330, 440],
    [175, 220, 262, 349],
    [262, 330, 392, 523],
  ];
  function mkOsc(type, freq) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }
  function mkGain(v) {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  }
  function ensure() {
    if (started) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      ctx = new AudioContext();
      engineOsc = mkOsc('sawtooth', 50);
      engineGain = mkGain(0);
      engineOsc.connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      sirenOsc = mkOsc('sine', 700);
      sirenGain = mkGain(0);
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      sirenOsc2 = mkOsc('triangle', 550);
      sirenGain2 = mkGain(0);
      sirenOsc2.connect(sirenGain2).connect(ctx.destination);
      sirenOsc2.start();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      started = true;
      startMusic();
      return true;
    } catch {
      return false;
    }
  }
  function blip(freq, seconds, volume, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  }
  function noise(seconds, volume, filterFreq) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + seconds + 0.05);
  }
  function scheduleStep(step, t) {
    const bar = Math.floor(step / 8) % 3;
    const beat = step % 8;
    if (beat === 0 || beat === 4) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = BASS[bar];
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    }
    const chord = LEAD[bar];
    const note = chord[step % 4];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = note;
    gain.gain.setValueAtTime(0.018, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.28);
  }
  function startMusic() {
    if (musicTimerId !== null) return;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimerId = setInterval(() => {
      if (!musicOn || !ctx) return;
      const stepDur = 60 / 112 / 2;
      while (nextNoteTime < ctx.currentTime + 0.4) {
        scheduleStep(musicStep, nextNoteTime);
        musicStep = (musicStep + 1) % 32;
        nextNoteTime += stepDur;
      }
    }, 100);
  }
  return {
    unlock() {
      ensure();
    },
    toggleMusic() {
      musicOn = !musicOn;
      return musicOn;
    },
    setEngine(speed01) {
      if (!started) return;
      engineOsc.frequency.value = 45 + speed01 * 110;
      engineGain.gain.value = speed01 > 0.02 ? 0.02 + speed01 * 0.03 : 0;
    },
    updateSiren(dt, wanted) {
      if (!started) return;
      if (wanted > 0) {
        sirenTimer += dt;
        if (sirenTimer > 0.45) {
          sirenTimer = 0;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.value = sirenHigh ? 950 : 650;
          sirenOsc2.frequency.value = sirenHigh ? 800 : 550;
        }
        sirenGain.gain.value = 0.025;
        sirenGain2.gain.value = wanted >= 4 ? 0.015 : 0;
      } else {
        sirenGain.gain.value = 0;
        sirenGain2.gain.value = 0;
      }
    },
    honk() {
      blip(370, 0.18, 0.08);
      blip(466, 0.18, 0.08);
    },
    honkShort() {
      blip(370, 0.1, 0.07);
      blip(466, 0.1, 0.07);
    },
    punch() {
      blip(160, 0.1, 0.12);
    },
    pickup() {
      blip(880, 0.12, 0.08);
      blip(1320, 0.18, 0.08, 0.1);
    },
    payout() {
      blip(660, 0.12, 0.09);
      blip(880, 0.12, 0.09, 0.1);
      blip(1100, 0.25, 0.09, 0.2);
    },
    gunshot() {
      noise(0.12, 0.25, 3000);
      blip(80, 0.1, 0.15);
      blip(1200, 0.06, 0.05, 0.08);
    },
    explosion() {
      noise(0.9, 0.3, 300);
      blip(55, 0.7, 0.2);
      blip(40, 0.9, 0.15, 0.2);
    },
    crash() {
      noise(0.3, 0.2, 800);
      blip(60, 0.25, 0.15);
    },
    wreck() {
      noise(0.5, 0.25, 500);
      blip(50, 0.4, 0.18);
      blip(38, 0.5, 0.15, 0.15);
    },
    reload() {
      blip(1200, 0.05, 0.08);
      blip(900, 0.05, 0.08, 0.3);
    },
    click() {
      blip(700, 0.04, 0.06);
    },
  };
}
