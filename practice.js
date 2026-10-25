/** Pure audio gates and user-driven card progression, shared by browser and Node. */
// Prefer the detector's median / octave-suppressed estimate everywhere we score.
const scoringFrequency = frame => frame.frequency ?? frame.rawFrequency;

class SteadyPitch {
  constructor(duration = 300, spread = 70) { this.duration = duration; this.spread = spread; this.reset(); }
  reset() { this.start = null; this.samples = []; this.lastClear = null; this.frequency = null; }
  update(frame, now) {
    if (this.lastClear !== null && now - this.lastClear > 100) this.reset();
    const f = scoringFrequency(frame);
    let clear = Boolean(f && f >= 75 && f <= 1400 && frame.clarity >= 0.8);
    const pitches = this.samples.filter(sample => sample.clear).map(sample => sample.frequency);
    // Treat an isolated harmonic jump like a dropout. A sustained change starts
    // a new window after 100 ms, so gliding pitches never build a stable window.
    if (clear && pitches.length) {
      const low = Math.min(f, ...pitches), high = Math.max(f, ...pitches);
      clear = 1200 * Math.log2(high / low) <= this.spread;
    }
    if (this.start === null) {
      if (!clear) return false;
      this.start = now;
    }
    this.samples.push({ time: now, clear, frequency: f });
    if (clear) this.lastClear = now;
    // Retain one duration of evidence; weaker frames count against confidence.
    this.samples = this.samples.filter(sample => sample.time >= now - this.duration);
    const accepted = this.samples.filter(sample => sample.clear);
    const sorted = accepted.map(sample => sample.frequency).sort((a, b) => a - b);
    this.frequency = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    return clear && now - this.start >= this.duration && accepted.length >= 4
      && accepted.length / this.samples.length >= 0.75;
  }
}

class NoteAttempt {
  constructor() { this.reset(); }
  reset() { this.gate = new SteadyPitch(300, 60); this.attack = null; this.lost = null; this.done = false; this.peak = 0; }
  update(frame, now, expected, floor = 0.003) {
    if (this.done) return null;
    if (frame.onset && this.attack === null) this.attack = now;
    if (this.attack === null) return null;
    this.peak = Math.max(this.peak, frame.rms);
    const elapsed = now - this.attack;
    const quiet = frame.rms < Math.max(floor * 1.2, this.peak * 0.04);
    // Require a confirmed disappearance, not a single dropped pitch frame.
    if (quiet && !scoringFrequency(frame)) {
      if (this.lost === null && elapsed <= 150) this.lost = now;
      if (this.lost !== null && now - this.lost >= 32) { this.done = true; return { type: 'muted' }; }
    } else this.lost = null;
    if (this.gate.update(frame, now)) {
      this.done = true;
      const frequency = this.gate.frequency;
      return { type: Math.abs(1200 * Math.log2(frequency / expected)) <= 50 ? 'right' : 'wrong', frequency };
    }
    if (elapsed > 1800) { this.done = true; return { type: 'unclear' }; }
    return null;
  }
}

class PracticeSession {
  constructor(cards) { this.cards = cards; this.index = 0; this.right = 0; this.attempts = 0; this.state = 'playing'; }
  record(right) {
    if (this.state !== 'playing') return;
    this.attempts++;
    if (right) { this.right++; this.state = this.index === this.cards.length - 1 ? 'result' : 'feedback'; }
  }
  retry() {
    if (this.state === 'feedback' || this.state === 'result') this.right = Math.max(0, this.right - 1);
    this.state = 'playing';
  }
  next() {
    if (this.state === 'result') { this.state = 'finished'; return; }
    if (this.state === 'feedback') { this.index++; this.state = 'playing'; }
  }
  skip() {
    if (this.state !== 'playing' && this.state !== 'feedback') return;
    const current = this.cards[this.index];
    do { this.index++; } while (this.index < this.cards.length && this.cards[this.index].string === current.string && this.cards[this.index].fret === current.fret);
    this.state = this.index >= this.cards.length ? 'result' : 'playing';
  }
}
const stringLabel = number => `String ${number} (${({1:'high E',2:'B',3:'G',4:'D',5:'A',6:'low E'})[number]})`;
if (typeof module !== 'undefined' && module.exports) module.exports = { SteadyPitch, NoteAttempt, PracticeSession, stringLabel };
