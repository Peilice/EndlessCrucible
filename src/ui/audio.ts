/** 以 Web Audio 即時合成的音效，不需要音檔。整體走柔和路線：起音慢一點、經過低通、音量小。 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private _muted = false;
  private ambientOn = false;
  private ambient: { stop: () => void } | null = null;

  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    this.syncAmbient();
  }

  private context(force = false): AudioContext | null {
    if (this._muted && !force) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; lowpass?: number } = {}) {
    const ctx = this.context();
    if (!ctx) return;
    const { type = 'sine', gain = 0.1, attack = 0.02, lowpass = 0 } = opts;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let out: AudioNode = osc.connect(g);
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      out = out.connect(f);
    }
    out.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** 合成出已知元素：兩個輕柔的音。 */
  success() {
    this.tone(523.25, 0, 0.5, { gain: 0.08, attack: 0.03, lowpass: 2400 });
    this.tone(783.99, 0.12, 0.7, { gain: 0.06, attack: 0.04, lowpass: 2400 });
  }

  /** 無反應：熔液裡悶悶冒出的兩個泡。 */
  fail() {
    this.tone(150, 0, 0.35, { gain: 0.09, attack: 0.04, lowpass: 600 });
    this.tone(118, 0.16, 0.45, { gain: 0.07, attack: 0.05, lowpass: 500 });
  }

  /** 新發現：五聲音階慢慢展開，尾音拉長。 */
  discover() {
    [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, i * 0.16, 1.4, { gain: 0.07, attack: 0.06, lowpass: 2400 }));
    this.tone(1046.5, 0.7, 1.8, { gain: 0.025, attack: 0.2, lowpass: 3000 });
  }

  /** 放入／取出元素的輕點聲。 */
  tick() {
    this.tone(880, 0, 0.06, { gain: 0.04 });
  }

  // ───────── 工房環境聲 ─────────

  /** 開關環境聲。瀏覽器要等使用者互動後才允許發聲，所以第一次互動時會再呼叫一次 resume。 */
  setAmbient(on: boolean) {
    this.ambientOn = on;
    this.syncAmbient();
  }

  /** 使用者第一次互動、或頁面回到前景時呼叫，讓環境聲真的響起來。 */
  resume() {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.syncAmbient();
  }

  /** 頁面切到背景時暫停，避免在口袋裡一直燒柴。 */
  suspend() {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  private syncAmbient() {
    const want = this.ambientOn && !this._muted;
    if (want && !this.ambient) this.ambient = this.startAmbient();
    else if (!want && this.ambient) {
      this.ambient.stop();
      this.ambient = null;
    }
  }

  /** 柴火低鳴 + 隨機的木柴爆裂聲 + 偶爾冒一個泡。 */
  private startAmbient(): { stop: () => void } | null {
    const ctx = this.context(true);
    if (!ctx) return null;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
    master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // 火焰的低鳴：低通後的噪音
    const roar = ctx.createBufferSource();
    roar.buffer = buf;
    roar.loop = true;
    const roarLp = ctx.createBiquadFilter();
    roarLp.type = 'lowpass';
    roarLp.frequency.value = 320;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.035;
    roar.connect(roarLp).connect(roarGain).connect(master);
    roar.start();

    const crackle = () => {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 1800 + Math.random() * 2200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.02 + Math.random() * 0.03, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03 + Math.random() * 0.04);
      src.connect(hp).connect(g).connect(master);
      src.start(t0, Math.random() * 1.5, 0.1);
    };
    const bubble = () => {
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(170 + Math.random() * 40, t0);
      o.frequency.exponentialRampToValueAtTime(260 + Math.random() * 60, t0 + 0.09);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.025, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + 0.15);
    };

    let timer = 0;
    const loop = () => {
      if (Math.random() < 0.55) crackle();
      if (Math.random() < 0.06) bubble();
      timer = window.setTimeout(loop, 180 + Math.random() * 700);
    };
    loop();

    return {
      stop: () => {
        clearTimeout(timer);
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        roar.stop(t + 0.7);
        setTimeout(() => master.disconnect(), 800);
      },
    };
  }
}
