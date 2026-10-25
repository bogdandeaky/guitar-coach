const assert = require('node:assert/strict');
const { PitchDetector, NoteDetector } = require('./pitch-detection.js');
global.NoteDetector = NoteDetector;
const { TabParser } = require('./tab-parser.js');
const { BUILTIN_SONGS } = require('./songs.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function guitarTone(frequency, amplitude = 0.35, noise = 0, phase = 0, sampleRate = 44100) {
  const buffer = new Float32Array(4096);
  let seed = 123456;
  for (let i = 0; i < buffer.length; i += 1) {
    seed = (seed * 16807) % 2147483647;
    const random = seed / 2147483647 * 2 - 1;
    const time = (i + phase) / sampleRate;
    buffer[i] = amplitude * (
      Math.sin(2 * Math.PI * frequency * time)
      + 0.42 * Math.sin(2 * Math.PI * frequency * 2 * time)
      + 0.2 * Math.sin(2 * Math.PI * frequency * 3 * time)
    ) / 1.62 + random * noise;
  }
  return buffer;
}

function silence() {
  return new Float32Array(4096);
}

for (const [name, frequency] of Object.entries({
  E2: 82.41, A2: 110, D3: 146.83, G3: 196, B3: 246.94, E4: 329.63
})) {
  test(`YIN detects harmonic ${name}`, () => {
    const detector = new PitchDetector();
    const result = detector.analyze(guitarTone(frequency, 0.35, 0.012), 1000);
    assert.ok(result.clarity >= 0.6);
    assert.ok(Math.abs(result.frequency - frequency) < frequency * 0.015, `${result.frequency}`);
  });
}

test('YIN honors a 48 kHz browser AudioContext sample rate', () => {
  const detector = new PitchDetector(48000);
  const result = detector.analyze(guitarTone(329.63, 0.35, 0.01, 0, 48000), 1000);
  assert.ok(Math.abs(result.frequency - 329.63) < 4, `${result.frequency}`);
});

test('clarity gate rejects broadband noise', () => {
  const detector = new PitchDetector();
  const buffer = guitarTone(110, 0, 0.25);
  const result = detector.analyze(buffer, 1000);
  assert.equal(result.frequency, null);
  assert.equal(result.reason, 'unclear');
});

test('700ms-style calibration sets a practical floor', () => {
  const detector = new PitchDetector();
  detector.startCalibration();
  for (let i = 0; i < 45; i += 1) detector.addCalibrationFrame(guitarTone(110, 0, 0.001));
  const floor = detector.finishCalibration();
  assert.ok(floor >= 0.0015);
  assert.equal(detector.analyze(guitarTone(110, 0.0005, 0), 1000).reason, 'quiet');
});

test('continuous playing during calibration cannot close the input gate', () => {
  const detector = new PitchDetector();
  detector.startCalibration();
  for (let i = 0; i < 45; i += 1) detector.addCalibrationFrame(guitarTone(110, 0.35, 0.01, i * 128));
  const floor = detector.finishCalibration();
  assert.equal(floor, 0.02);
  assert.ok(detector.analyze(guitarTone(110, 0.35, 0.01), 1000).frequency);
});

test('onset is separate and held notes do not retrigger', () => {
  const detector = new PitchDetector();
  detector.analyze(silence(), 0);
  detector.analyze(silence(), 20);
  const attack = detector.analyze(guitarTone(110, 0.35), 200);
  const held = detector.analyze(guitarTone(110, 0.35, 0, 128), 230);
  assert.equal(attack.onset, true);
  assert.equal(held.onset, false);
});

test('a fresh pick retriggers after silence', () => {
  const detector = new PitchDetector();
  detector.analyze(silence(), 0);
  assert.equal(detector.analyze(guitarTone(196), 200).onset, true);
  detector.analyze(silence(), 400);
  detector.analyze(silence(), 430);
  assert.equal(detector.analyze(guitarTone(196), 650).onset, true);
});

test('single-frame octave jump is ignored', () => {
  const detector = new PitchDetector();
  const first = detector.analyze(guitarTone(110), 200);
  const octave = detector.analyze(guitarTone(220), 400);
  assert.ok(Math.abs(first.frequency - 110) < 2);
  assert.ok(Math.abs(octave.frequency - 110) < 2);
});

test('note matching tolerates octave errors only when requested', () => {
  const notes = new NoteDetector();
  assert.equal(notes.matchesNote(164.82, 'E', 2, 50, true), true);
  assert.equal(notes.matchesNote(164.82, 'E', 2, 50, false), false);
});

test('standard string numbering is correct', () => {
  const notes = new NoteDetector();
  assert.deepEqual(notes.noteAt(1, 0), { note: 'E', octave: 4 });
  assert.deepEqual(notes.noteAt(6, 0), { note: 'E', octave: 2 });
  assert.equal(notes.findGuitarString(329.63).number, 1);
  assert.equal(notes.findGuitarString(82.41).number, 6);
});

const parser = new TabParser();

test('parses realistic Ultimate Guitar text around repeated blocks', () => {
  const tab = `Artist: Traditional
Tuning: E A D G B E

   Happy birthday to you
e|----------------|----------------|
B|------1---0-----|------3---1-----|
G|0-0-2---0-------|0-0-2---0-------|
D|----------------|----------------|
A|----------------|----------------|
E|----------------|----------------|

[Verse 2]
e|3---0-----------|1-1-0-----------|
B|------1-0-------|------1-3-1-----|
G|----------2-----|----------------|
D|----------------|----------------|
A|----------------|----------------|
E|----------------|----------------|`;
  const song = parser.parseTab(tab, 'Real World');
  assert.equal(song.title, 'Real World');
  assert.ok(song.notes.length >= 17, `found ${song.notes.length}`);
  assert.deepEqual(song.notes[0].string, 3);
  assert.deepEqual(song.notes.at(-1).string, 2);
});

test('uppercase E rows are assigned by six-line order', () => {
  const song = parser.parseTab(`E|--0------|
B|---------|
G|---------|
D|---------|
A|---------|
E|--3------|`, 'Uppercase');
  assert.equal(song.notes[0].string, 1);
  assert.ok(song.warnings.some(warning => warning.includes('Chord')));
});

test('technique symbols and two-digit frets preserve playable notes', () => {
  const song = parser.parseTab(`e|--10h12p10--/14~--|
B|-------------------|
G|-------------------|
D|-------------------|
A|-------------------|
E|-------------------|`, 'Techniques');
  assert.deepEqual(song.notes.map(note => note.fret), [10, 12, 10, 14]);
});

test('CRLF, bars, x notes and uneven line lengths are tolerated', () => {
  const song = parser.parseTab('e|--0-x-2-|\r\nB|----------|\r\nG|----------|\r\nD|-----0|\r\nA|----------|\r\nE|----------|', 'CRLF');
  assert.deepEqual(song.notes.map(note => note.fret), [0, 0, 2]);
});

test('JSON import derives pitch rather than trusting bad note names', () => {
  const song = parser.parseJSON(JSON.stringify({
    title: 'JSON',
    notes: [{ string: 2, fret: 1, note: 'WRONG', octave: 9, duration: 2 }]
  }));
  assert.deepEqual(song.notes[0], { string: 2, fret: 1, note: 'C', octave: 4, duration: 2 });
});

test('invalid and empty tabs fail clearly', () => {
  assert.throws(() => parser.parseTab('Am  G  C\nlyrics only'), /No playable tab/);
  assert.throws(() => parser.parseTab('e|---\nB|---\nG|---'), /no fret numbers/i);
});

test('built-in song notes match their strings and frets', () => {
  const notes = new NoteDetector();
  for (const song of BUILTIN_SONGS) {
    assert.ok(song.notes.length > 10);
    for (const item of song.notes) {
      assert.deepEqual(
        { note: item.note, octave: item.octave },
        notes.noteAt(item.string, item.fret),
        `${song.title}: string ${item.string}, fret ${item.fret}`
      );
      assert.ok(item.duration > 0);
    }
  }
});

let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}\n  ${error.message}`);
  }
}
console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
process.exitCode = failures ? 1 : 0;
