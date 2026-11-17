/** 以 Web Audio 即時合成的簡單音效，不需要音檔。 */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private context(): AudioContext | null {
    if (this.muted) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15) {
    const ctx = this.context();
    if (!ctx) return;
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** 合成出已知元素。 */
  success() {
    this.tone(523.25, 0, 0.18, 'triangle');
    this.tone(783.99, 0.08, 0.25, 'triangle');
  }

  /** 無反應。 */
  fail() {
    const ctx = this.context();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.25);
    g.gain.setValueAtTime(0.18, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.35);
  }

  /** 新發現。 */
  discover() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.09, 0.5, 'triangle', 0.12));
    this.tone(1567.98, 0.36, 0.7, 'sine', 0.06);
  }

  /** 放入／取出元素的輕點聲。 */
  tick() {
    this.tone(880, 0, 0.06, 'sine', 0.05);
  }
}
