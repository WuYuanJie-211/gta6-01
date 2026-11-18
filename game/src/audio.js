// All sound is synthesized with WebAudio, no audio files and no network:
// a low engine hum that follows the car's speed, a two-tone police siren, and
// short blips for a honk, a punch, a pickup and a mission payout.
// Audio only starts after the first user gesture (the browser insists).
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let started = false;

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
      started = true;
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

  return {
    /** Call from any user gesture (click / key) to unlock sound. */
    unlock() {
      ensure();
    },
    /** Engine hum follows speed 0..1; silent on foot. */
    setEngine(speed01) {
      if (!started) return;
      engineOsc.frequency.value = 45 + speed01 * 110;
      engineGain.gain.value = speed01 > 0.02 ? 0.02 + speed01 * 0.03 : 0;
    },
    /** Two-tone siren while the police are after the player. */
    updateSiren(dt, wanted) {
      if (!started) return;
      if (wanted > 0) {
        sirenTimer += dt;
        if (sirenTimer > 0.45) {
          sirenTimer = 0;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.value = sirenHigh ? 950 : 650;
        }
        sirenGain.gain.value = 0.025;
      } else {
        sirenGain.gain.value = 0;
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
  };
}
