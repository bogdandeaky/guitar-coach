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


const { SteadyPitch, NoteAttempt, QuietNoteTip, QUIET_NOTE_PEAK, PracticeSession, previewSchedule } = require('./practice.js');

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


function appHarness(initialStorage = {}) {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const elements = new Map();
  const missingIds = new Set();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, style: {}, dataset: {}, children: [], disabled: false, value: '70',
      classList: { values: new Set(), add(name) { this.values.add(name); }, remove(name) { this.values.delete(name); }, toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); }, contains(name) { return this.values.has(name); } },
      addEventListener(type, handler) { this['on' + type] = handler; }, appendChild(child) { this.children.push(child); },
      append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      querySelector() { return null; }, scrollIntoView() {}, after() {}
    });
    return elements.get(id);
  };
  let now = 0;
  let scheduled;
  const timers = new Map();
  let timerId = 0;
  const storage = new Map(Object.entries(initialStorage));
  const context = vm.createContext({
    console, Float32Array,
    setTimeout: (fn, delay) => { fn.delay = delay; timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    performance: { now: () => now },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: id => missingIds.has(id) ? null : element(id), querySelectorAll: () => [], createElement: () => element(Symbol()), createTextNode: text => ({textContent:text}), hidden: false, addEventListener(type, handler) { this['on' + type] = handler; } },
    window: { scrollTo() {} }, navigator: {},
    requestAnimationFrame: fn => { scheduled = fn; return 1; },
    cancelAnimationFrame: () => { scheduled = null; }
  });
  for (const file of ['pitch-detection.js', 'tab-parser.js', 'songs.js', 'learning-path.js', 'practice.js', 'app.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const app = context.window.__guitarApp;
  return { app, element, context, timers, missingIds,
    get pendingFrame() { return scheduled; },
    tick() { now += 20; const fn = scheduled; scheduled = null; assert.ok(fn, 'input loop scheduled'); fn(); },
    flushTimer() { const [id, fn] = timers.entries().next().value || []; assert.ok(fn, 'advance scheduled'); timers.delete(id); fn(); }
  };
}

test('intro and lesson automatically advance notes and stop at one exercise result', () => {
  for (const kind of ['intro', 'lesson']) {
    const h = appHarness();
    const {app, element, timers} = h;
    app.chooseProfile('QA');
    app.firstRunStep = 1;
    app.analyser = {};
    let onset = true, wrong = true;
    app.readAnalysis = () => {
      const target = app.session.cards[app.session.index];
      const info = app.noteDetector.noteAt(target.string, target.fret);
      const frame = {frequency:app.noteDetector.frequencyFor(info.note,info.octave) * (wrong ? 1.2 : 1),clarity:1,rms:0.1,onset};
      onset = false;
      return frame;
    };
    if (kind === 'intro') app.renderFirstRun(); else app.startLesson();
    while (!app.session.attempts) h.tick();
    assert.equal(app.session.index, 0);
    assert.equal(app.session.state, 'playing');
    assert.equal(timers.size, 0);
    wrong = false; onset = true;
    const count = app.session.cards.length;
    let results = 0;
    const result = app.practiceResult.bind(app);
    app.practiceResult = () => { results++; result(); };
    for (let card = 0; card < count; card++) {
      while (app.session.state === 'playing') h.tick();
      assert.equal(app.currentScreen, kind === 'intro' ? 'onboarding' : 'lesson');
      assert.equal(app.session.index, card);
      assert.equal(app.practiceFeedback().textContent, 'Right!');
      if (card === 0) {
        element('pause-practice').onclick();
        assert.equal(timers.size, 0);
        element('pause-practice').onclick();
      }
      h.flushTimer();
      onset = true;
    }
    assert.equal(app.currentScreen, 'achievement');
    assert.equal(results, 1);
    assert.match(element('achievement-body').textContent, new RegExp(`${count}/${count} notes right`));
    assert.equal(app.exerciseIndex, 0);
    assert.equal(timers.size, 0);
  }
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

test('Skip finds a different card and stops at the exercise boundary', () => {
  const {app} = appHarness();
  app.chooseProfile('QA');
  app.analyser = {};
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  app.startLesson();
  app.advanceLessonCard();
  assert.equal(app.session.cards[app.session.index].string, 2);
  assert.equal(app.exerciseIndex, 0);
  app.advanceLessonCard();
  assert.equal(app.currentScreen, 'achievement');
  assert.equal(app.exerciseIndex, 0);
  assert.equal(app.progress.completed.length, 0);
});

test('songs auto-advance inside phrases, pause safely, and stop at phrase result', async () => {
  const h = appHarness();
  const {app, element, timers} = h;
  app.analyser = {};
  app.setupAudio = async () => true;
  await app.openSong({title:'QA',notes:[{string:1,fret:0,note:'E',octave:4,duration:4},{string:1,fret:1,note:'F',octave:4,duration:4}]});
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

test('Whole song defaults on open and flows across all parts to exactly one result', async () => {
  const h = appHarness();
  const {app,element} = h;
  app.chooseProfile('QA');
  app.setupAudio = async () => {app.analyser = {}; return true;};
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  element('phrase-loop').value = '2:4';
  await app.openSong({title:'QA',notes:Array.from({length:4}, (_,i) => ({string:1,fret:i,note:'E',octave:4,duration:4}))});
  assert.equal(element('phrase-loop').value, 'all');
  assert.equal(app.wholeSong, true);
  assert.deepEqual(Array.from(app.songRange), [0,4]);
  assert.match(element('song-part').textContent, /Part 1 of 2.*Whole song/);
  assert.equal(element('song-progress-bar').value, 0);
  app.startPractice(app.song.notes, 'song');
  let results = 0;
  const showResult = app.practiceResult.bind(app);
  app.practiceResult = () => { results++; showResult(); };
  for (let i = 0; i < 4; i++) {
    app.session.record(true);
    app.renderSongProgress();
    assert.equal(element('song-progress-bar').value, i % 2 + 1);
    app.scheduleSongAdvance(); h.flushTimer();
    if (i < 3) assert.equal(app.currentScreen, 'play');
    if (i === 1) {
      assert.match(element('song-part').textContent, /Part 2 of 2/);
      assert.match(element('play-progress').textContent, /2\/4 overall/);
      assert.equal(element('song-progress-bar').value, 0);
      assert.equal(results, 0);
    }
  }
  assert.equal(results, 1);
  assert.equal(app.currentScreen, 'achievement');
  assert.equal(element('achievement-title').textContent, 'Song done');
  assert.match(element('achievement-body').textContent, /4\/4 notes right/);
  await app.finishPracticeResult();
  assert.equal(app.currentScreen, 'home');
});

test('part result names its part and offers Next part, Try again, Play whole song', async () => {
  const h = appHarness();
  const {app,element} = h;
  app.chooseProfile('QA');
  app.setupAudio = async () => {app.analyser = {}; return true;};
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  await app.openSong({title:'QA',notes:Array.from({length:4}, () => ({string:1,fret:0,note:'E',octave:4,duration:4}))});
  element('phrase-loop').value = '0:2'; app.setSongRange();
  app.startPractice(app.song.notes.slice(...app.songRange), 'song');
  for (let i=0;i<2;i++) { app.session.record(true); app.scheduleSongAdvance(); h.flushTimer(); }
  assert.equal(element('achievement-title').textContent, 'Part 1 of 2 done');
  assert.equal(element('result-next').textContent, 'Next part');
  assert.equal(element('result-next').disabled, false);
  assert.equal(element('result-whole-song').classList.contains('hidden'), false);
  const html = require('node:fs').readFileSync('index.html','utf8');
  assert.match(html, /id="result-retry"[^>]*>Try again/);
  await app.retryPractice();
  assert.equal(app.wholeSong, false);
  assert.equal(app.session.index, 0);
  assert.deepEqual(Array.from(app.songRange), [0,2]);
  app.session.state = 'result'; app.practiceResult();
  await app.finishPracticeResult();
  assert.deepEqual(Array.from(app.songRange), [2,4]);
  assert.match(element('song-part').textContent, /Part 2 of 2/);
  app.session.state = 'result'; app.practiceResult();
  assert.equal(element('achievement-title').textContent, 'Part 2 of 2 done');
  assert.equal(element('result-next').disabled, true);
  await element('result-whole-song').onclick();
  assert.equal(app.wholeSong, true);
  assert.equal(app.currentScreen, 'play');
  assert.equal(app.session.cards.length, 4);
  assert.equal(app.session.index, 0);
});

test('learning exercises are substantial and progress across strings, patterns and melodies', () => {
  const {LEARNING_PATH, FIRST_RUN} = require('./learning-path.js');
  const exercises = LEARNING_PATH.flatMap(lesson => lesson.exercises);
  assert.ok(exercises.every(ex => ex.notes.length >= 8 && ex.notes.length <= 12));
  const notes = exercises.flatMap(ex => ex.notes);
  assert.equal(new Set(notes.map(n => n.string)).size, 6);
  assert.ok(Math.max(...notes.map(n => n.fret)) >= 3);
  assert.ok(exercises.some(ex => new Set(ex.notes.map(n => n.string)).size === 2));
  assert.ok(exercises.some(ex => ex.melody));
  assert.equal(LEARNING_PATH.filter(lesson => lesson.starter).length, 4);
  const steps = FIRST_RUN.filter(step => step.type === 'phrase');
  assert.equal(steps.length, 4);
  assert.ok(steps.every(step => step.notes.length >= 8 && step.notes.length <= 12));
  assert.ok(FIRST_RUN.find(step => step.type === 'phrase').notes.length >= 8);
});

test('old progress retains restored lesson IDs and ignores removed or malformed IDs', () => {
  const {LearningProgress} = require('./learning-path.js');
  global.localStorage = { getItem: () => JSON.stringify({completed:['one-fret','removed',null,'familiar-phrase','one-fret']}), setItem() {} };
  try {
    const progress = new LearningProgress('old');
    assert.deepEqual(progress.completed, ['one-fret','familiar-phrase']);
    assert.ok(progress.nextLesson());
    assert.equal(progress.songsUnlocked(), true);
    assert.doesNotThrow(() => progress.complete('removed'));
  } finally { delete global.localStorage; }
});

test('new riffs have exact notes, phrase boundaries and parse through existing JSON format', () => {
  const h = appHarness();
  for (const [id, string, phrases] of [
    ['smoke-on-the-water',3,[[0,3,5],[0,3,6,5],[0,3,5],[3,0]]],
    ['iron-man',6,[[7,10,10,12,12],[15,14,15,14,15,14],[10,10,12,12]]]
  ]) {
    const song = BUILTIN_SONGS.find(song => song.id === id);
    assert.ok(song);
    assert.deepEqual(song.notes.map(n => n.fret), phrases.flat());
    assert.ok(song.notes.every(n => n.string === string));
    const parsed = new TabParser().parseJSON(JSON.stringify(song));
    assert.deepEqual(parsed.notes.map(n => [n.string,n.fret]), song.notes.map(n => [n.string,n.fret]));
    const ranges = h.app.phraseRanges(song.notes);
    assert.deepEqual(Array.from(ranges, range => song.notes.slice(...range).map(n => n.fret)), phrases);
  }
});

test('setup runs once, still obtains mic on later starts, and Redo re-enables setup', async () => {
  const {app, element, context} = appHarness();
  app.chooseProfile('QA');
  let micRequests = 0, checks = 0;
  app.setupAudio = async () => { micRequests++; app.analyser = {}; return true; };
  app.calibrateNoiseFloor = async () => {};
  app.runSoundCheck = () => { checks++; };
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  await app.beginDailySession();
  assert.equal(app.currentScreen, 'sound');
  element('sound-continue').onclick();
  assert.equal(app.currentScreen, 'tuner');
  app.finishTuner(true);
  assert.equal(app.currentScreen, 'lesson');
  assert.equal(context.localStorage.getItem('soundCheckDone'), 'true');
  app.goHome();
  await app.beginDailySession();
  assert.equal(app.currentScreen, 'lesson');
  assert.equal(micRequests, 2);
  assert.equal(checks, 1);
  element('open-settings').onclick();
  assert.equal(app.currentScreen, 'settings');
  await element('redo-sound-check').onclick();
  assert.equal(app.currentScreen, 'sound');
  assert.equal(context.localStorage.getItem('soundCheckDone'), 'false');
  assert.equal(checks, 2);
});

test('header Tuner returns home or to the same practice card and clears pending advance', async () => {
  const h = appHarness();
  const {app,element,timers} = h;
  app.chooseProfile('QA');
  app.setupAudio = async () => { app.analyser = {}; return true; };
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  await element('nav-tuner').onclick();
  assert.equal(app.currentScreen, 'tuner');
  app.finishTuner();
  assert.equal(app.currentScreen, 'home');
  await app.setupAudio(); app.startLesson();
  const session = app.session;
  session.record(true); app.scheduleSongAdvance();
  assert.equal(timers.size, 1);
  await element('nav-tuner').onclick();
  assert.equal(timers.size, 0);
  assert.equal(app.currentScreen, 'tuner');
  app.finishTuner(true);
  assert.equal(app.currentScreen, 'lesson');
  assert.equal(app.session, session);
  assert.equal(session.index, 0);
  h.flushTimer();
  assert.equal(session.index, 1);
  session.record(true); app.scheduleSongAdvance();
  app.retryCard();
  assert.equal(timers.size, 0);
  session.record(true); app.scheduleSongAdvance();
  app.goHome();
  assert.equal(timers.size, 0);
});

test('every restored intro step advances notes automatically and shows one result per step', async () => {
  const h = appHarness();
  const {app,element} = h;
  app.setupAudio = async () => { app.analyser = {}; return true; };
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  app.firstRunStep = 1; await app.setupAudio(); app.renderFirstRun();
  let results = 0;
  const result = app.practiceResult.bind(app);
  app.practiceResult = () => { results++; result(); };
  for (let step=1;step<=4;step++) {
    const count = app.session.cards.length;
    assert.ok(count >= 8);
    for (let i=0;i<count;i++) {
      app.session.record(true); app.scheduleSongAdvance(); h.flushTimer();
      if (i<count-1) assert.equal(app.currentScreen, 'onboarding');
    }
    assert.equal(results, step);
    assert.equal(app.currentScreen, 'achievement');
    assert.equal(element('achievement-title').textContent, `Step ${step} of 4 done`);
    assert.equal(h.timers.size, 0);
    assert.equal(app.firstRunStep, step);
    await app.finishPracticeResult();
  }
  assert.equal(app.currentScreen, 'onboarding');
  assert.equal(app.firstRunStep, 5);
  h.missingIds.add('first-feedback');
  assert.equal(app.practiceFeedback(), null);
  assert.doesNotThrow(() => app.scheduleSongAdvance());
  assert.doesNotThrow(() => app.stopLoop());
  await assert.doesNotReject(() => element('onboarding-next').onclick());
  assert.equal(app.currentScreen, 'profile');
  assert.equal(app.session, null);
  assert.equal(app.practiceKind, null);
  assert.equal(h.timers.size, 0);
});

test('all songs parse with playable notes and new melodies have verified opening pitches', () => {
  for (const song of BUILTIN_SONGS) {
    const parsed = new TabParser().parseJSON(JSON.stringify(song));
    assert.equal(parsed.notes.length, song.notes.length, song.title);
    assert.ok(parsed.notes.every(n => n.string >= 1 && n.string <= 6 && n.fret >= 0 && n.fret <= 24));
    for (const n of song.notes) {
      const actual = new NoteDetector().noteAt(n.string,n.fret);
      assert.equal(`${n.note}${n.octave}`, `${actual.note}${actual.octave}`, song.title);
    }
    if (song.pitchPhrases) {
      assert.ok(song.notes.every(n => n.fret <= 5));
      const h = appHarness();
      const actual = Array.from(h.app.phraseRanges(song.notes), range => song.notes.slice(...range).map(n => `${n.note}${n.octave}`).join(' '));
      assert.deepEqual(actual, song.pitchPhrases);
    }
  }
  for (const [id,pitches] of [
    ['ode-to-joy','E4 E4 F4 G4 G4 F4 E4 D4'],
    ['mary-had-a-little-lamb','E4 D4 C4 D4 E4 E4 E4'],
    ['seven-nation-army','E3 E3 G3 E3 D3 C3 B2']
  ]) {
    const song = BUILTIN_SONGS.find(s => s.id === id);
    assert.ok(song);
    const end = song.notes.findIndex(n => n.phraseEnd) + 1;
    assert.equal(song.notes.slice(0,end).map(n => `${n.note}${n.octave}`).join(' '), pitches);
  }
});

test('pending microphone setup cannot override navigation and stops late streams', async () => {
  for (const kind of ['persisted lesson', 'first sound check', 'standalone tuner', 'song']) {
    const h = appHarness();
    const {app,context,element} = h;
    app.chooseProfile('QA');
    if (kind === 'persisted lesson') context.localStorage.setItem('soundCheckDone','true');
    let resolveMic, stopped = 0, connected = 0;
    const track = {stop() { stopped++; }, getSettings() {return {};}};
    const stream = {getTracks:() => [track],getAudioTracks:() => [track]};
    context.navigator.mediaDevices = {getUserMedia:() => new Promise(resolve => { resolveMic = resolve; })};
    app.audioContext = {state:'running',sampleRate:44100,
      createMediaStreamSource() { connected++; return {connect() {}}; },
      createAnalyser() { return {fftSize:4096}; }
    };
    const pending = kind === 'standalone tuner' ? app.openStandaloneTuner()
      : kind === 'song' ? app.openSong(BUILTIN_SONGS[0]) : app.beginDailySession();
    assert.equal(typeof resolveMic, 'function');
    element('open-settings').onclick();
    resolveMic(stream);
    await pending;
    assert.equal(app.currentScreen, 'settings', kind);
    assert.equal(stopped, 1, kind);
    assert.equal(connected, 0, kind);
    assert.equal(app.stream, null, kind);
    assert.equal(app.analyser, null, kind);
    assert.equal(app.inputReady, false, kind);
    assert.ok(h.pendingFrame == null, kind);
  }
});

test('a newer audio operation wins without an older permission result stopping its stream', async () => {
  const {app,context} = appHarness();
  app.chooseProfile('QA');
  context.localStorage.setItem('soundCheckDone','true');
  const requests = [];
  context.navigator.mediaDevices = {getUserMedia:() => new Promise(resolve => requests.push(resolve))};
  app.audioContext = {state:'running',sampleRate:44100,
    createMediaStreamSource:() => ({connect() {}}),
    createAnalyser:() => ({fftSize:4096,getFloatTimeDomainData(buffer) {buffer.fill(0);}})
  };
  let oldStopped = 0, newStopped = 0;
  const oldTrack = {stop() {oldStopped++;},getSettings:() => ({})};
  const newTrack = {stop() {newStopped++;},getSettings:() => ({})};
  const oldStream = {getTracks:() => [oldTrack],getAudioTracks:() => [oldTrack]};
  const newStream = {getTracks:() => [newTrack],getAudioTracks:() => [newTrack]};
  const lesson = app.beginDailySession();
  const tuner = app.openStandaloneTuner();
  requests[1](newStream); await tuner;
  assert.equal(app.currentScreen, 'tuner');
  requests[0](oldStream); await lesson;
  assert.equal(app.currentScreen, 'tuner');
  assert.equal(app.stream, newStream);
  assert.equal(oldStopped, 1);
  assert.equal(newStopped, 0);
});

test('leaving calibration cancels its frame and promise without touching a cleared analyser', async () => {
  const h = appHarness();
  const {app} = h;
  app.chooseProfile('QA');
  let reads = 0, checks = 0, cancelled, entered;
  const calibrationStarted = new Promise(resolve => { entered = resolve; });
  app.setupAudio = async () => {
    app.analyser = {getFloatTimeDomainData(buffer) { reads++; buffer.fill(0); }};
    app.buffer = new Float32Array(4096);
    return true;
  };
  const calibrate = app.calibrateNoiseFloor.bind(app);
  app.calibrateNoiseFloor = async token => { const pending = calibrate(token); entered(); cancelled = await pending; return cancelled; };
  app.runSoundCheck = () => {checks++;};
  const pending = app.beginDailySession();
  await calibrationStarted;
  assert.equal(app.currentScreen, 'sound');
  assert.equal(reads, 1);
  const staleFrame = h.pendingFrame;
  assert.equal(typeof staleFrame, 'function');
  app.show('settings');
  assert.equal(app.analyser, null);
  assert.equal(h.pendingFrame, null);
  assert.equal(app.calibrationRaf, null);
  assert.doesNotThrow(() => staleFrame());
  await pending;
  assert.equal(cancelled, false);
  assert.equal(app.pitchDetector.calibrating, false);
  assert.equal(app.pitchDetector.calibrationRms.length, 0);
  assert.equal(reads, 1);
  assert.equal(checks, 0);
  assert.equal(app.calibrated, false);
  assert.equal(app.currentScreen, 'settings');
});

test('navigation during AudioContext resume cancels setup before requesting the mic', async () => {
  const {app,context} = appHarness();
  app.chooseProfile('QA');
  context.localStorage.setItem('soundCheckDone','true');
  let resume, requests = 0;
  context.navigator.mediaDevices = {getUserMedia() {requests++; throw new Error('must not request');}};
  app.audioContext = {state:'suspended',sampleRate:44100,resume:() => new Promise(resolve => {resume = resolve;})};
  const pending = app.beginDailySession();
  app.show('settings');
  resume(); await pending;
  assert.equal(app.currentScreen, 'settings');
  assert.equal(requests, 0);
  assert.equal(app.stream, null);
});

test('calibration still finishes normally after 700ms', async () => {
  const h = appHarness();
  const {app} = h;
  app.show('sound');
  app.analyser = {getFloatTimeDomainData(buffer) {buffer.fill(0);}};
  app.buffer = new Float32Array(4096);
  const pending = app.calibrateNoiseFloor();
  for (let i=0;i<35;i++) h.tick();
  assert.equal(await pending, true);
  assert.equal(app.calibrated, true);
  assert.equal(app.calibrationRaf, null);
  assert.equal(app.calibrationResolve, null);
});

test('every built-in difficulty follows its maximum fret', () => {
  for (const song of BUILTIN_SONGS) {
    const max = Math.max(...song.notes.map(note => note.fret));
    assert.equal(song.difficulty, max <= 5 ? 'beginner' : max <= 7 ? 'intermediate' : 'harder', song.title);
  }
});

test('noise floor survives reload, clamps finite values and resets invalid saves', async () => {
  for (const [stored, expected] of [[undefined,0.003],['0.009',0.009],['0',0.0015],['1',0.02],['NaN',0.003],['Infinity',0.003],['oops',0.003],['',0.003]]) {
    const h = appHarness(stored === undefined ? {} : {noiseFloor:stored});
    assert.equal(h.app.pitchDetector.noiseFloor, expected);
    if (stored !== undefined) assert.equal(Number(h.context.localStorage.getItem('noiseFloor')), expected);
  }
  const h = appHarness({noiseFloor:'0.019'});
  h.app.show('sound');
  h.app.analyser = {getFloatTimeDomainData(buffer) {buffer.fill(0.004);}};
  h.app.buffer = new Float32Array(4096);
  const pending = h.app.calibrateNoiseFloor();
  for (let i=0;i<35;i++) h.tick();
  assert.equal(await pending, true);
  const saved = h.context.localStorage.getItem('noiseFloor');
  assert.ok(Math.abs(Number(saved) - 0.0088) < 0.00001);
  assert.equal(appHarness({noiseFloor:saved}).app.pitchDetector.noiseFloor, Number(saved));
});

function lessonFixture(h, exerciseCount = 1) {
  const {app} = h;
  app.chooseProfile('QA');
  app.analyser = {};
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  const original = require('./learning-path').LEARNING_PATH[0];
  const cards = Array.from({length:5}, (_,i) => ({string:1,fret:i}));
  app.selectedLesson = {...original, exercises:Array.from({length:exerciseCount}, () => ({type:'phrase',notes:cards}))};
  app.startLesson();
}

function finishCards(h, right) {
  for (let i=0;i<5;i++) {
    if (i < right) { h.app.session.record(true); h.app.scheduleSongAdvance(); h.flushTimer(); }
    else h.app.advanceLessonCard();
  }
}

test('80 percent saves before result, retries do not lower completion, and Home retains it', async () => {
  for (const right of [3,4,5]) {
    const h = appHarness(); lessonFixture(h);
    // Wrong attempts are retryable and are not the completion denominator.
    h.app.session.record(false); h.app.session.record(false);
    finishCards(h, right);
    assert.equal(h.app.currentScreen, 'achievement');
    assert.equal(h.app.lessonPassed, right >= 4);
    assert.equal(h.app.progress.completed.includes(h.app.lesson.id), right >= 4);
    assert.equal(h.element('result-next').classList.contains('hidden'), right < 4);
    if (right >= 4) {
      const saved = JSON.parse(h.context.localStorage.getItem('guitar-progress-QA'));
      assert.ok(saved.completed.includes(h.app.lesson.id));
      assert.match(h.element('next-session').textContent, /^Next up:/);
      h.app.setupAudio = async () => { h.app.analyser = {}; return true; };
      h.context.localStorage.setItem('soundCheckDone','true');
      await h.app.finishPracticeResult();
      assert.equal(h.app.lesson.id, require('./learning-path').LEARNING_PATH[1].id);
    } else assert.equal(h.element('next-session').textContent, 'Try again to unlock the next one');
    h.app.goHome();
    assert.equal(h.app.progress.completed.includes('open-strings'), right >= 4);
  }
  const h = appHarness(); lessonFixture(h);
  h.app.progress.complete(h.app.lesson.id);
  finishCards(h, 3);
  assert.ok(h.app.progress.completed.includes(h.app.lesson.id));
});

test('multiple exercises flow inline and produce one combined lesson result', () => {
  const h = appHarness(); lessonFixture(h, 2);
  finishCards(h, 3);
  assert.equal(h.app.currentScreen, 'lesson');
  assert.match(h.app.practiceFeedback().textContent, /3\/5/);
  assert.equal([...h.timers.values()][0].delay, 1000);
  h.flushTimer();
  assert.equal(h.app.exerciseIndex, 1);
  finishCards(h, 5);
  assert.equal(h.app.currentScreen, 'achievement');
  assert.match(h.element('achievement-body').textContent, /8\/10 notes right/);
  assert.ok(h.app.progress.completed.includes(h.app.lesson.id));
  assert.equal(h.timers.size, 0);
});

test('inline transition and 600 ms green flash cannot advance after navigation or twice', () => {
  const h = appHarness(); lessonFixture(h, 2);
  h.app.session.record(true); h.app.scheduleSongAdvance();
  const stale = [...h.timers.values()][0];
  assert.equal(stale.delay, 600);
  assert.equal(h.app.practiceFeedback().classList.contains('right-flash'), true);
  h.app.scheduleSongAdvance();
  assert.equal(h.timers.size, 1);
  stale(); assert.equal(h.app.session.index, 0);
  h.flushTimer(); assert.equal(h.app.session.index, 1);
  for (let i=1;i<5;i++) { h.app.session.record(true); h.app.scheduleSongAdvance(); h.flushTimer(); }
  const transition = [...h.timers.values()][0];
  h.app.show('settings');
  assert.equal(h.timers.size, 0);
  transition(); assert.equal(h.app.exerciseIndex, 0);
  assert.equal(h.app.currentScreen, 'settings');
});

test('unclear and stopped-too-fast sounds are neutral and do not add wrong attempts', () => {
  for (const type of ['unclear','muted']) {
    const h = appHarness(); lessonFixture(h);
    h.app.attempt = {update:() => ({type})};
    h.tick();
    assert.equal(h.app.session.attempts, 0);
    assert.equal(h.app.session.right, 0);
    assert.equal(h.app.practiceFeedback().className, 'feedback neutral');
    assert.doesNotMatch(h.app.practiceFeedback().textContent, /Not quite/);
  }
});

test('Redo sound check recalibrates even if this audio session was already calibrated', async () => {
  const h = appHarness({noiseFloor:'0.019',soundCheckDone:'true'});
  h.app.chooseProfile('QA');
  h.app.calibrated = true;
  h.app.setupAudio = async () => { h.app.analyser = {}; return true; };
  let checks = 0;
  h.app.calibrateNoiseFloor = async () => { checks++; return true; };
  h.app.runSoundCheck = () => {};
  await h.element('redo-sound-check').onclick();
  assert.equal(checks, 1);
  assert.equal(h.app.currentScreen, 'sound');
});

test('last lesson offers songs and the standalone pick SVG matches the inline drawing', async () => {
  const h = appHarness(); lessonFixture(h);
  const last = require('./learning-path').LEARNING_PATH.at(-1);
  h.app.lesson.id = last.id;
  finishCards(h,5);
  assert.match(h.element('next-session').textContent, /All lessons done/);
  await h.app.finishPracticeResult();
  assert.equal(h.app.currentScreen, 'songs');
  const svg = require('node:fs').readFileSync('pick-grip.svg','utf8').replace(/\r/g, '').trim();
  assert.ok(h.app.pickDrawing().includes(svg));
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
});

test('note labels include solfege for every chromatic note and clear string names', () => {
  const {noteLabel, stringLabel} = require('./practice');
  const letters = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const names = ['do','do#','re','re#','mi','fa','fa#','sol','sol#','la','la#','si'];
  letters.forEach((note, i) => assert.equal(noteLabel(note), `${note} (${names[i]})`));
  assert.equal(stringLabel(1), 'String 1 (thin high E)');
  assert.equal(stringLabel(6), 'String 6 (thick low E)');
});

test('rendered lesson and song cards separate note letters from octaves', () => {
  const h = appHarness(); lessonFixture(h);
  const text = node => [node.textContent || '', ...(node.children || []).map(text)].join(' ');
  for (const lesson of require('./learning-path').LEARNING_PATH) {
    h.app.lesson = lesson;
    lesson.exercises.forEach((exercise, index) => {
      h.app.exerciseIndex = index;
      h.app.session = new PracticeSession(h.app.expandedExercise(exercise));
      h.app.session.cards.forEach((_, i) => {
        h.app.session.index = i; h.app.renderLessonCard();
        assert.doesNotMatch(text(h.element('card-string')), /\b[A-G]#?\d\b/);
        assert.match(text(h.element('card-string')), /octave/);
      });
    });
  }
  for (const song of BUILTIN_SONGS) {
    h.app.song = song; h.app.songRange = [0, song.notes.length];
    h.app.songResults = [];
    song.notes.forEach((_, i) => {
      h.app.songIndex = i; h.app.renderSongCard();
      for (const id of ['play-string','play-note']) {
        assert.doesNotMatch(text(h.element(id)), /\b[A-G]#?\d\b/);
        assert.match(text(h.element(id)), /octave/);
      }
    });
  }
});

test('Faster intro has the requested beginner notes and three explicit parts', () => {
  const song = BUILTIN_SONGS.find(song => song.id === 'faster-intro-bogdan');
  assert.ok(song);
  assert.equal(song.notes.length, 22);
  assert.equal(Math.max(...song.notes.map(note => note.fret)), 5);
  assert.equal(song.difficulty, 'beginner');
  assert.equal(song.bpm, 70);
  assert.equal(song.owner, 'Bogdan');
  assert.equal(song.group, "Bogdan's riffs");
  assert.equal(song.youtube, 'https://www.youtube.com/watch?v=NDlMDq0BjXM');
  assert.equal(song.notes.filter(note => note.phraseEnd).length, 3);
  const {app, element} = appHarness();
  assert.equal(JSON.stringify(app.phraseRanges(song.notes)), '[[0,8],[8,15],[15,22]]');
  assert.ok(song.notes.every(note => note.duration === (note.phraseEnd ? 1 : 0.5)));
  app.song = song;
  app.buildPhraseOptions();
  assert.match(element('phrase-loop').innerHTML, /Whole song/);
  assert.deepEqual(element('phrase-loop').children.map(option => option.textContent), ['Part 1 of 3', 'Part 2 of 3', 'Part 3 of 3']);
});

test('Enter Sandman riff has the verified intermediate notes and two explicit parts', () => {
  const song = BUILTIN_SONGS.find(song => song.id === 'enter-sandman-main-bogdan');
  assert.ok(song);
  assert.equal(song.notes.length, 30);
  assert.equal(Math.max(...song.notes.map(note => note.fret)), 7);
  assert.equal(song.difficulty, 'intermediate');
  assert.equal(song.bpm, 70);
  assert.equal(song.owner, 'Bogdan');
  assert.equal(song.group, "Bogdan's riffs");
  assert.equal(song.youtube, 'https://www.youtube.com/watch?v=aUGc0-Poun8');
  assert.match(song.description, /1:14/);
  assert.match(song.description, /8:56/);
  assert.equal(song.notes.filter(note => note.phraseEnd).length, 2);
  const {app, element} = appHarness();
  assert.equal(JSON.stringify(app.phraseRanges(song.notes)), '[[0,14],[14,30]]');
  app.song = song;
  app.buildPhraseOptions();
  assert.match(element('phrase-loop').innerHTML, /Whole song/);
  assert.deepEqual(element('phrase-loop').children.map(option => option.textContent), ['Part 1 of 2', 'Part 2 of 2']);
});

test('Paranoid riff has the verified harder notes and two explicit parts', () => {
  const song = BUILTIN_SONGS.find(song => song.id === 'paranoid-main-bogdan');
  assert.ok(song);
  assert.equal(song.notes.length, 25);
  assert.equal(Math.max(...song.notes.map(note => note.fret)), 14);
  assert.equal(song.difficulty, 'harder');
  assert.equal(song.bpm, 70);
  assert.equal(song.owner, 'Bogdan');
  assert.equal(song.group, "Bogdan's riffs");
  assert.equal(song.youtube, 'https://www.youtube.com/watch?v=jwca7tQZnkQ');
  assert.match(song.description, /0:51/);
  assert.equal(song.notes.filter(note => note.phraseEnd).length, 2);
  const {app, element} = appHarness();
  assert.equal(JSON.stringify(app.phraseRanges(song.notes)), '[[0,9],[9,25]]');
  app.song = song;
  app.buildPhraseOptions();
  assert.match(element('phrase-loop').innerHTML, /Whole song/);
  assert.deepEqual(element('phrase-loop').children.map(option => option.textContent), ['Part 1 of 2', 'Part 2 of 2']);
});

test('owned riffs and their YouTube cards are visible only for the matching profile', () => {
  const {app, element, context} = appHarness({'guitar-profile':'Bogdan'});
  const list = element('built-in-song-list');
  const text = node => [node.textContent || '', node.innerHTML || '', ...(node.children || []).map(text)].join(' ');
  assert.match(text(list), /Faster \(Within Temptation\)/);
  assert.match(text(list), /Bogdan's riffs/);
  const fasterCard = [...list.children].find(card => text(card).includes('Faster (Within Temptation)'));
  assert.ok(fasterCard);
  const link = fasterCard.children[1];
  assert.equal(link.href, 'https://www.youtube.com/watch?v=NDlMDq0BjXM');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener');
  app.chooseProfile('Aron');
  assert.equal(context.localStorage.getItem('guitar-profile'), 'Aron');
  assert.doesNotMatch(text(list), /Faster|Bogdan's riffs|Watch on YouTube/);
  assert.equal(list.children.length, BUILTIN_SONGS.filter(song => !song.owner).length);
  app.chooseProfile('Bogdan');
  assert.match(text(list), /Faster/);
  list.replaceChildren();
  app.progress.songsUnlocked = () => true;
  app.openSongs();
  assert.match(text(list), /Faster/);
  app.profile = 'Aron';
  app.openSongs();
  assert.doesNotMatch(text(list), /Faster|Bogdan's riffs/);
});

test('songs unlock after any completed lesson and remain separate per profile', () => {
  const h = appHarness();
  h.app.chooseProfile('Bogdan');
  assert.equal(h.app.progress.songsUnlocked(), false);
  assert.equal(h.element('songs-status').textContent, 'Unlock after lesson 1');
  h.app.progress.complete('open-strings');
  h.app.renderHome();
  assert.equal(h.app.progress.songsUnlocked(), true);
  assert.equal(h.element('songs-status').textContent, 'Melodies + easy riffs');
  h.app.chooseProfile('Aron');
  assert.equal(h.app.progress.songsUnlocked(), false);
  h.app.chooseProfile('Bogdan');
  assert.equal(h.app.progress.songsUnlocked(), true);
  for (const id of ['familiar-phrase', 'one-fret']) {
    const old = appHarness({'guitar-progress-Aron':JSON.stringify({completed:[id]})});
    old.app.chooseProfile('Aron');
    assert.equal(old.app.progress.songsUnlocked(), true);
    assert.equal(old.app.progress.nextLesson().id, 'open-strings');
  }
});

test('quiet note tip needs two consecutive quiet attempts and appears once per instance', () => {
  const quiet = {type:'unclear',peak:QUIET_NOTE_PEAK - 0.001};
  for (const reset of [
    {type:'right',peak:0.01}, {type:'wrong',peak:0.01},
    {type:'unclear',peak:QUIET_NOTE_PEAK}, {type:'muted',peak:0.2}, {type:'unclear'}
  ]) {
    const tip = new QuietNoteTip();
    assert.equal(tip.update(quiet), false);
    assert.equal(tip.update(reset), false);
    assert.equal(tip.update(quiet), false);
    assert.equal(tip.update({type:'muted',peak:0.01}), true);
    assert.equal(tip.update(quiet), false);
    tip.update({type:'right',peak:0.01});
    assert.equal(tip.update(quiet), false);
    assert.equal(tip.update(quiet), false);
  }
});

test('quiet tip appears only once across lesson exercises and resets for a new lesson', () => {
  const h = appHarness(); lessonFixture(h, 2);
  const {app, element} = h;
  const input = () => {
    app.attempt = {update:() => ({type:'unclear',peak:0.01})};
    h.tick();
  };
  input(); input();
  assert.equal(element('lesson-quiet-tip').classList.contains('hidden'), false);
  const tip = app.quietTip;
  const firstSession = app.session;
  finishCards(h, 5);
  h.flushTimer();
  assert.equal(app.exerciseIndex, 1);
  assert.notEqual(app.session, firstSession);
  assert.equal(app.quietTip, tip);
  input(); input();
  assert.equal(element('lesson-quiet-tip').classList.contains('hidden'), true);
  app.selectedLesson = require('./learning-path').LEARNING_PATH[1];
  app.startLesson();
  assert.notEqual(app.quietTip, tip);
  input();
  assert.equal(element('lesson-quiet-tip').classList.contains('hidden'), true);
  input();
  assert.equal(element('lesson-quiet-tip').classList.contains('hidden'), false);
});

test('song reset hides quiet tip and keeps its once-per-open lifetime across ranges and Retry', async () => {
  const h = appHarness();
  const {app, element} = h;
  app.setupAudio = async () => { app.analyser = {}; return true; };
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  const song = {title:'QA',notes:Array.from({length:4}, () => ({string:1,fret:0,note:'E',octave:4,duration:4}))};
  await app.openSong(song);
  const input = () => {
    app.attempt = {update:() => ({type:'unclear',peak:0.01})};
    h.tick();
  };
  app.startPractice(song.notes, 'song');
  input(); input();
  assert.equal(element('play-quiet-tip').classList.contains('hidden'), false);
  const tip = app.quietTip;
  app.resetSongPhrase();
  assert.equal(element('play-quiet-tip').classList.contains('hidden'), true);
  for (const range of ['0:2', '2:4', 'all']) {
    element('phrase-loop').value = range;
    app.setSongRange();
    app.startPractice(song.notes.slice(...app.songRange), 'song');
    assert.equal(app.quietTip, tip);
    input(); input();
    assert.equal(element('play-quiet-tip').classList.contains('hidden'), true);
  }
  await app.openSong(song);
  assert.notEqual(app.quietTip, tip);
  app.startPractice(song.notes, 'song');
  input(); input();
  assert.equal(element('play-quiet-tip').classList.contains('hidden'), false);
});

test('quiet tip stays shown once across intro phrases and resets for a new intro run', () => {
  const h = appHarness();
  const {app, element} = h;
  app.analyser = {};
  app.readAnalysis = () => ({frequency:null,clarity:0,rms:0});
  app.firstRunStep = 1;
  app.renderFirstRun();
  const input = () => {
    app.attempt = {update:() => ({type:'unclear',peak:0.01})};
    h.tick();
  };
  input(); input();
  assert.equal(element('first-quiet-tip').classList.contains('hidden'), false);
  const tip = app.quietTip;
  app.firstRunStep = 2;
  app.renderFirstRun();
  assert.equal(app.quietTip, tip);
  input(); input();
  assert.equal(element('first-quiet-tip').classList.contains('hidden'), true);
  app.firstRunStep = 1;
  app.renderFirstRun();
  assert.notEqual(app.quietTip, tip);
  input(); input();
  assert.equal(element('first-quiet-tip').classList.contains('hidden'), false);
});

test('NoteAttempt includes maximum rms with each unchanged result type', () => {
  for (const type of ['right','wrong','unclear','muted']) {
    const attempt = new NoteAttempt();
    const frame = {frequency:type === 'unclear' ? null : 110,clarity:type === 'unclear' ? 0 : 1,rms:0.02,onset:true};
    let result = attempt.update(frame, 0, type === 'wrong' ? 220 : 110);
    for (let t=20;t<=1840 && !result;t+=20) {
      const next = type === 'muted' ? {frequency:null,clarity:0,rms:0} : {...frame,onset:false,rms:0.01};
      result = attempt.update(next, t, type === 'wrong' ? 220 : 110);
    }
    assert.equal(result.type, type);
    assert.equal(result.peak, 0.02);
    assert.equal(attempt.update(frame, 2000, 110), null);
  }
});

test('quiet hints are separate from feedback in lesson, song and intro and clear on right or navigation', () => {
  for (const kind of ['lesson','song','intro']) {
    const h = appHarness(); lessonFixture(h);
    const {app,element} = h;
    app.practiceKind = kind;
    app.songResults = []; app.songIndex = 0;
    app.renderSongProgress = () => {};
    const id = kind === 'intro' ? 'first-quiet-tip' : kind === 'song' ? 'play-quiet-tip' : 'lesson-quiet-tip';
    const input = type => {
      app.attempt = {update:() => ({type,peak:0.01})};
      h.tick();
    };
    input('unclear');
    assert.equal(element(id).classList.contains('hidden'), true);
    input('muted');
    assert.equal(element(id).classList.contains('hidden'), false);
    assert.equal(element(id).textContent, 'Notes sound quiet. Move the phone a little closer to the amp or turn the volume up a bit.');
    assert.match(app.practiceFeedback().textContent, /stopped too fast/);
    assert.equal(app.session.attempts, 0);
    input('right');
    assert.equal(element(id).classList.contains('hidden'), true);
    assert.equal(app.practiceFeedback().textContent, 'Right!');
    element(id).classList.remove('hidden');
    app.show('settings');
    assert.equal(element(id).classList.contains('hidden'), true);
  }
  const h = appHarness(); lessonFixture(h);
  h.element('lesson-quiet-tip').classList.remove('hidden');
  h.app.preparePracticeCard();
  assert.equal(h.element('lesson-quiet-tip').classList.contains('hidden'), true);
});

test('sound skip cancels calibration or listening and opens the same guided tuner route', async () => {
  for (const route of ['lesson','intro','home']) for (const phase of ['calibration','listening']) {
    const h = appHarness({noiseFloor:'0.019'});
    const {app,context,element} = h;
    app.chooseProfile('Bogdan');
    app.calibrated = phase === 'listening';
    app.setupAudio = async () => {
      app.analyser = {getFloatTimeDomainData(buffer) {buffer.fill(0.004);}};
      app.buffer = new Float32Array(4096);
      return true;
    };
    let writes = 0;
    const save = context.localStorage.setItem;
    context.localStorage.setItem = (key,value) => { if (key === 'noiseFloor') writes++; save(key,value); };
    let entered;
    const ready = new Promise(resolve => {entered = resolve;});
    const calibrate = app.calibrateNoiseFloor.bind(app);
    app.calibrateNoiseFloor = token => { const pending = calibrate(token); entered(); return pending; };
    const listen = app.runSoundCheck.bind(app);
    app.runSoundCheck = () => {listen(); entered();};
    const pending = app.beginDailySession(route);
    await ready;
    assert.equal(app.currentScreen, 'sound');
    const stale = h.pendingFrame;
    assert.equal(typeof stale, 'function');
    element('sound-skip').onclick();
    assert.equal(app.currentScreen, 'tuner');
    assert.equal(app.tunerGuided, true);
    assert.equal(app.routeAfterTuner, route);
    const tunerFrame = h.pendingFrame;
    stale();
    await pending;
    assert.equal(app.currentScreen, 'tuner');
    assert.equal(h.pendingFrame, tunerFrame);
    assert.equal(app.pitchDetector.noiseFloor, 0.019);
    assert.equal(app.pitchDetector.calibrating, false);
    assert.equal(app.pitchDetector.calibrationRms.length, 0);
    assert.equal(context.localStorage.getItem('noiseFloor'), '0.019');
    assert.equal(context.localStorage.getItem('soundCheckDone'), null);
    assert.equal(writes, 0);
    app.finishSetupRoute = () => {};
    element('tuner-skip').onclick();
    assert.equal(context.localStorage.getItem('soundCheckDone'), 'true');
  }
});

test('sound skip still works after a cancelled microphone setup leaves the sound screen', async () => {
  const h = appHarness();
  let grant, entered;
  const ready = new Promise(resolve => {entered = resolve;});
  h.app.setupAudio = () => new Promise(resolve => {grant = resolve; entered();});
  const pending = h.app.beginDailySession('lesson');
  await ready;
  h.app.show('home');
  grant(true);
  await pending;
  h.app.show('sound');
  h.element('sound-skip').onclick();
  assert.equal(h.app.currentScreen, 'tuner');
  assert.equal(h.app.tunerGuided, true);
  assert.equal(h.app.routeAfterTuner, 'lesson');
});
test('sound skip ignores a stale successful calibration completion', async () => {
  const h = appHarness();
  let complete, entered, checks = 0;
  const ready = new Promise(resolve => {entered = resolve;});
  h.app.setupAudio = async () => true;
  h.app.calibrateNoiseFloor = () => new Promise(resolve => {complete = resolve; entered();});
  h.app.runSoundCheck = () => {checks++;};
  const pending = h.app.beginDailySession('intro');
  await ready;
  h.element('sound-skip').onclick();
  complete(true);
  await pending;
  assert.equal(h.app.currentScreen, 'tuner');
  assert.equal(h.app.routeAfterTuner, 'intro');
  assert.equal(checks, 0);
  assert.equal(h.context.localStorage.getItem('noiseFloor'), null);
});

test('sound skip during microphone setup waits for permission and preserves failure behavior', async () => {
  for (const granted of [true,false]) {
    const h = appHarness();
    h.app.chooseProfile('Bogdan');
    let complete;
    h.app.setupAudio = () => new Promise(resolve => {complete = resolve;});
    const pending = h.app.beginDailySession('home');
    h.element('sound-skip').onclick();
    assert.equal(h.app.currentScreen, 'sound');
    complete(granted);
    await pending;
    assert.equal(h.app.currentScreen, granted ? 'tuner' : 'home');
    assert.equal(h.app.routeAfterTuner, 'home');
    assert.equal(h.context.localStorage.getItem('soundCheckDone'), null);
    assert.equal(h.context.localStorage.getItem('noiseFloor'), null);
  }
});

function fakeAudioContext(currentTime = 0) {
  const oscillators = [];
  const gains = [];
  const context = {
    state: 'running',
    sampleRate: 44100,
    currentTime,
    destination: { name: 'destination' },
    oscillators,
    gains,
    suspend() { this.state = 'suspended'; return Promise.resolve(); },
    createOscillator() {
      const oscillator = {
        type: 'sine',
        frequency: {
          value: 0,
          events: [],
          setValueAtTime(value, time) { this.value = value; this.events.push({ value, time }); }
        },
        connect(node) { this.connected = node; return node; },
        start(time) {
          this.started = time === undefined ? context.currentTime : time;
          this.startCalls.push(this.started);
        },
        stop(time) { this.stopped = time; this.stopCalls.push(time); },
        disconnect() { this.disconnected = true; },
        startCalls: [],
        stopCalls: []
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createGain() {
      const gain = {
        gain: {
          value: 1,
          events: [],
          setValueAtTime(value, time) { this.value = value; this.events.push({ method: 'setValueAtTime', value, time }); },
          exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push({ method: 'exponentialRampToValueAtTime', value, time }); },
          linearRampToValueAtTime(value, time) { this.value = value; this.events.push({ method: 'linearRampToValueAtTime', value, time }); }
        },
        connect(node) { this.connected = node; return node; },
        disconnect() { this.disconnected = true; }
      };
      gains.push(gain);
      return gain;
    }
  };
  return context;
}

function rightPitchFrames(app) {
  let onset = true;
  return () => {
    const target = app.session.cards[app.session.index];
    const info = app.noteDetector.noteAt(target.string, target.fret);
    const frame = { frequency: app.noteDetector.frequencyFor(info.note, info.octave), clarity: 0.9, rms: 0.1, onset };
    onset = false;
    return frame;
  };
}

test('previewSchedule places noteAt frequencies on beat boundaries', () => {
  const notes = [
    { string: 6, fret: 0, duration: 1 },
    { string: 1, fret: 3, duration: 2 },
    { string: 3, fret: 2 }
  ];
  const bpm = 100;
  const schedule = previewSchedule(notes, bpm);
  const detector = new NoteDetector();
  const beat = 60 / bpm;
  let start = 0;
  notes.forEach((note, index) => {
    const beats = Number(note.duration) > 0 ? Number(note.duration) : 1;
    const info = detector.noteAt(note.string, note.fret);
    assert.equal(schedule[index].frequency, detector.frequencyFor(info.note, info.octave));
    assert.equal(schedule[index].start, start);
    assert.equal(schedule[index].duration, beats * beat);
    start += beats * beat;
  });
  assert.ok(Math.abs((schedule[1].start - schedule[0].start) - beat) < 1e-9);
  assert.ok(Math.abs((schedule[2].start - schedule[1].start) - 2 * beat) < 1e-9);
});

test('hear it first during auto-advance re-arms advance and listening', async () => {
  {
    const h = appHarness();
    lessonFixture(h);
    const { app, element } = h;
    app.audioContext = fakeAudioContext(0);
    app.session.record(true);
    app.scheduleSongAdvance();
    assert.equal(app.session.state, 'feedback');
    assert.equal([...h.timers.values()][0].delay, 600);
    assert.equal(h.pendingFrame, null);
    element('hear-lesson').onclick();
    assert.equal(h.timers.size, 1);
    assert.equal(h.pendingFrame, null);
    h.flushTimer();
    assert.equal([...h.timers.values()][0].delay, 600);
    h.flushTimer();
    assert.equal(app.session.index, 1);
    assert.equal(app.session.state, 'playing');
    assert.equal(typeof h.pendingFrame, 'function');
  }
  {
    const h = appHarness();
    const { app, element } = h;
    const notes = [
      { string: 1, fret: 0, note: 'E', octave: 4, duration: 1 },
      { string: 1, fret: 1, note: 'F', octave: 4, duration: 1 },
      { string: 1, fret: 3, note: 'G', octave: 4, duration: 1 }
    ];
    app.setupAudio = async () => true;
    app.analyser = {};
    app.audioContext = fakeAudioContext(0);
    await app.openSong({ title: 'QA', notes });
    app.startPractice(app.song.notes.slice(...app.songRange), 'song');
    app.session.record(true);
    app.scheduleSongAdvance();
    assert.equal(app.session.state, 'feedback');
    assert.equal(app.playing, true);
    element('hear-song').onclick();
    assert.equal(h.pendingFrame, null);
    h.flushTimer();
    h.flushTimer();
    assert.equal(app.session.index, 1);
    assert.equal(app.session.state, 'playing');
    assert.equal(app.playing, true);
    assert.equal(typeof h.pendingFrame, 'function');
  }
});

test('hear it first during exercise transition re-arms the next exercise', () => {
  const h = appHarness();
  lessonFixture(h, 2);
  const { app, element } = h;
  const lessonId = app.lesson.id;
  app.audioContext = fakeAudioContext(0);
  finishCards(h, 5);
  assert.equal(app.exerciseTransition, true);
  assert.equal(app.exerciseIndex, 0);
  assert.equal(app.currentScreen, 'lesson');
  assert.equal([...h.timers.values()][0].delay, 1000);
  assert.ok(!app.progress.completed.includes(lessonId));
  element('hear-lesson').onclick();
  assert.equal(h.timers.size, 1);
  h.flushTimer();
  assert.equal([...h.timers.values()][0].delay, 1000);
  h.flushTimer();
  assert.equal(app.currentScreen, 'lesson');
  assert.equal(app.exerciseIndex, 1);
  assert.equal(app.session.index, 0);
  assert.equal(app.exerciseTransition, false);
  assert.ok(!app.progress.completed.includes(lessonId));
});

test('lesson hear it first stops scoring, then resumes a fresh attempt', () => {
  const h = appHarness();
  lessonFixture(h);
  const { app, element } = h;
  let mics = 0;
  h.context.navigator.mediaDevices = { getUserMedia() { mics++; throw new Error('no mic'); } };
  app.audioContext = fakeAudioContext(2);
  assert.equal(typeof h.pendingFrame, 'function');
  const loop = h.pendingFrame;
  const index = app.session.index;
  const exercise = app.exerciseIndex;
  element('hear-lesson').onclick();
  assert.equal(h.pendingFrame, null);
  assert.equal(element('hear-lesson').textContent, 'Playing…');
  assert.equal(element('hear-lesson').classList.contains('hidden'), false);
  assert.equal(mics, 0);
  const schedule = previewSchedule(app.session.cards, 70);
  assert.equal(app.audioContext.oscillators.length, schedule.length);
  app.audioContext.oscillators.forEach((osc, i) => {
    assert.equal(osc.type, 'triangle');
    assert.equal(osc.frequency.value, schedule[i].frequency);
    assert.equal(osc.started, 2 + schedule[i].start);
  });
  const gain = app.audioContext.gains[0].gain.events;
  assert.equal(gain[1].method, 'exponentialRampToValueAtTime');
  assert.ok(gain[1].value >= 0.12 && gain[1].value <= 0.18);
  assert.equal(gain[2].value, 0.001);
  const timer = [...h.timers.values()][0];
  const last = schedule[schedule.length - 1];
  assert.equal(timer.delay, (last.start + last.duration) * 1000 + 200);
  app.readAnalysis = rightPitchFrames(app);
  for (let i = 0; i < 40; i++) loop();
  assert.equal(app.session.attempts, 0);
  assert.equal(app.session.state, 'playing');
  assert.equal(app.session.index, index);
  assert.equal(app.exerciseIndex, exercise);
  app.pitchDetector.pitchHistory = [440];
  app.pitchDetector.previousAcceptedPitch = 440;
  h.flushTimer();
  assert.equal(app.pitchDetector.pitchHistory.length, 0);
  assert.equal(app.pitchDetector.previousAcceptedPitch, null);
  assert.equal(typeof h.pendingFrame, 'function');
  assert.equal(element('hear-lesson').textContent, 'Hear it first');
  assert.equal(app.session.index, index);
  while (app.session.attempts === 0) h.tick();
  assert.equal(app.session.attempts, 1);
  assert.equal(app.session.state, 'feedback');
});

test('song hear it first before Play previews the part and does not start listening', async () => {
  const h = appHarness();
  const { app, element } = h;
  const notes = [
    { string: 1, fret: 0, note: 'E', octave: 4, duration: 1 },
    { string: 1, fret: 1, note: 'F', octave: 4, duration: 2 },
    { string: 2, fret: 0, note: 'B', octave: 3, duration: 1 }
  ];
  app.setupAudio = async () => true;
  app.analyser = {};
  app.audioContext = fakeAudioContext(5);
  let mics = 0;
  h.context.navigator.mediaDevices = { getUserMedia() { mics++; throw new Error('no mic'); } };
  await app.openSong({ title: 'QA', bpm: 70, notes });
  element('tempo').value = '90';
  element('hear-song').onclick();
  assert.equal(element('hear-song').textContent, 'Playing…');
  assert.equal(element('hear-song').classList.contains('hidden'), false);
  assert.equal(app.session, null);
  assert.equal(app.playing, false);
  assert.equal(element('play-toggle').textContent, 'Play');
  assert.equal(mics, 0);
  const schedule = previewSchedule(notes, 90);
  const beat = 60 / 90;
  assert.equal(app.audioContext.oscillators.length, notes.length);
  app.audioContext.oscillators.forEach((osc, i) => {
    assert.equal(osc.type, 'triangle');
    assert.equal(osc.frequency.value, schedule[i].frequency);
    assert.equal(osc.started, 5 + schedule[i].start);
    assert.equal(osc.connected, app.audioContext.gains[i]);
  });
  assert.ok(Math.abs((app.audioContext.oscillators[1].started - app.audioContext.oscillators[0].started) - beat) < 1e-9);
  assert.ok(Math.abs((app.audioContext.oscillators[2].started - app.audioContext.oscillators[1].started) - 2 * beat) < 1e-9);
  assert.equal(app.audioContext.gains[0].connected, app.audioContext.destination);
  const peak = app.audioContext.gains[0].gain.events.find(event => event.value === 0.15);
  assert.equal(peak.method, 'exponentialRampToValueAtTime');
  const timer = [...h.timers.values()][0];
  const last = schedule[schedule.length - 1];
  assert.equal(timer.delay, (last.start + last.duration) * 1000 + 200);
  const first = app.audioContext.oscillators[0];
  const stale = timer;
  element('hear-song').onclick();
  assert.equal(first.disconnected, true);
  assert.ok(first.stopCalls.includes(undefined));
  assert.equal(element('hear-song').textContent, 'Playing…');
  assert.equal(h.timers.size, 1);
  let resumes = 0;
  const run = app.runPracticeInput.bind(app);
  app.runPracticeInput = () => { resumes++; run(); };
  stale();
  assert.equal(resumes, 0);
  assert.equal(app.session, null);
  assert.ok(h.pendingFrame == null);
  h.flushTimer();
  assert.equal(resumes, 0);
  assert.equal(app.session, null);
  assert.equal(app.playing, false);
  assert.ok(h.pendingFrame == null);
  assert.equal(element('play-toggle').textContent, 'Play');
  assert.equal(element('hear-song').textContent, 'Hear it first');
});

test('song hear it first mid-play pauses scoring and resumes without resetting the index', async () => {
  const h = appHarness();
  const { app, element } = h;
  const notes = [
    { string: 1, fret: 0, note: 'E', octave: 4, duration: 1 },
    { string: 1, fret: 1, note: 'F', octave: 4, duration: 1 },
    { string: 1, fret: 3, note: 'G', octave: 4, duration: 1 }
  ];
  app.setupAudio = async () => true;
  app.analyser = {};
  app.audioContext = fakeAudioContext(0);
  app.readAnalysis = rightPitchFrames(app);
  await app.openSong({ title: 'QA', notes });
  app.startPractice(app.song.notes.slice(...app.songRange), 'song');
  while (app.session.state === 'playing') h.tick();
  h.flushTimer();
  assert.equal(app.session.index, 1);
  const songIndex = app.songIndex;
  const attempts = app.session.attempts;
  app.readAnalysis = () => ({ frequency: null, clarity: 0, rms: 0 });
  const loop = h.pendingFrame;
  element('hear-song').onclick();
  assert.equal(h.pendingFrame, null);
  assert.equal(app.audioContext.oscillators.length, notes.length);
  assert.equal(app.session.index, 1);
  assert.equal(app.songIndex, songIndex);
  assert.equal(app.playing, true);
  assert.equal(element('play-toggle').textContent, 'Pause');
  app.readAnalysis = rightPitchFrames(app);
  for (let i = 0; i < 40; i++) loop();
  assert.equal(app.session.attempts, attempts);
  assert.equal(app.session.state, 'playing');
  assert.equal(app.session.index, 1);
  assert.equal(app.songIndex, songIndex);
  h.flushTimer();
  assert.equal(app.session.index, 1);
  assert.equal(app.songIndex, songIndex);
  assert.equal(app.playing, true);
  assert.equal(typeof h.pendingFrame, 'function');
  while (app.session.state === 'playing') h.tick();
  assert.equal(app.session.attempts, attempts + 1);
  assert.equal(app.session.index, 1);
  assert.equal(app.songIndex, songIndex);
});

test('hear it first cancels on leave, pause, retry, phrase change, and visibility', async () => {
  {
    const h = appHarness();
    lessonFixture(h);
    h.app.audioContext = fakeAudioContext();
    h.element('hear-lesson').onclick();
    const stale = [...h.timers.values()][0];
    const osc = h.app.audioContext.oscillators[0];
    h.app.goHome();
    assert.equal(h.timers.size, 0);
    assert.equal(osc.disconnected, true);
    assert.equal(h.app.audioContext.gains[0].disconnected, true);
    assert.ok(osc.stopCalls.includes(undefined));
    assert.equal(h.element('hear-lesson').textContent, 'Hear it first');
    h.app.pitchDetector.pitchHistory = [99];
    stale();
    assert.deepEqual(h.app.pitchDetector.pitchHistory, [99]);
    assert.equal(h.pendingFrame, null);
    assert.equal(h.app.currentScreen, 'home');
  }
  {
    const h = appHarness();
    lessonFixture(h);
    h.app.audioContext = fakeAudioContext();
    h.element('hear-lesson').onclick();
    const stale = [...h.timers.values()][0];
    h.element('pause-practice').onclick();
    assert.equal(h.app.practicePaused, true);
    assert.equal(h.timers.size, 0);
    assert.equal(h.pendingFrame, null);
    h.app.pitchDetector.pitchHistory = [99];
    stale();
    assert.deepEqual(h.app.pitchDetector.pitchHistory, [99]);
    assert.equal(h.pendingFrame, null);
    assert.equal(h.app.currentScreen, 'lesson');
  }
  {
    const h = appHarness();
    lessonFixture(h);
    h.app.audioContext = fakeAudioContext();
    h.element('hear-lesson').onclick();
    const stale = [...h.timers.values()][0];
    h.element('retry-note').onclick();
    const frame = h.pendingFrame;
    assert.equal(typeof frame, 'function');
    assert.equal(h.timers.size, 0);
    h.app.pitchDetector.pitchHistory = [99];
    stale();
    assert.deepEqual(h.app.pitchDetector.pitchHistory, [99]);
    assert.equal(h.pendingFrame, frame);
    assert.equal(h.app.currentScreen, 'lesson');
  }
  {
    const h = appHarness();
    lessonFixture(h);
    h.app.audioContext = fakeAudioContext();
    h.app.setupAudio = async () => true;
    h.element('hear-lesson').onclick();
    const stale = [...h.timers.values()][0];
    const pending = h.app.retryPractice();
    assert.equal(h.timers.size, 0);
    assert.equal(h.pendingFrame, null);
    h.app.pitchDetector.pitchHistory = [99];
    stale();
    assert.deepEqual(h.app.pitchDetector.pitchHistory, [99]);
    assert.equal(h.pendingFrame, null);
    await pending;
    assert.equal(h.app.currentScreen, 'lesson');
    assert.equal(typeof h.pendingFrame, 'function');
  }
  {
    const h = appHarness();
    h.app.setupAudio = async () => true;
    h.app.audioContext = fakeAudioContext();
    await h.app.openSong({ title: 'QA', notes: [
      { string: 1, fret: 0, note: 'E', octave: 4, duration: 1 },
      { string: 1, fret: 1, note: 'F', octave: 4, duration: 1 }
    ] });
    h.element('hear-song').onclick();
    const stale = [...h.timers.values()][0];
    const osc = h.app.audioContext.oscillators[0];
    h.element('phrase-loop').value = '0:2';
    h.element('phrase-loop').onchange();
    assert.equal(h.timers.size, 0);
    assert.equal(osc.disconnected, true);
    assert.equal(h.app.playing, false);
    assert.equal(h.app.session, null);
    h.app.pitchDetector.pitchHistory = [99];
    stale();
    assert.deepEqual(h.app.pitchDetector.pitchHistory, [99]);
    assert.ok(h.pendingFrame == null);
    assert.equal(h.app.currentScreen, 'play');
  }
  {
    const h = appHarness();
    lessonFixture(h);
    h.app.audioContext = fakeAudioContext();
    h.element('hear-lesson').onclick();
    const stale = [...h.timers.values()][0];
    h.context.document.hidden = true;
    await h.context.document.onvisibilitychange();
    assert.equal(h.timers.size, 0);
    assert.equal(h.app.audioContext.oscillators[0].disconnected, true);
    h.app.pitchDetector.pitchHistory = [99];
    stale();
    assert.deepEqual(h.app.pitchDetector.pitchHistory, [99]);
    assert.equal(h.pendingFrame, null);
    assert.equal(h.app.currentScreen, 'lesson');
  }
});

test('Play during a pre-start preview cancels it and does not let a stale callback start listening', async () => {
  const h = appHarness();
  const { app, element } = h;
  app.setupAudio = async () => true;
  app.analyser = {};
  app.audioContext = fakeAudioContext(0);
  await app.openSong({ title: 'QA', notes: [
    { string: 1, fret: 0, note: 'E', octave: 4, duration: 1 },
    { string: 1, fret: 1, note: 'F', octave: 4, duration: 1 }
  ] });
  element('hear-song').onclick();
  const stale = [...h.timers.values()][0];
  const osc = app.audioContext.oscillators[0];
  element('play-toggle').onclick();
  assert.equal(osc.disconnected, true);
  assert.ok(osc.stopCalls.includes(undefined));
  assert.equal(element('hear-song').textContent, 'Hear it first');
  assert.equal(app.playing, true);
  app.pitchDetector.pitchHistory = [99];
  let resumes = 0;
  const run = app.runPracticeInput.bind(app);
  app.runPracticeInput = () => { resumes++; run(); };
  stale();
  assert.deepEqual(app.pitchDetector.pitchHistory, [99]);
  assert.equal(resumes, 0);
  app.goHome();
});

test('failed or cancelled AudioContext resume does not leave listening stuck', async () => {
  {
    const h = appHarness();
    lessonFixture(h);
    const { app, element } = h;
    let finish;
    const resumed = new Promise((resolve, reject) => { finish = { resolve, reject }; });
    app.audioContext = fakeAudioContext();
    app.audioContext.state = 'suspended';
    app.audioContext.resume = () => resumed;
    element('hear-lesson').onclick();
    assert.equal(h.pendingFrame, null);
    assert.equal(element('hear-lesson').textContent, 'Playing…');
    assert.equal(app.audioContext.oscillators.length, 0);
    finish.reject(new Error('resume failed'));
    await resumed.catch(() => {});
    await Promise.resolve();
    assert.equal(element('hear-lesson').textContent, 'Hear it first');
    assert.equal(app.audioContext.oscillators.length, 0);
    assert.equal(typeof h.pendingFrame, 'function');
  }
  {
    const h = appHarness();
    lessonFixture(h);
    const { app, element } = h;
    let finish;
    const resumed = new Promise((resolve, reject) => { finish = { resolve, reject }; });
    app.audioContext = fakeAudioContext();
    app.audioContext.state = 'suspended';
    app.audioContext.resume = () => resumed;
    element('hear-lesson').onclick();
    assert.equal(element('hear-lesson').textContent, 'Playing…');
    app.goHome();
    assert.equal(element('hear-lesson').textContent, 'Hear it first');
    finish.resolve();
    await resumed;
    await Promise.resolve();
    assert.equal(app.audioContext.oscillators.length, 0);
    assert.equal(h.pendingFrame, null);
    assert.equal(app.currentScreen, 'home');
    assert.equal(element('hear-lesson').textContent, 'Hear it first');
  }
});

const PEDAL_SHIFT_VALUES = [0, -1, -2, -3];

function scoringFrequencyForShift(detector, string, fret, shift) {
  const info = detector.noteAt(string, fret);
  const base = detector.frequencyFor(info.note, info.octave);
  return shift ? base * Math.pow(2, shift / 12) : base;
}

test('missing or invalid pedal shift loads as 0 and only writes the new storage key', () => {
  const h = appHarness({'guitar-profile': 'Bogdan', 'guitar-pedal-shift-Bogdan': 'x'});
  assert.equal(h.app.pedalShift, 0);
  assert.equal(h.element('pedal-shift').value, '0');
  const writes = new Map();
  const original = h.context.localStorage.setItem;
  h.context.localStorage.setItem = (key, value) => {
    writes.set(key, value);
    original(key, value);
  };
  h.app.show('settings');
  h.app.setPedalShift(-2);
  assert.equal(writes.size, 1);
  assert.equal(writes.get('guitar-pedal-shift-Bogdan'), '-2');
  assert.equal(h.context.localStorage.getItem('guitar-pedal-shift-Bogdan'), '-2');
  assert.equal(h.context.localStorage.getItem('noiseFloor'), null);
  assert.equal(h.context.localStorage.getItem('guitar-profile'), 'Bogdan');
});

test('pedal shift is stored per profile and reloads when switching players', () => {
  const h = appHarness({'guitar-profile': 'Bogdan'});
  h.app.setPedalShift(-2);
  h.app.chooseProfile('Aron');
  assert.equal(h.app.pedalShift, 0);
  assert.equal(h.element('pedal-shift').value, '0');
  h.app.setPedalShift(0);
  h.app.chooseProfile('Bogdan');
  assert.equal(h.app.pedalShift, -2);
  assert.equal(h.element('pedal-shift').value, '-2');
  h.context.localStorage.setItem('guitar-pedal-shift-Aron', '-1');
  h.app.chooseProfile('Aron');
  assert.equal(h.app.pedalShift, -1);
});

test('scoring accepts lowered pitches when pedal shift is set and rejects them when off', () => {
  const detector = new NoteDetector();
  const string = 1;
  const fret = 3;
  const written = detector.frequencyFor(detector.noteAt(string, fret).note, detector.noteAt(string, fret).octave);
  const lowered = scoringFrequencyForShift(detector, string, fret, -2);
  const attemptRight = new NoteAttempt();
  let result;
  for (let t = 0; t <= 360; t += 20) {
    result = attemptRight.update({ frequency: lowered, clarity: 1, rms: 0.1, onset: t === 0 }, t, lowered) || result;
  }
  assert.equal(result.type, 'right');
  const attemptShifted = new NoteAttempt();
  result = null;
  for (let t = 0; t <= 360; t += 20) {
    result = attemptShifted.update({ frequency: lowered, clarity: 1, rms: 0.1, onset: t === 0 }, t, scoringFrequencyForShift(detector, string, fret, -2)) || result;
  }
  assert.equal(result.type, 'right');
  const attemptWrittenOnShift = new NoteAttempt();
  result = null;
  for (let t = 0; t <= 360; t += 20) {
    result = attemptWrittenOnShift.update({ frequency: written, clarity: 1, rms: 0.1, onset: t === 0 }, t, scoringFrequencyForShift(detector, string, fret, -2)) || result;
  }
  assert.ok(result && result.type === 'wrong');
  const attemptWrittenOff = new NoteAttempt();
  result = null;
  for (let t = 0; t <= 360; t += 20) {
    result = attemptWrittenOff.update({ frequency: written, clarity: 1, rms: 0.1, onset: t === 0 }, t, written) || result;
  }
  assert.equal(result.type, 'right');
  const attemptLoweredOff = new NoteAttempt();
  result = null;
  for (let t = 0; t <= 360; t += 20) {
    result = attemptLoweredOff.update({ frequency: lowered, clarity: 1, rms: 0.1, onset: t === 0 }, t, written) || result;
  }
  assert.ok(result && result.type === 'wrong');
  const h = appHarness({'guitar-profile': 'QA', 'guitar-pedal-shift-QA': '-2'});
  h.app.loadPedalShift();
  h.app.analyser = {};
  h.app.setupAudio = async () => true;
  const info = h.app.noteDetector.noteAt(string, fret);
  assert.equal(h.app.scoringExpectedFrequency(info.note, info.octave), lowered);
});

test('pedal shift does not change noteAt or preview schedule written pitches', () => {
  const detector = new NoteDetector();
  const note = { string: 2, fret: 5 };
  const before = detector.noteAt(note.string, note.fret);
  const h = appHarness({'guitar-profile': 'Bogdan'});
  for (const shift of PEDAL_SHIFT_VALUES) {
    h.app.setPedalShift(shift);
    assert.deepEqual(detector.noteAt(note.string, note.fret), before);
    const schedule = previewSchedule([note], 70);
    assert.equal(schedule[0].frequency, detector.frequencyFor(before.note, before.octave));
  }
});

test('suggestedShift shows P95 hint when pedal shift mismatches and hides when it matches', async () => {
  const song = { title: 'Fixture', bpm: 70, suggestedShift: -2, notes: [{ string: 1, fret: 0, note: 'E', octave: 4, duration: 1 }] };
  const h = appHarness({'guitar-profile': 'QA'});
  h.app.setupAudio = async () => { h.app.analyser = {}; return true; };
  h.app.setPedalShift(0);
  await h.app.openSong(song);
  const hint = h.element('play-pedal-hint');
  assert.equal(hint.classList.contains('hidden'), false);
  assert.equal(hint.textContent, 'Use your P95 sound');
  h.app.setPedalShift(-2);
  assert.equal(hint.classList.contains('hidden'), true);
  assert.equal(hint.textContent, '');
  await h.app.openSong({ title: 'Plain', bpm: 70, notes: song.notes });
  assert.equal(hint.classList.contains('hidden'), true);
});

test('header groups practice tools and sets narrow-phone tap targets in CSS', () => {
  const fs = require('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('style.css', 'utf8');
  assert.match(html, /class="topbar-tools"[\s\S]*id="pause-practice"[\s\S]*id="nav-tuner"[\s\S]*id="open-settings"/);
  assert.match(css, /\.topbar-tools/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.topbar \.text-button \{[^}]*min-height: 48px/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 600px\)[\s\S]*\.topbar \{[^}]*height: 56px/);
  const captionBaseEnd = Math.max(
    css.indexOf('.string-number { position: absolute'),
    css.indexOf('.fretboard-caption { margin: 6px 0 0 -18px'),
    css.indexOf('.note-octave { font-size: 12px; font-weight: normal'),
  );
  assert.ok(captionBaseEnd >= 0, 'base fretboard caption rules missing');
  const cssAfterCaptionBases = css.slice(captionBaseEnd);
  assert.match(cssAfterCaptionBases, /@media \(max-width: 420px\)[\s\S]*\.string-number \{[^}]*font-size: 14px/);
  assert.match(cssAfterCaptionBases, /@media \(max-width: 420px\)[\s\S]*\.fretboard-caption \{[^}]*font-size: 14px/);
  assert.match(cssAfterCaptionBases, /@media \(max-width: 420px\)[\s\S]*\.note-octave \{[^}]*font-size: 14px/);
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
