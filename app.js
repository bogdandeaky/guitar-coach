class GuitarApp {
  constructor() {
    this.noteDetector = new NoteDetector();
    this.pitchDetector = new PitchDetector();
    this.tabParser = new TabParser();
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.buffer = null;
    this.raf = null;
    this.wakeLock = null;
    this.currentScreen = 'onboarding';
    this.profile = localStorage.getItem('guitar-profile');
    this.progress = this.profile ? new LearningProgress(this.profile) : null;
    this.firstRunStep = 0;
    this.routeAfterTuner = 'home';
    this.pausedByInterruption = false;
    this.inputReady = false;
    this.calibrated = false;
    this.lesson = null;
    this.exerciseIndex = 0;
    this.song = null;
    this.songIndex = 0;
    this.songRange = [0, 0];
    this.playing = false;
    this.customSongs = this.readJSON('guitar-custom-songs', []);
    this.cacheElements();
    this.bindEvents();
    this.bindPracticeEvents();
    this.bindVisibility();
    this.renderBuiltInSongs();
    this.renderCustomSongs();
    this.start();
    window.__guitarApp = this;
  }

  cacheElements() {
    this.screens = [...document.querySelectorAll('.screen')];
    const ids = [
      'home-button', 'profile-chip', 'onboarding-content', 'onboarding-next',
      'home-greeting', 'next-lesson-card', 'start-session', 'open-tuner',
      'open-songs', 'open-my-songs', 'switch-profile', 'songs-status',
      'level-fill', 'level-message', 'mic-settings', 'sound-continue',
      'tuner-step', 'tuner-target', 'tuner-note', 'tuner-needle', 'tuner-cents',
      'tuner-string', 'tuner-message', 'tuner-continue', 'tuner-skip',
      'lesson-step', 'lesson-title', 'lesson-tip', 'count-in', 'note-instruction',
      'card-string', 'card-fret', 'card-finger', 'mini-fretboard',
      'lesson-feedback', 'retry-note', 'skip-note', 'built-in-song-list',
      'play-title', 'play-progress', 'play-count-in', 'rhythm-track',
      'play-string', 'play-fret', 'play-note', 'play-duration', 'play-feedback', 'tempo',
      'tempo-output', 'phrase-loop', 'play-toggle', 'play-retry',
      'custom-song-list', 'show-import', 'import-form', 'import-title',
      'import-tab', 'import-error', 'achievement-title', 'achievement-body',
      'next-session', 'achievement-home', 'resume-overlay', 'resume-button'
    ];
    this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  bindEvents() {
    this.el['onboarding-next'].addEventListener('click', () => this.nextFirstRun());
    document.querySelectorAll('[data-profile]').forEach(button => {
      button.addEventListener('click', () => this.chooseProfile(button.dataset.profile));
    });
    this.el['home-button'].addEventListener('click', () => this.goHome());
    this.el['start-session'].addEventListener('click', () => this.beginDailySession());
    this.el['open-tuner'].addEventListener('click', () => this.openStandaloneTuner());
    this.el['open-songs'].addEventListener('click', () => this.openSongs());
    this.el['open-my-songs'].addEventListener('click', () => this.show('my-songs'));
    this.el['switch-profile'].addEventListener('click', () => this.show('profile'));
    this.el['sound-continue'].addEventListener('click', () => this.openGuidedTuner('lesson'));
    this.el['tuner-continue'].addEventListener('click', () => this.finishTuner());
    this.el['tuner-skip'].addEventListener('click', () => this.finishTuner(true));
    this.el['retry-note'].addEventListener('click', () => this.retryCard());
    this.el['skip-note'].addEventListener('click', () => this.advanceLessonCard());
    this.el['tempo'].addEventListener('input', () => {
      this.el['tempo-output'].textContent = `${this.el.tempo.value} BPM`;
    });
    this.el['phrase-loop'].addEventListener('change', () => this.setSongRange());
    this.el['play-toggle'].addEventListener('click', () => this.toggleSong());
    this.el['play-retry'].addEventListener('click', () => this.resetSongPhrase());
    this.el['show-import'].addEventListener('click', () => this.el['import-form'].classList.toggle('hidden'));
    this.el['import-form'].addEventListener('submit', event => this.importTab(event));
    this.el['achievement-home'].addEventListener('click', () => this.goHome());
    this.el['resume-button'].addEventListener('click', () => this.resumeAfterInterruption());
  }

  bindVisibility() {
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) {
        if (this.needsWakeLock()) {
          this.pausedByInterruption = true;
          this.stopLoop();
          this.playing = false;
          if (this.audioContext?.state === 'running') await this.audioContext.suspend();
        }
        return;
      }
      if (this.needsWakeLock()) await this.requestWakeLock();
      if (this.pausedByInterruption) this.el['resume-overlay'].classList.remove('hidden');
    });
  }

  start() {
    if (!localStorage.getItem('guitar-first-win')) {
      this.firstRunStep = 0;
      this.renderFirstRun();
    } else if (!this.profile) {
      this.show('profile');
    } else {
      this.goHome();
    }
  }

  readJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return Array.isArray(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  show(name) {
    this.stopLoop();
    this.currentScreen = name;
    this.screens.forEach(screen => screen.classList.toggle('hidden', screen.id !== `${name}-screen`));
    this.el['home-button'].classList.toggle('hidden', ['profile', 'home'].includes(name) || (name === 'onboarding' && !this.profile));
    this.el['profile-chip'].classList.toggle('hidden', !this.profile || ['onboarding', 'profile'].includes(name));
    if (this.profile) this.el['profile-chip'].textContent = this.profile;
    if (this.needsWakeLock()) this.requestWakeLock();
    else {
      this.releaseWakeLock();
      this.stopAudioInput();
    }
    window.scrollTo(0, 0);
  }

  goHome() {
    this.playing = false;
    this.selectedLesson = null;
    this.show('home');
    this.renderHome();
  }

  chooseProfile(profile) {
    this.profile = profile;
    localStorage.setItem('guitar-profile', profile);
    this.progress = new LearningProgress(profile);
    this.goHome();
  }

  renderHome() {
    if (!this.profile || !this.progress) { this.show('profile'); return; }
    const lesson = this.progress.nextLesson();
    this.renderLearningSteps();
    const completed = this.progress.completed.length;
    this.el['home-greeting'].textContent = `${this.profile}, let’s play.`;
    this.el['next-lesson-card'].innerHTML = `
      <p class="eyebrow">Lesson ${Math.min(completed + 1, LEARNING_PATH.length)} of ${LEARNING_PATH.length}</p>
      <h2>${lesson.title}</h2>
      <p>${lesson.skill}</p>
      <p>One short demonstration, then guided cards at your pace.</p>`;
    const unlocked = this.progress.songsUnlocked();
    this.el['songs-status'].textContent = unlocked ? 'Happy Birthday + Twinkle' : 'Unlock after lesson 4';
    this.el['open-songs'].disabled = !unlocked;
  }

  renderFirstRun() {
    this.show('onboarding');
    this.el['onboarding-next'].classList.remove('hidden');
    const step = FIRST_RUN[this.firstRunStep];
    if (step.type === 'sound') {
      this.el['onboarding-content'].innerHTML = `
        <p class="eyebrow">First setup · 1 minute</p><h1>${step.title}</h1>
        <div class="hint-card"><strong>Before you pick</strong><ul><li>Clean channel and pedal off</li><li>Low-to-medium volume</li><li>Phone 30–50 cm from the amp speaker, bottom edge (microphone) facing the amp. Keep it off the amp, away from talking or TV.</li></ul></div>
        <div class="level-track"><div id="first-level-fill"></div><span class="green-zone"></span></div>
        <p id="first-level-message" class="status-line">Pick one open string and let it ring. Talking or tapping won't count. Tap below to allow the microphone.</p>`;
      this.el['onboarding-next'].textContent = 'Allow microphone';
      this.el['onboarding-next'].disabled = false;
      return;
    }
    if (step.type === 'tuner') {
      this.el['onboarding-content'].innerHTML = `
        <p class="eyebrow">Quick tune</p><h1>Hear the string clearly</h1>
        <article class="tuner-card"><div id="first-tuner-note" class="detected-note">—</div>
        <div class="tuner-gauge"><div class="gauge-center"></div><div id="first-tuner-needle"></div></div>
        <div id="first-tuner-status" class="cents">Start with thick string 6 · E2</div></article>`;
      this.el['onboarding-next'].textContent = 'Skip to first phrase';
      this.el['onboarding-next'].disabled = false;
      this.runFirstTuner();
      return;
    }
    if (step.type === 'phrase') {
        this.el['onboarding-content'].innerHTML = `
        <p class="eyebrow">Your first music</p><h1>${step.title}</h1>
        <p class="lede">Wait-for-me is on. Pick each card once.</p>
        <article class="note-card"><div class="note-directions">
          <div><small>STRING</small><strong id="first-string">1</strong></div>
          <div><small>FRET</small><strong id="first-fret">0</strong></div>
          <div><small>NOTE</small><strong id="first-note">E</strong></div>
        </div><p class="thin-e-reminder">String 1 = thin high E</p>
        <div id="first-feedback" class="feedback neutral">Pick once when ready</div></article>`;
      this.el['onboarding-next'].classList.add('hidden');
      this.pitchDetector.resetTracking();
      this.runFirstPhrase();
      return;
    }
    if (step.type === 'win') {
      localStorage.setItem('guitar-first-win', 'true');
      this.el['onboarding-content'].innerHTML = `
        <div class="achievement-icon">✓</div><p class="eyebrow">First win</p>
        <h1>${step.title}</h1><p class="lede">${step.body}</p>`;
      this.el['onboarding-next'].classList.remove('hidden');
      this.el['onboarding-next'].textContent = 'Choose player';
      this.el['onboarding-next'].disabled = false;
      return;
    }
    this.el['onboarding-content'].innerHTML = `
      <p class="eyebrow">${step.type === 'welcome' ? 'A calm first lesson' : 'One-skill demo'}</p>
      <h1>${step.title}</h1><p class="lede">${step.body}</p>
      ${step.tips ? `<div class="hint-card">${step.tips.map(tip => `<p>✓ ${tip}</p>`).join('')}</div>` : ''}
      ${step.type === 'hold' ? this.pickDrawing() : ''}`;
    this.el['onboarding-next'].textContent = step.type === 'welcome' ? 'Show me how' : 'Check my sound';
    this.el['onboarding-next'].disabled = false;
  }

  async nextFirstRun() {
    const step = FIRST_RUN[this.firstRunStep];
    if (step.type === 'phrase') return this.nextPracticeCard();
    if (step.type === 'sound' && !this.soundPassed) {
      this.el['onboarding-next'].disabled = true;
      const ok = await this.setupAudio();
      if (!ok) { this.el['onboarding-next'].disabled = false; return; }
      await this.calibrateNoiseFloor();
      this.runFirstSoundCheck();
      this.el['onboarding-next'].textContent = 'Sound is good';
      this.el['onboarding-next'].disabled = true;
      return;
    }
    if (step.type === 'win') {
      this.el['onboarding-next'].classList.remove('hidden');
      this.show('profile');
      return;
    }
    this.soundPassed = false;
    this.firstRunStep += 1;
    this.renderFirstRun();
  }

  async setupAudio() {
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone API unavailable');
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      if (this.pitchDetector.sampleRate !== this.audioContext.sampleRate) {
        this.pitchDetector = new PitchDetector(this.audioContext.sampleRate);
        this.calibrated = false;
      }
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 4096;
        this.buffer = new Float32Array(this.analyser.fftSize);
        source.connect(this.analyser);
        this.micSettings = this.stream.getAudioTracks()[0].getSettings();
      }
      this.inputReady = true;
      return true;
    } catch (error) {
      console.error(error);
      alert('Microphone access failed. Use HTTPS (or localhost), allow the mic, then try again.');
      return false;
    }
  }

  async calibrateNoiseFloor() {
    this.pitchDetector.startCalibration();
    const started = performance.now();
    await new Promise(resolve => {
      const sample = () => {
        this.analyser.getFloatTimeDomainData(this.buffer);
        this.pitchDetector.addCalibrationFrame(this.buffer);
        if (performance.now() - started >= 700) resolve();
        else requestAnimationFrame(sample);
      };
      sample();
    });
    this.pitchDetector.finishCalibration();
    this.calibrated = true;
  }

  formatMicSettings() {
    if (!this.micSettings) return '';
    const setting = key => this.micSettings[key] === false ? 'off' : this.micSettings[key] === true ? 'on' : 'not reported';
    return `Mic processing — echo: ${setting('echoCancellation')}, noise suppression: ${setting('noiseSuppression')}, auto gain: ${setting('autoGainControl')}`;
  }

  runFirstSoundCheck() {
    this.listenForSound(document.getElementById('first-level-fill'), document.getElementById('first-level-message'), this.el['onboarding-next']);
  }

  readAnalysis() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return this.pitchDetector.analyze(this.buffer);
  }

  runFirstTuner() {
    this.beginTunerTracking();
    this.listenTuner(true);
  }

  runFirstPhrase() {
    this.startPractice(FIRST_RUN[this.firstRunStep].notes, 'intro');
  }

  async beginDailySession() {
    this.soundPassed = false;
    this.routeAfterTuner = 'lesson';
    this.show('sound');
    const ok = await this.setupAudio();
    if (!ok) return this.goHome();
    this.el['mic-settings'].textContent = this.formatMicSettings();
    this.el['level-message'].textContent = 'Stay quiet for a quick room check…';
    this.el['sound-continue'].disabled = true;
    if (!this.calibrated) await this.calibrateNoiseFloor();
    this.runSoundCheck();
  }

  runSoundCheck() {
    this.listenForSound(this.el['level-fill'], this.el['level-message'], this.el['sound-continue']);
  }

  async openStandaloneTuner() {
    this.routeAfterTuner = 'home';
    const ok = await this.setupAudio();
    if (!ok) return;
    this.openGuidedTuner('home', false);
  }

  openGuidedTuner(route = 'lesson', guided = true) {
    this.routeAfterTuner = route;
    this.tunerGuided = guided;
    this.tunerStringIndex = 0;
    this.beginTunerTracking();
    this.show('tuner');
    this.pitchDetector.resetTracking();
    this.el['tuner-step'].textContent = guided ? 'Step 2 of 3 · guided tuning' : 'Auto tuner';
    this.el['tuner-continue'].textContent = guided ? 'Next string' : 'Done';
    this.renderTunerTarget();
    this.runTuner();
  }

  renderTunerTarget() {
    if (!this.tunerGuided) {
      this.el['tuner-target'].textContent = 'Pick any string';
      return;
    }
    const target = this.noteDetector.guitarStrings[this.tunerStringIndex];
    this.el['tuner-target'].textContent = stringLabel(target.number);
    this.el['tuner-continue'].disabled = true;
  }

  runTuner() {
    this.listenTuner(false);
  }

  finishTuner(skip = false) {
    if (!skip && this.tunerGuided && this.el['tuner-continue'].disabled === false && this.tunerStringIndex < 5) {
      this.tunerStringIndex += 1;
      this.pitchDetector.resetTracking();
      this.tuneGate.reset();
      this.renderTunerTarget();
      return;
    }
    if (this.routeAfterTuner === 'lesson') this.startLesson();
    else this.goHome();
  }

  startLesson() {
    this.lesson = this.selectedLesson || this.progress.nextLesson();
    this.selectedLesson = null;
    this.exerciseIndex = 0;
    this.exerciseResults = [];
    this.exerciseScores = [];
    this.show('lesson');
    this.startExercise();
  }

  expandedExercise(exercise) {
    return exercise.type === 'note' ? [exercise] : exercise.notes;
  }

  currentLessonTarget() {
    return this.session.cards[this.session.index];
  }

  renderLessonCard() {
    const exercise = this.lesson.exercises[this.exerciseIndex];
    const target = this.currentLessonTarget();
    this.el['lesson-step'].textContent = `Card ${this.session.index + 1}/${this.session.cards.length} · exercise ${this.exerciseIndex + 1}/${this.lesson.exercises.length}`;
    this.el['lesson-title'].textContent = this.lesson.title;
    this.el['lesson-tip'].textContent = this.lesson.tip;
    this.el['note-instruction'].textContent = exercise.instruction;
    this.el['card-string'].textContent = stringLabel(target.string);
    const info = this.noteDetector.noteAt(target.string, target.fret);
    const small = document.createElement('small');
    small.className = 'scientific-note';
    small.textContent = `${info.note}${info.octave}`;
    this.el['card-string'].appendChild(small);
    this.el['card-fret'].textContent = target.fret;
    this.el['card-finger'].textContent = target.finger || (target.fret ? target.fret : 'OPEN');
    this.renderFretboard(this.el['mini-fretboard'], target.string, target.fret);
    this.setFeedback(this.el['lesson-feedback'], 'neutral', 'Mute, then pick once and let it ring.');
  }

  renderFretboard(container, activeString, activeFret) {
    container.innerHTML = '';
    for (let string = 1; string <= 6; string += 1) {
      const row = document.createElement('div');
      row.className = 'fret-row';
      for (let fret = 0; fret <= 5; fret += 1) {
        const cell = document.createElement('span');
        cell.className = `fret-cell${string === activeString && fret === activeFret ? ' active' : ''}`;
        row.appendChild(cell);
      }
      container.appendChild(row);
    }
  }

  runLessonInput() { this.runPracticeInput(); }

  advanceLessonCard() {
    this.stopLoop();
    const skipped = this.session.cards[this.session.index];
    this.session.skip();
    if (this.session.state === 'result') {
      this.saveExerciseScore();
      this.exerciseResults[this.exerciseIndex] = false;
      // Skip crosses exercise boundaries rather than presenting a one-card result.
      while (this.exerciseIndex + 1 < this.lesson.exercises.length) {
        this.exerciseIndex++;
        const cards = this.expandedExercise(this.lesson.exercises[this.exerciseIndex]);
        const different = cards.findIndex(card => card.string !== skipped.string || card.fret !== skipped.fret);
        if (different >= 0) {
          this.session = new PracticeSession(cards);
          this.session.index = different;
          this.preparePracticeCard(false);
          return;
        }
        this.exerciseScores[this.exerciseIndex] = {right:0,attempts:0,total:cards.length};
        this.exerciseResults[this.exerciseIndex] = false;
        this.session = new PracticeSession(cards);
        this.session.skip();
      }
      this.practiceResult();
    }
    else this.preparePracticeCard();
  }

  retryCard() {
    this.session.retry();
    this.preparePracticeCard();
  }

  completeLesson() {
    if (this.exerciseResults.every(Boolean)) this.progress.complete(this.lesson.id);
    this.goHome();
  }

  setFeedback(element, type, text) {
    element.className = `feedback ${type}`;
    element.textContent = text;
  }

  renderBuiltInSongs() {
    this.el['built-in-song-list'].innerHTML = '';
    BUILTIN_SONGS.forEach(song => {
      const button = document.createElement('button');
      button.className = 'song-row';
      button.innerHTML = `<div><strong>${song.title}</strong><small>${song.description} · ${song.bpm} BPM</small></div><span>›</span>`;
      button.addEventListener('click', () => this.openSong(song));
      this.el['built-in-song-list'].appendChild(button);
    });
  }

  openSongs() {
    if (!this.progress.songsUnlocked()) return;
    this.show('songs');
  }

  async openSong(song) {
    const ok = await this.setupAudio();
    if (!ok) return;
    this.song = song;
    this.el.tempo.value = song.bpm || 70;
    this.el['tempo-output'].textContent = `${this.el.tempo.value} BPM`;
    this.show('play');
    this.buildPhraseOptions();
    this.setSongRange();
  }

  buildPhraseOptions() {
    const select = this.el['phrase-loop'];
    select.innerHTML = '<option value="all">Whole song</option>';
    const ranges = this.phraseRanges(this.song.notes);
    ranges.forEach((range, index) => {
      const option = document.createElement('option');
      option.value = `${range[0]}:${range[1]}`;
      option.textContent = `Phrase ${index + 1}`;
      select.appendChild(option);
    });
  }

  phraseRanges(notes) {
    const ranges = [];
    let start = 0;
    let beats = 0;
    notes.forEach((note, index) => {
      beats += note.duration || 1;
      if (beats >= 8 || index === notes.length - 1) {
        ranges.push([start, index + 1]);
        start = index + 1;
        beats = 0;
      }
    });
    return ranges;
  }

  setSongRange() {
    const value = this.el['phrase-loop'].value;
    this.wholeSong = value === 'all';
    this.songRange = this.wholeSong ? this.phraseRanges(this.song.notes)[0] : value.split(':').map(Number);
    this.resetSongPhrase();
  }

  resetSongPhrase() {
    this.stopLoop();
    this.playing = false;
    this.songIndex = this.songRange[0];
    this.session = null;
    this.songResults = {};
    this.el['play-toggle'].textContent = 'Play';
    this.el['play-toggle'].disabled = false;
    document.getElementById('song-next').disabled = true;
    this.renderSongTrack();
    this.renderSongCard();
  }

  renderSongTrack() {
    this.el['rhythm-track'].innerHTML = '';
    this.song.notes.slice(this.songRange[0], this.songRange[1]).forEach((note, offset) => {
      const item = document.createElement('div');
      const absolute = this.songRange[0] + offset;
      item.className = `rhythm-note${absolute === this.songIndex ? ' current' : ''}${this.songResults[absolute] ? ` ${this.songResults[absolute]}` : ''}`;
      item.style.width = `${Math.max(44, (note.duration || 1) * 48)}px`;
      item.textContent = `${note.string}·${note.fret}`;
      this.el['rhythm-track'].appendChild(item);
    });
    this.el['rhythm-track'].querySelector('.current')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  renderSongCard() {
    const note = this.song.notes[this.songIndex];
    this.el['play-title'].textContent = this.song.title;
    this.el['play-progress'].textContent = `${this.songIndex - this.songRange[0] + 1}/${this.songRange[1] - this.songRange[0]}`;
    this.el['play-string'].textContent = stringLabel(note.string);
    this.el['play-fret'].textContent = note.fret;
    this.el['play-note'].textContent = `${note.note}${note.octave}`;
    this.el['play-note'].classList.add('scientific-note');
    this.el['play-duration'].textContent = `${note.duration} beat${note.duration === 1 ? '' : 's'} · string 1 is the thin high E`;
  }

  async toggleSong() {
    if (this.playing) {
      this.playing = false;
      this.stopLoop();
      this.el['play-toggle'].textContent = 'Resume';
      return;
    }
    this.playing = true;
    this.el['play-toggle'].textContent = 'Pause';
    if (this.practiceKind === 'song' && this.session) {
      if (this.session.state === 'playing') {
        this.attempt = new NoteAttempt();
        this.runSongInput();
      }
      else this.scheduleSongAdvance();
    } else {
      this.el['play-toggle'].disabled = true;
      await this.countIn(this.el['play-count-in'], Number(this.el.tempo.value));
      this.el['play-toggle'].disabled = false;
      if (!this.playing || this.currentScreen !== 'play') return;
      this.startPractice(this.song.notes.slice(...this.songRange), 'song');
    }
  }

  scheduleSongAdvance() {
    this.stopLoop();
    const session = this.session;
    this.songAdvanceTimer = setTimeout(() => {
      this.songAdvanceTimer = null;
      if (!this.playing || this.currentScreen !== 'play' || this.session !== session) return;
      this.nextPracticeCard();
    }, 180);
  }

  runSongInput() { this.runPracticeInput(); }

  async countIn(element, bpm) {
    element.classList.remove('hidden');
    for (let beat = 4; beat >= 1; beat -= 1) {
      element.textContent = beat;
      this.clickMetronome(beat === 4);
      await new Promise(resolve => setTimeout(resolve, 60000 / bpm));
      if (!this.playing || this.currentScreen !== 'play') break;
    }
    element.classList.add('hidden');
  }

  clickMetronome(accent) {
    if (!this.audioContext) return;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.frequency.value = accent ? 1000 : 720;
    gain.gain.setValueAtTime(0.12, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.045);
    oscillator.connect(gain).connect(this.audioContext.destination);
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.05);
  }

  renderCustomSongs() {
    const list = this.el['custom-song-list'];
    list.innerHTML = this.customSongs.length ? '' : '<p class="lede">No imported songs yet.</p>';
    this.customSongs.forEach(song => {
      const button = document.createElement('button');
      button.className = 'song-row';
      button.innerHTML = `<div><strong>${song.title}</strong><small>${song.notes.length} single notes</small></div><span>›</span>`;
      button.addEventListener('click', () => this.openSong(song));
      list.appendChild(button);
    });
  }

  importTab(event) {
    event.preventDefault();
    try {
      const song = this.tabParser.parseTab(this.el['import-tab'].value, this.el['import-title'].value);
      this.customSongs.push(song);
      localStorage.setItem('guitar-custom-songs', JSON.stringify(this.customSongs));
      this.renderCustomSongs();
      this.el['import-form'].reset();
      this.el['import-form'].classList.add('hidden');
      this.el['import-error'].textContent = '';
    } catch (error) {
      this.el['import-error'].textContent = error.message;
    }
  }

  stopLoop() {
    clearTimeout(this.songAdvanceTimer);
    this.songAdvanceTimer = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  stopAudioInput() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.stream = null;
    this.analyser = null;
    this.buffer = null;
    this.inputReady = false;
    this.calibrated = false;
    this.pitchDetector.resetTracking();
  }

  needsWakeLock() {
    return ['sound', 'tuner', 'lesson', 'play'].includes(this.currentScreen)
      || (this.currentScreen === 'onboarding' && ['sound', 'tuner', 'phrase'].includes(FIRST_RUN[this.firstRunStep]?.type));
  }

  async requestWakeLock() {
    if (!('wakeLock' in navigator) || document.hidden || this.wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      this.wakeLock = lock;
      lock.addEventListener('release', () => {
        if (this.wakeLock === lock) this.wakeLock = null;
      });
    } catch (error) {
      console.info('Wake lock unavailable:', error.message);
    }
  }

  async releaseWakeLock() {
    const lock = this.wakeLock;
    this.wakeLock = null;
    if (lock) {
      try { await lock.release(); } catch { /* already released */ }
    }
  }

  async resumeAfterInterruption() {
    this.el['resume-overlay'].classList.add('hidden');
    this.pausedByInterruption = false;
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
    await this.requestWakeLock();
    if (this.currentScreen === 'tuner') this.runTuner();
    if (this.currentScreen === 'sound') this.runSoundCheck();
    if (this.currentScreen === 'lesson' && this.session?.state === 'playing') this.preparePracticeCard();
    if (this.currentScreen === 'onboarding') {
      const type = FIRST_RUN[this.firstRunStep].type;
      if (type === 'sound') this.runFirstSoundCheck();
      if (type === 'tuner') this.runFirstTuner();
      if (type === 'phrase' && this.session?.state === 'playing') this.preparePracticeCard();
    }
    if (this.currentScreen === 'play') {
      this.playing = false;
      this.toggleSong();
    }
  }
  bindPracticeEvents() {
    document.getElementById('replay-intro').onclick = () => { this.firstRunStep = 0; this.soundPassed = false; this.renderFirstRun(); };
    document.getElementById('lesson-next').onclick = () => this.nextPracticeCard();
    document.getElementById('song-next').onclick = () => this.nextPracticeCard();
    document.getElementById('result-retry').onclick = () => this.retryPractice();
    document.getElementById('result-next').onclick = () => this.finishPracticeResult();
  }

  renderLearningSteps() {
    const list = document.getElementById('learning-steps');
    list.replaceChildren();
    LEARNING_PATH.forEach(lesson => {
      const button = document.createElement('button');
      button.className = 'secondary-button';
      button.textContent = `${this.progress.completed.includes(lesson.id) ? '✓ ' : ''}${lesson.title}`;
      button.onclick = () => { this.selectedLesson = lesson; this.beginDailySession(); };
      list.appendChild(button);
    });
  }

  pickDrawing() {
    return `<figure class="pick-illustration hint-card"><svg viewBox="0 0 520 400" role="img" aria-label="Pick held between thumb pad and side of curled index finger, with 2–3 mm of tip exposed and a slight tilt toward the strings">
      <g stroke="#b8c8bc" stroke-width="3"><path d="M45 315H475M45 337H475M45 359H475"/></g>
      <path d="M150 180 Q105 120 150 90 Q190 65 235 100 L298 157 Q325 192 300 228 Q263 260 226 225 L189 185 Q178 169 190 157 Q204 144 219 161 L254 193" fill="#b98c69" stroke="#ffe0b7" stroke-width="4"/>
      <path d="M221 179 Q245 151 288 173 Q303 185 293 204 L266 268 Q254 282 248 263Z" fill="#ffc963" stroke="#382810" stroke-width="4"/>
      <path d="M104 220 Q100 184 146 176 L245 172 Q280 174 278 198 Q275 219 244 224 L164 240 Q126 250 104 220Z" fill="#e2b18a" stroke="#ffe0b7" stroke-width="4"/>
      <g fill="none" stroke="#f4f5eb" stroke-width="2"><path d="M64 257L150 220M370 66L260 128M389 260L265 269M400 383L430 337"/><path d="M290 288Q320 278 316 246"/><path d="M257 284V305l-7-8m7 8 7-8"/></g>
      <g fill="#f4f5eb" font-family="sans-serif" font-size="21"><text x="12" y="282">Thumb pad</text><text x="270" y="36">Curled index</text><text x="295" y="61">finger side</text><text x="324" y="239">Pick tip</text><text x="324" y="264">2–3 mm</text><text x="328" y="300">Angle: 10–20°</text><text x="350" y="397">Strings</text></g>
    </svg><figcaption>Rest the pick on the side of your curled index finger. Cover it with your thumb pad. Point the exposed tip toward the strings, with a slight tilt (about 10–20°).</figcaption></figure>`;
  }

  listenForSound(fill, message, button) {
    this.stopLoop();
    const gate = new SteadyPitch();
    let passed = false;
    button.disabled = true;
    const screen = this.currentScreen;
    const tick = () => {
      if (this.currentScreen !== screen || !this.analyser) return;
      const frame = this.readAnalysis();
      if (gate.update(frame, performance.now()) && frame.rms <= 0.24) passed = true;
      this.soundPassed = passed;
      fill.style.width = `${Math.min(100, frame.rms * 330)}%`;
      fill.style.background = passed ? 'var(--green)' : 'var(--amber)';
      message.textContent = passed ? 'Steady string heard — ready.' : frame.rms > 0.24 ? 'Turn the amp down a little.' : "Pick one open string and let it ring. Talking or tapping won't count.";
      button.disabled = !passed;
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  startExercise() {
    this.startPractice(this.expandedExercise(this.lesson.exercises[this.exerciseIndex]), 'lesson');
  }

  startPractice(cards, kind) {
    this.stopLoop();
    this.practiceKind = kind;
    this.session = new PracticeSession(cards);
    this.preparePracticeCard();
  }

  preparePracticeCard(resetTracking = true) {
    this.stopLoop();
    this.attempt = new NoteAttempt();
    if (resetTracking) this.pitchDetector.resetTracking();
    if (this.practiceKind === 'lesson') {
      this.renderLessonCard();
      document.getElementById('lesson-next').disabled = true;
    } else if (this.practiceKind === 'song') {
      this.playing = true;
      this.el['play-toggle'].textContent = 'Pause';
      this.el['play-toggle'].disabled = false;
      this.songIndex = this.songRange[0] + this.session.index;
      this.renderSongCard(); this.renderSongTrack();
      document.getElementById('song-next').disabled = true;
      this.setFeedback(this.el['play-feedback'], 'neutral', 'Pick once and let it ring.');
    } else {
      const target = this.session.cards[this.session.index];
      const info = this.noteDetector.noteAt(target.string, target.fret);
      document.getElementById('first-string').textContent = stringLabel(target.string);
      document.getElementById('first-fret').textContent = target.fret;
      const note = document.getElementById('first-note');
      note.textContent = `${info.note}${info.octave}`;
      note.className = 'scientific-note';
      this.setFeedback(document.getElementById('first-feedback'), 'neutral', 'Pick once and let it ring.');
      const button = this.el['onboarding-next'];
      button.classList.remove('hidden'); button.disabled = true; button.textContent = 'Next';
    }
    this.runPracticeInput();
  }

  practiceFeedback() {
    return this.practiceKind === 'intro' ? document.getElementById('first-feedback') : this.el[this.practiceKind === 'song' ? 'play-feedback' : 'lesson-feedback'];
  }

  runPracticeInput() {
    this.stopLoop();
    const screen = this.currentScreen;
    const tick = () => {
      if (this.currentScreen !== screen || this.session?.state !== 'playing' || !this.analyser) return;
      const target = this.session.cards[this.session.index];
      const info = this.noteDetector.noteAt(target.string, target.fret);
      const result = this.attempt.update(this.readAnalysis(), performance.now(), this.noteDetector.frequencyFor(info.note, info.octave), this.pitchDetector.noiseFloor);
      if (result) {
        const right = result.type === 'right';
        this.session.record(right);
        if (right && this.practiceKind === 'song') this.songResults[this.songIndex] = 'hit';
        const heard = result.frequency ? this.noteDetector.frequencyToNote(result.frequency).fullName : 'unclear sound';
        const message = right ? 'Right!' : result.type === 'muted' ? 'The note stopped too fast. Let it ring.' : `Not quite - that was ${heard}, try string ${target.string} fret ${target.fret}`;
        this.setFeedback(this.practiceFeedback(), right ? 'success' : 'error', message);
        if (right) {
          if (this.practiceKind === 'song') { this.scheduleSongAdvance(); return; }
          const id = this.practiceKind === 'intro' ? 'onboarding-next' : this.practiceKind === 'song' ? 'song-next' : 'lesson-next';
          document.getElementById(id).disabled = false;
          document.getElementById(id).textContent = this.session.state === 'result' ? 'See result' : 'Next';
          return;
        }
        // A new onset is required; a held wrong note cannot generate more attempts.
        this.attempt = new NoteAttempt();
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  nextPracticeCard() {
    if (this.session.state === 'result') return this.practiceResult();
    if (this.session.state !== 'feedback') return;
    this.session.next();
    this.preparePracticeCard(false);
  }

  saveExerciseScore() {
    this.exerciseScores[this.exerciseIndex] = {
      right: this.session.right, attempts: this.session.attempts, total: this.session.cards.length
    };
  }

  practiceResult() {
    this.stopLoop();
    this.playing = false;
    this.show('achievement');
    let score = {right:this.session.right,total:this.session.cards.length,attempts:this.session.attempts};
    const lessonEnd = this.practiceKind === 'lesson' && this.exerciseIndex === this.lesson.exercises.length - 1;
    if (this.practiceKind === 'lesson') this.saveExerciseScore();
    if (lessonEnd) score = this.exerciseScores.reduce((sum, item) => ({
      right:sum.right + item.right, total:sum.total + item.total, attempts:sum.attempts + item.attempts
    }), {right:0,total:0,attempts:0});
    this.el['achievement-title'].textContent = lessonEnd ? 'Lesson result' : 'Practice result';
    this.el['achievement-body'].textContent = `${score.right}/${score.total} notes right · ${score.attempts} attempts. ${score.right === score.total ? 'Well done!' : 'You can try again or continue.'}`;
    this.el['next-session'].textContent = 'Try again, or press Next when you are ready.';
    this.el['achievement-home'].textContent = 'Home';
    this.el['achievement-home'].classList.toggle('hidden', !this.profile);
  }

  async retryPractice() {
    const kind = this.practiceKind;
    const cards = this.session.cards;
    const ok = await this.setupAudio();
    if (!ok) return;
    if (kind === 'intro') { this.renderFirstRun(); return; }
    this.show(kind === 'song' ? 'play' : 'lesson');
    this.startPractice(cards, kind);
  }

  async finishPracticeResult() {
    if (this.session.state !== 'result') return;
    if (this.practiceKind === 'lesson') this.exerciseResults[this.exerciseIndex] = this.session.right === this.session.cards.length;
    this.session.next();
    if (this.practiceKind === 'intro') {
      this.firstRunStep++;
      this.renderFirstRun();
    } else if (this.practiceKind === 'song') {
      const ranges = this.phraseRanges(this.song.notes);
      const following = ranges.find(range => range[0] === this.songRange[1]);
      if (!this.wholeSong || !following) { this.goHome(); return; }
      const ok = await this.setupAudio();
      if (!ok) { this.session.state = 'result'; return; }
      this.songRange = following;
      this.show('play');
      this.resetSongPhrase();
      this.startPractice(this.song.notes.slice(...this.songRange), 'song');
    }
    else if (++this.exerciseIndex < this.lesson.exercises.length) {
      const ok = await this.setupAudio();
      if (!ok) return;
      this.show('lesson'); this.startExercise();
    } else this.completeLesson();
  }

  beginTunerTracking() {
    this.tunedStrings = new Set();
    this.tuneGate = new SteadyPitch(500, 10);
    this.tuneString = null;
  }

  listenTuner(first) {
    this.stopLoop();
    if (!this.tuneGate) this.beginTunerTracking();
    const tick = () => {
      if (this.currentScreen !== (first ? 'onboarding' : 'tuner') || !this.analyser) return;
      const frame = this.readAnalysis();
      const f = frame.rawFrequency ?? frame.frequency;
      const target = first || !this.tunerGuided ? this.noteDetector.findGuitarString(f) : this.noteDetector.guitarStrings[this.tunerStringIndex];
      let stable = false;
      let cents = null;
      if (target && f) {
        if (this.tuneString !== target.number) { this.tuneGate.reset(); this.tuneString = target.number; }
        cents = 1200 * Math.log2(f / target.frequency);
        stable = this.tuneGate.update(Math.abs(cents) <= 5 ? frame : { frequency: null, clarity: 0 }, performance.now());
        if (stable) this.tunedStrings.add(target.number);
      } else this.tuneGate.reset();
      const label = target ? stringLabel(target.number) : 'Pick one open string';
      const scientific = f ? this.noteDetector.frequencyToNote(f).fullName : '—';
      const instruction = stable ? '✓ In tune' : cents === null ? 'Pick and let it ring' : Math.abs(cents) <= 5 ? 'Hold steady…' : cents < 0 ? '↑ Tighten (too low)' : '↓ Loosen (too high)';
      const noteEl = first ? document.getElementById('first-tuner-note') : this.el['tuner-note'];
      noteEl.replaceChildren();
      noteEl.append(document.createTextNode(label));
      const small = document.createElement('small'); small.className = 'scientific-note'; small.textContent = scientific; noteEl.appendChild(small);
      const status = first ? document.getElementById('first-tuner-status') : this.el['tuner-cents'];
      status.textContent = instruction; status.className = `tune-direction${stable ? ' tuned' : ''}`;
      const list = this.noteDetector.guitarStrings.slice().reverse().map(item => `${this.tunedStrings.has(item.number) ? '✓' : '○'} ${stringLabel(item.number)}`).join(' · ');
      if (first) {
        let el = document.getElementById('first-tuned-list');
        if (!el) { el = document.createElement('p'); el.id = 'first-tuned-list'; status.after(el); }
        el.textContent = list;
      } else {
        document.getElementById('tuned-strings').textContent = list;
        this.el['tuner-string'].textContent = label;
        this.el['tuner-message'].textContent = stable ? 'That string is ready.' : 'Pick the open string again as needed.';
        this.el['tuner-continue'].disabled = this.tunerGuided && !stable;
        this.el['tuner-needle'].style.transform = `rotate(${Math.max(-50, Math.min(50, cents || 0))}deg)`;
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

}

new GuitarApp();
