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
    document: { getElementById: id => missingIds.has(id) ? null : element(id), querySelectorAll: () => [], createElement: () => element(Symbol()), createTextNode: text => ({textContent:text}), addEventListener() {} },
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
