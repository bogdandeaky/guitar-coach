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


const { SteadyPitch, NoteAttempt, PracticeSession } = require('./practice.js');

function simulateAudio(makeBuffer, duration = 900, expected = 110) {
  const detector = new PitchDetector();
  const gate = new SteadyPitch();
  const attempt = new NoteAttempt();
  let soundPassed = false;
  let outcome = null;
  detector.analyze(silence(), -20);
  for (let t = 0; t <= duration; t += 20) {
    const frame = detector.analyze(makeBuffer(t), t);
    soundPassed ||= gate.update(frame, t);
    outcome ||= attempt.update(frame, t, expected, detector.noiseFloor);
  }
  return { soundPassed, outcome };
}

test('broadband noise cannot pass sound check or play a note', () => {
  const result = simulateAudio(() => guitarTone(110, 0, 0.2));
  assert.equal(result.soundPassed, false);
  assert.notEqual(result.outcome?.type, 'right');
});

test('voice-like gliding pitch cannot pass sound check or play a note', () => {
  const result = simulateAudio(t => guitarTone(110 * 2 ** (t / 1000), 0.3, 0.01, t * 44.1));
  assert.equal(result.soundPassed, false);
  assert.notEqual(result.outcome?.type, 'right');
});

test('short tonal bursts cannot pass sound check or play a note', () => {
  const result = simulateAudio(t => t % 240 < 100 ? guitarTone(110) : silence());
  assert.equal(result.soundPassed, false);
  assert.notEqual(result.outcome?.type, 'right');
});

test('natural slow guitar decay passes and is never marked muted', () => {
  const result = simulateAudio(t => guitarTone(110, 0.35 * Math.exp(-t / 1200), 0.001, t * 44.1));
  assert.equal(result.soundPassed, true);
  assert.equal(result.outcome.type, 'right');
});

test('tone dying within 100 ms is marked muted', () => {
  const result = simulateAudio(t => t < 80 ? guitarTone(110) : silence());
  assert.equal(result.soundPassed, false);
  assert.equal(result.outcome.type, 'muted');
});

test('retry clears all attack and decay state', () => {
  const attempt = new NoteAttempt();
  attempt.update({ frequency: 110, clarity: 1, rms: 0.2, onset: true }, 0, 110);
  attempt.update({ frequency: null, clarity: 0, rms: 0 }, 80, 110);
  assert.equal(attempt.update({ frequency: null, clarity: 0, rms: 0 }, 120, 110).type, 'muted');
  attempt.reset();
  let outcome;
  for (let t = 0; t <= 340; t += 20) outcome = attempt.update({ frequency: 110, clarity: 1, rms: 0.1, onset: t === 0 }, t, 110) || outcome;
  assert.equal(outcome.type, 'right');
});

test('wrong note and wrong octave cannot count as right', () => {
  for (const f of [130.81, 220]) {
    const result = simulateAudio(t => guitarTone(f, 0.3, 0, t * 44.1));
    assert.equal(result.outcome.type, 'wrong');
  }
});

test('skip advances past repeated cards to a different target', () => {
  const session = new PracticeSession([{string: 1, fret: 0}, {string: 1, fret: 0}, {string: 2, fret: 0}]);
  session.skip();
  assert.equal(session.index, 2);
  assert.equal(session.state, 'playing');
});

test('phrase and intro stay at result until next is explicitly called', () => {
  for (const kind of ['phrase', 'intro', 'exercise']) {
    const session = new PracticeSession([{string: 1, fret: 0}, {string: 1, fret: 1}]);
    session.record(false); session.record(true);
    assert.equal(session.index, 0, kind);
    assert.equal(session.state, 'feedback');
    session.next(); session.record(true);
    assert.equal(session.state, 'result');
    assert.equal(session.index, 1);
    assert.equal(session.right, 2);
    assert.equal(session.attempts, 3);
    session.record(true);
    assert.equal(session.state, 'result');
    session.next();
    assert.equal(session.state, 'finished');
  }
});

test('tuner requires half a second and resets after sustained pitch loss', () => {
  const gate = new SteadyPitch(500, 10);
  for (let t = 0; t < 500; t += 20) assert.equal(gate.update({frequency:110,clarity:1}, t), false);
  assert.equal(gate.update({frequency:110,clarity:1}, 500), true);
  assert.equal(gate.update({frequency:null,clarity:0}, 520), false);
  assert.equal(gate.update({frequency:null,clarity:0}, 620), false);
  assert.equal(gate.update({frequency:110,clarity:1}, 640), false);
});


test('retry after success resets the card without inflating the score', () => {
  const session = new PracticeSession([{string:1,fret:0}]);
  session.record(true);
  session.retry();
  assert.equal(session.state, 'playing');
  assert.equal(session.right, 0);
  session.record(true);
  assert.equal(session.right, 1);
  assert.equal(session.attempts, 2);
});

test('held tone cannot trigger a second card without a fresh pick', () => {
  const detector = new PitchDetector();
  let attempt = new NoteAttempt();
  let first;
  for (let t = 0; t <= 400; t += 20) first ||= attempt.update(detector.analyze(guitarTone(110, 0.3, 0, t * 44.1), t), t, 110);
  assert.equal(first.type, 'right');
  attempt = new NoteAttempt();
  for (let t = 420; t <= 1000; t += 20) assert.equal(attempt.update(detector.analyze(guitarTone(110, 0.3, 0, t * 44.1), t), t, 110), null);
});

test('replaying completed lessons preserves saved progress', () => {
  const { LearningProgress } = require('./learning-path.js');
  const saved = new Map();
  global.localStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  const progress = new LearningProgress('test');
  progress.complete('open-strings');
  const replay = new PracticeSession([{string:1,fret:0}]);
  replay.skip(); replay.next();
  assert.deepEqual(new LearningProgress('test').completed, ['open-strings']);
  progress.complete('open-strings');
  assert.deepEqual(new LearningProgress('test').completed, ['open-strings']);
  delete global.localStorage;
});


function appHarness() {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, style: {}, dataset: {}, children: [], disabled: false, value: '70',
      classList: { values: new Set(), add(name) { this.values.add(name); }, remove(name) { this.values.delete(name); }, toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); }, contains(name) { return this.values.has(name); } },
      addEventListener() {}, appendChild(child) { this.children.push(child); },
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      querySelector() { return null; }, scrollIntoView() {}, after() {}
    });
    return elements.get(id);
  };
  let now = 0;
  let scheduled;
  const timers = new Map();
  let timerId = 0;
  const storage = new Map();
  const context = vm.createContext({
    console, Float32Array,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    performance: { now: () => now },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: element, querySelectorAll: () => [], createElement: () => element(Symbol()), createTextNode: text => ({textContent:text}), addEventListener() {} },
    window: { scrollTo() {} }, navigator: {},
    requestAnimationFrame: fn => { scheduled = fn; return 1; },
    cancelAnimationFrame: () => { scheduled = null; }
  });
  for (const file of ['pitch-detection.js', 'tab-parser.js', 'songs.js', 'learning-path.js', 'practice.js', 'app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const app = context.window.__guitarApp;
  return { app, element, context, timers,
    tick() { now += 20; const fn = scheduled; scheduled = null; assert.ok(fn, 'input loop scheduled'); fn(); },
    flushTimer() { const [id, fn] = timers.entries().next().value || []; assert.ok(fn, 'advance scheduled'); timers.delete(id); fn(); }
  };
}

test('app intro keeps feedback visible and opens result only on Next', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, style: {}, dataset: {}, children: [], disabled: false, value: '70',
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, appendChild(child) { this.children.push(child); },
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      querySelector() { return null; }, scrollIntoView() {}, after() {}
    });
    return elements.get(id);
  };
  let now = 0;
  let scheduled;
  const storage = new Map();
  const context = vm.createContext({
    console, Float32Array, setTimeout, clearTimeout,
    performance: { now: () => now },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: element, querySelectorAll: () => [], createElement: () => element(Symbol()), createTextNode: text => ({textContent:text}), addEventListener() {} },
    window: { scrollTo() {} }, navigator: {},
    requestAnimationFrame: fn => { scheduled = fn; return 1; },
    cancelAnimationFrame: () => { scheduled = null; }
  });
  for (const file of ['pitch-detection.js', 'tab-parser.js', 'songs.js', 'learning-path.js', 'practice.js', 'app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const app = context.window.__guitarApp;
  app.analyser = {};
  app.firstRunStep = 4;
  let onset = true;
  app.readAnalysis = () => {
    const target = app.session.cards[app.session.index];
    const note = app.noteDetector.noteAt(target.string, target.fret);
    const frame = {frequency:app.noteDetector.frequencyFor(note.note, note.octave), clarity:1, rms:0.1, onset};
    onset = false;
    return frame;
  };
  app.renderFirstRun();
  for (let card = 0; card < 3; card++) {
    if (card) { onset = true; now += 20; const tick = scheduled; scheduled = null; tick(); }
    while (app.session.state === 'playing') { now += 20; const tick = scheduled; scheduled = null; assert.ok(tick); tick(); }
    assert.equal(element('first-feedback').textContent, 'Right!');
    assert.equal(app.currentScreen, 'onboarding');
    assert.equal(app.session.index, card);
    app.nextFirstRun();
  }
  assert.equal(app.currentScreen, 'achievement');
  assert.equal(app.session.state, 'result');
  assert.match(element('achievement-body').textContent, /3\/3 notes right/);
  assert.equal(app.firstRunStep, 4);
  assert.equal(scheduled, null);
});


test('confidence window tolerates weak frames but requires 75 percent clarity', () => {
  const gate = new SteadyPitch();
  const attempt = new NoteAttempt();
  let passed = false, outcome;
  for (let t = 0; t <= 400; t += 20) {
    const clear = (t / 20) % 5 !== 2;
    const frame = {frequency:clear ? 110 : null, clarity:clear ? 0.85 : 0.3, rms:0.1, onset:t === 0};
    passed ||= gate.update(frame, t);
    outcome ||= attempt.update(frame, t, 110);
  }
  assert.equal(passed, true);
  assert.equal(outcome.type, 'right');
  const weak = new SteadyPitch();
  for (let t = 0; t <= 800; t += 20) assert.equal(weak.update({frequency:110,clarity:t % 40 ? 0.4 : 0.85}, t), false);
});

test('score uses filtered pitch despite raw harmonic glitches', () => {
  const attempt = new NoteAttempt();
  let result;
  for (let t = 0; t <= 320; t += 20) result ||= attempt.update({frequency:110,rawFrequency:220,clarity:0.85,rms:0.1,onset:t === 0}, t, 110);
  assert.equal(result.type, 'right');
  assert.equal(result.frequency, 110);
});

test('scoring falls back to raw pitch only when filtered pitch is absent', () => {
  const attempt = new NoteAttempt();
  let result;
  for (let t = 0; t <= 320; t += 20) result ||= attempt.update({frequency:null,rawFrequency:110,clarity:0.85,rms:0.1,onset:t === 0}, t, 110);
  assert.equal(result.type, 'right');
});

test('brief filtered octave glitches do not become wrong attempts', () => {
  const attempt = new NoteAttempt();
  let result;
  for (let t = 0; t <= 340; t += 20) {
    const frame = {frequency:t === 300 ? 220 : 110, clarity:0.9,rms:0.1,onset:t === 0};
    const outcome = attempt.update(frame, t, 110);
    if (t === 300) assert.equal(outcome, null);
    result ||= outcome;
  }
  assert.equal(result.type, 'right');
});

test('sustained wrong pitch needs a full confidence window', () => {
  const attempt = new NoteAttempt();
  for (let t = 0; t < 300; t += 20) assert.equal(attempt.update({frequency:130.81, clarity:0.85,rms:0.1,onset:t === 0}, t, 110), null);
  assert.equal(attempt.update({frequency:130.81,clarity:0.85,rms:0.1}, 300, 110).type, 'wrong');
});

test('muted disappearance starting at 130 ms confirms beyond the boundary', () => {
  const attempt = new NoteAttempt();
  for (let t = 0; t <= 120; t += 10) assert.equal(attempt.update({frequency:110,clarity:1,rms:0.1,onset:t === 0}, t, 110), null);
  assert.equal(attempt.update({frequency:null,clarity:0,rms:0}, 130, 110), null);
  assert.equal(attempt.update({frequency:null,clarity:0,rms:0}, 150, 110), null);
  assert.equal(attempt.update({frequency:null,clarity:0,rms:0}, 170, 110).type, 'muted');
});

test('notes ringing beyond 150 ms are never marked muted', () => {
  for (const cutoff of [160, 200, 500]) {
    const result = simulateAudio(t => t < cutoff ? guitarTone(110) : silence());
    assert.notEqual(result.outcome?.type, 'muted');
  }
});

test('first-run result hides Home and Home without a profile safely selects a player', () => {
  const {app, element} = appHarness();
  app.practiceKind = 'intro';
  app.session = {right:3,cards:[1,2,3],attempts:3};
  app.practiceResult();
  assert.equal(element('achievement-home').classList.contains('hidden'), true);
  assert.doesNotThrow(() => app.goHome());
  assert.equal(app.currentScreen, 'profile');
  assert.doesNotThrow(() => app.renderHome());
});

test('single-card Skip moves to another exercise and only the last Skip shows result', () => {
  const {app, element} = appHarness();
  app.chooseProfile('QA');
  app.analyser = {};
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  app.startLesson();
  assert.equal(app.session.cards[0].string, 1);
  app.advanceLessonCard();
  assert.equal(app.currentScreen, 'lesson');
  assert.equal(app.exerciseIndex, 1);
  assert.equal(app.session.cards[0].string, 2);
  app.advanceLessonCard();
  assert.equal(app.currentScreen, 'lesson');
  assert.equal(app.session.cards[0].string, 3);
  app.advanceLessonCard();
  assert.equal(app.currentScreen, 'achievement');
  assert.equal(app.progress.completed.length, 0);
  assert.equal(element('achievement-title').textContent, 'Lesson result');
  assert.match(element('achievement-body').textContent, /0\/3 notes right/);
});

test('songs auto-advance inside phrases, pause safely, and stop at phrase result', () => {
  const h = appHarness();
  const {app, element, timers} = h;
  app.analyser = {};
  app.song = {title:'QA',notes:[{string:1,fret:0,note:'E',octave:4,duration:4},{string:1,fret:1,note:'F',octave:4,duration:4}]};
  app.songRange = [0,2];
  app.songResults = {};
  app.show('play');
  let onset = true;
  app.readAnalysis = () => {
    const target = app.session.cards[app.session.index];
    const info = app.noteDetector.noteAt(target.string,target.fret);
    const frame = {frequency:app.noteDetector.frequencyFor(info.note,info.octave),clarity:0.85,rms:0.1,onset};
    onset = false;
    return frame;
  };
  app.startPractice(app.song.notes, 'song');
  while (app.session.state === 'playing') h.tick();
  assert.equal(element('play-feedback').textContent, 'Right!');
  assert.equal(app.session.index, 0);
  app.toggleSong();
  assert.equal(app.playing, false);
  assert.equal(timers.size, 0);
  app.toggleSong();
  h.flushTimer();
  assert.equal(app.session.index, 1);
  assert.equal(app.currentScreen, 'play');
  onset = true;
  while (app.session.state === 'playing') h.tick();
  h.flushTimer();
  assert.equal(app.currentScreen, 'achievement');
  assert.equal(app.session.state, 'result');
  assert.equal(timers.size, 0);
});

test('Whole song result Next continues to following phrase then Home', async () => {
  const {app, element} = appHarness();
  app.chooseProfile('QA');
  app.song = {title:'QA',notes:Array.from({length:4}, () => ({string:1,fret:0,note:'E',octave:4,duration:4}))};
  element('phrase-loop').value = 'all';
  app.setSongRange();
  assert.deepEqual(Array.from(app.songRange), [0,2]);
  app.setupAudio = async () => {app.analyser = {}; return true;};
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  app.startPractice(app.song.notes.slice(0,2), 'song');
  app.session.state = 'result';
  app.practiceResult();
  await app.finishPracticeResult();
  assert.deepEqual(Array.from(app.songRange), [2,4]);
  assert.equal(app.currentScreen, 'play');
  assert.equal(app.session.state, 'playing');
  app.session.state = 'result';
  app.practiceResult();
  await app.finishPracticeResult();
  assert.equal(app.currentScreen, 'home');
});

async function runTests() {
let failures = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}\n  ${error.message}`);
  }
}
console.log(`\n${tests.length - failures}/${tests.length} tests passed`);
process.exitCode = failures ? 1 : 0;

}
runTests().catch(error => { console.error(error); process.exitCode = 1; });
