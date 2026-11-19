// All sound is synthesized WebAudio, no files, no network: engine hum,
// two-tone siren (a second, lower one joins at 4 stars), a looping music
// track (bass + lead over Am-F-C-G, M toggles it), and short effects.
// Audio starts only after the first user gesture.
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
  // The music loop: 32 eighth-note steps (4 bars of Am–F–C–G), scheduled
  // ahead with a timer so it keeps time without blocking the game loop.
  let musicOn = true;
  let musicStep = 0;
  let nextNoteTime = 0;
  let musicTimerId = null;
  const BASS = [110, 87.31, 130.81, 98]; // A2 F2 C3 G2, one bar each
  const LEAD = [
    [220, 261.63, 329.63, 440], // Am
    [174.61, 220, 261.63, 349.23], // F
    [261.63, 329.63, 392, 523.25], // C
    [196, 246.94, 293.66, 392], // G
  ];

  function ensure() {
    if (started) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      ctx = new AudioContext();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(ctx.destination);
      sirenOsc.start();
      sirenOsc2 = ctx.createOscillator();
      sirenOsc2.type = 'triangle';
      sirenOsc2.frequency.value = 550;
      sirenGain2 = ctx.createGain();
      sirenGain2.gain.value = 0;
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

  /** Short blip: a sine note that fades out. */
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

  /** A burst of noise, for gunshots and crashes. */
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

  /** Schedule one step of the music loop at time `t`. */
  function scheduleStep(step, t) {
    const bar = Math.floor(step / 8) % 4;
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

  /** The music scheduler: keep the next half second of notes queued. */
  function startMusic() {
    if (musicTimerId !== null) return;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimerId = setInterval(() => {
      if (!musicOn || !ctx) return;
      const stepDur = 60 / 112 / 2; // 112 BPM, eighth notes
      while (nextNoteTime < ctx.currentTime + 0.4) {
        scheduleStep(musicStep, nextNoteTime);
        musicStep = (musicStep + 1) % 32;
        nextNoteTime += stepDur;
      }
    }, 100);
  }

  return {
    /** Call from any user gesture (click / key) to unlock sound. */
    unlock() {
      ensure();
    },
    /** Music on/off (M key). Returns the new state. */
    toggleMusic() {
      musicOn = !musicOn;
      return musicOn;
    },
    /** Is the music loop on? (So the HUD and tests can read it.) */
    get musicOn() { return musicOn; },
    /** Engine hum follows speed 0..1; silent on foot. */
    setEngine(speed01) {
      if (!started) return;
      engineOsc.frequency.value = 45 + speed01 * 110;
      engineGain.gain.value = speed01 > 0.02 ? 0.02 + speed01 * 0.03 : 0;
    },
    /** Two-tone siren while the police are after the player; a second, lower
     * siren joins at 4 stars, so the chase sounds heavier. */
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
    /** A gunshot: a sharp noise crack with a low thump under it. */
    gunshot() {
      noise(0.12, 0.25, 3000);
      blip(80, 0.1, 0.15);
    },
    /** A crash: longer, lower noise and a deep thud. */
    crash() {
      noise(0.3, 0.2, 800);
      blip(60, 0.25, 0.15);
    },
    /** A reload: two clicks, half a second apart. */
    reload() {
      blip(1200, 0.05, 0.08);
      blip(900, 0.05, 0.08, 0.3);
    },
    /** An empty magazine: one dull click. */
    click() {
      blip(700, 0.04, 0.06);
    },
    /** A mission failed: three notes sliding down. */
    fail() {
      blip(330, 0.18, 0.09);
      blip(220, 0.18, 0.09, 0.15);
      blip(165, 0.3, 0.09, 0.3);
    },
  };
}
