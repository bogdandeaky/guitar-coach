/**
 * Low-latency YIN pitch and onset detection for monophonic guitar.
 * Browser globals are also exported for the Node test suite.
 */
class PitchDetector {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.threshold = 0.15;
    this.clarityThreshold = 0.6;
    this.noiseFloor = 0.003;
    this.calibrationRms = [];
    this.calibrating = false;
    this.pitchHistory = [];
    this.previousAcceptedPitch = null;
    this.octaveCandidate = null;
    this.previousRms = 0;
    this.rmsBaseline = 0.003;
    this.lastOnsetAt = -Infinity;
  }

  resetTracking() {
    this.pitchHistory = [];
    this.previousAcceptedPitch = null;
    this.octaveCandidate = null;
    this.previousRms = 0;
    this.rmsBaseline = Math.max(this.noiseFloor, 0.003);
    this.lastOnsetAt = -Infinity;
  }

  startCalibration() {
    this.calibrationRms = [];
    this.calibrating = true;
  }

  addCalibrationFrame(buffer) {
    this.calibrationRms.push(this.getRMS(buffer));
  }

  finishCalibration() {
    if (this.calibrationRms.length) {
      const sorted = [...this.calibrationRms].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      // A player may begin picking during calibration (and browser fake-audio
      // fixtures can be continuous). Never let that make the gate higher than
      // a normal guitar signal; the YIN clarity gate still rejects room noise.
      this.noiseFloor = Math.min(0.02, Math.max(0.0015, median * 2.2));
    }
    this.calibrating = false;
    this.resetTracking();
    return this.noiseFloor;
  }

  getRMS(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
    return Math.sqrt(sum / buffer.length);
  }

  /**
   * Onset is calculated independently from pitch. A pick is a fast level rise
   * above both the calibrated floor and the slowly moving RMS baseline.
   */
  detectOnset(rms, now = performance.now()) {
    const floor = Math.max(this.noiseFloor, 0.0015);
    const baseline = Math.max(this.rmsBaseline, floor);
    const roseQuickly = rms > Math.max(floor * 1.8, baseline * 1.65)
      && rms - this.previousRms > floor * 0.35;
    const onset = roseQuickly && now - this.lastOnsetAt > 140;
    if (onset) this.lastOnsetAt = now;
    this.rmsBaseline = this.rmsBaseline * 0.94 + rms * 0.06;
    this.previousRms = rms;
    return onset;
  }

  /**
   * YIN cumulative mean normalized difference.
   */
  yin(buffer) {
    const minLag = Math.floor(this.sampleRate / 1400);
    const maxLag = Math.min(
      Math.floor(this.sampleRate / 65),
      Math.floor(buffer.length / 2)
    );
    const difference = new Float32Array(maxLag + 1);
    for (let lag = 1; lag <= maxLag; lag += 1) {
      let sum = 0;
      for (let i = 0; i < buffer.length - lag; i += 1) {
        const delta = buffer[i] - buffer[i + lag];
        sum += delta * delta;
      }
      difference[lag] = sum;
    }

    const normalized = new Float32Array(maxLag + 1);
    normalized[0] = 1;
    let running = 0;
    for (let lag = 1; lag <= maxLag; lag += 1) {
      running += difference[lag];
      normalized[lag] = running ? difference[lag] * lag / running : 1;
    }

    let lag = -1;
    for (let candidate = minLag; candidate < maxLag; candidate += 1) {
      if (normalized[candidate] < this.threshold) {
        while (
          candidate + 1 < maxLag
          && normalized[candidate + 1] < normalized[candidate]
        ) candidate += 1;
        lag = candidate;
        break;
      }
    }

    if (lag < 0) {
      let minimum = Infinity;
      for (let candidate = minLag; candidate <= maxLag; candidate += 1) {
        if (normalized[candidate] < minimum) {
          minimum = normalized[candidate];
          lag = candidate;
        }
      }
    }

    const clarity = lag > 0 ? 1 - normalized[lag] : 0;
    if (lag <= 0) return { frequency: null, clarity };

    let refinedLag = lag;
    if (lag > 1 && lag < maxLag) {
      const left = normalized[lag - 1];
      const center = normalized[lag];
      const right = normalized[lag + 1];
      const denominator = left - 2 * center + right;
      if (Math.abs(denominator) > 1e-9) {
        refinedLag += 0.5 * (left - right) / denominator;
      }
    }
    return { frequency: this.sampleRate / refinedLag, clarity };
  }

  stabilizeFrequency(frequency) {
    if (!frequency) return null;
    if (this.previousAcceptedPitch) {
      const ratio = frequency / this.previousAcceptedPitch;
      const octaveJump = (ratio > 1.9 && ratio < 2.1)
        || (ratio > 0.47 && ratio < 0.53);
      if (octaveJump) {
        if (
          this.octaveCandidate
          && Math.abs(1200 * Math.log2(frequency / this.octaveCandidate)) < 35
        ) {
          this.octaveCandidate = null;
        } else {
          this.octaveCandidate = frequency;
          return this.previousAcceptedPitch;
        }
      } else {
        this.octaveCandidate = null;
      }
    }

    this.pitchHistory.push(frequency);
    if (this.pitchHistory.length > 3) this.pitchHistory.shift();
    const sorted = [...this.pitchHistory].sort((a, b) => a - b);
    const stable = sorted[Math.floor(sorted.length / 2)];
    this.previousAcceptedPitch = stable;
    return stable;
  }

  /**
   * Always returns diagnostics so unclear audio can be reported without a
   * penalty. `frequency` is null unless level and YIN clarity both pass.
   */
  analyze(buffer, now = performance.now()) {
    const rms = this.getRMS(buffer);
    const onset = this.detectOnset(rms, now);
    if (this.calibrating || rms < this.noiseFloor) {
      return { frequency: null, clarity: 0, rms, onset, reason: 'quiet' };
    }

    const result = this.yin(buffer);
    if (
      !result.frequency
      || result.frequency < 70
      || result.frequency > 1400
      || result.clarity < this.clarityThreshold
    ) {
      return {
        frequency: null,
        clarity: result.clarity,
        rms,
        onset,
        reason: 'unclear'
      };
    }

    return {
      frequency: this.stabilizeFrequency(result.frequency),
      rawFrequency: result.frequency,
      clarity: result.clarity,
      rms,
      onset,
      reason: null
    };
  }

  detectPitch(buffer, now) {
    const result = this.analyze(buffer, now);
    return result.frequency ? result : null;
  }
}

class NoteDetector {
  constructor() {
    this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    this.guitarStrings = [
      { number: 6, note: 'E', octave: 2, frequency: 82.41 },
      { number: 5, note: 'A', octave: 2, frequency: 110.00 },
      { number: 4, note: 'D', octave: 3, frequency: 146.83 },
      { number: 3, note: 'G', octave: 3, frequency: 196.00 },
      { number: 2, note: 'B', octave: 3, frequency: 246.94 },
      { number: 1, note: 'E', octave: 4, frequency: 329.63 }
    ];
  }

  frequencyToNote(frequency) {
    if (!frequency || frequency < 20) return null;
    const midi = 69 + 12 * Math.log2(frequency / 440);
    const rounded = Math.round(midi);
    const note = this.noteNames[((rounded % 12) + 12) % 12];
    const octave = Math.floor(rounded / 12) - 1;
    return {
      note,
      octave,
      frequency,
      cents: Math.round((midi - rounded) * 100),
      fullName: `${note}${octave}`
    };
  }

  frequencyFor(note, octave) {
    const index = this.noteNames.indexOf(note);
    if (index < 0) return null;
    const midi = (octave + 1) * 12 + index;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  noteAt(stringNumber, fret) {
    const string = this.guitarStrings.find(item => item.number === stringNumber);
    const midi = Math.round(69 + 12 * Math.log2(string.frequency / 440)) + fret;
    const note = this.noteNames[((midi % 12) + 12) % 12];
    return { note, octave: Math.floor(midi / 12) - 1 };
  }

  findGuitarString(frequency) {
    if (!frequency) return null;
    return this.guitarStrings.reduce((best, string) => {
      const distance = Math.abs(1200 * Math.log2(frequency / string.frequency));
      return !best || distance < best.distance ? { ...string, distance } : best;
    }, null);
  }

  matchesNote(frequency, note, octave, toleranceCents = 60, allowOctave = false) {
    const expected = this.frequencyFor(note, octave);
    if (!expected || !frequency) return false;
    let cents = 1200 * Math.log2(frequency / expected);
    if (allowOctave) cents -= Math.round(cents / 1200) * 1200;
    return Math.abs(cents) <= toleranceCents;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PitchDetector, NoteDetector };
}
