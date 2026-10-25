class GuitarApp {
  constructor() {
    this.noteDetector = new NoteDetector();
    this.pitchDetector = new PitchDetector();
    this.loadNoiseFloor();
    this.tabParser = new TabParser();
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.buffer = null;
    this.raf = null;
    this.navigationToken = 0;
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

  loadNoiseFloor() {
    const stored = localStorage.getItem('noiseFloor');
    const value = stored === null || stored.trim() === '' ? NaN : Number(stored);
    this.pitchDetector.noiseFloor = Number.isFinite(value) ? Math.min(0.02, Math.max(0.0015, value)) : 0.003;
    if (stored !== null) localStorage.setItem('noiseFloor', String(this.pitchDetector.noiseFloor));
    this.pitchDetector.resetTracking();
  }

  cacheElements() {
    this.screens = [...document.querySelectorAll('.screen')];
    const ids = [
      'nav-tuner', 'open-settings', 'redo-sound-check', 'pause-practice', 'home-button', 'profile-chip', 'onboarding-content', 'onboarding-next',
      'home-greeting', 'next-lesson-card', 'start-session', 'open-tuner',
      'open-songs', 'open-my-songs', 'switch-profile', 'songs-status',
      'level-fill', 'level-message', 'mic-settings', 'sound-continue',
      'tuner-step', 'tuner-target', 'tuner-note', 'tuner-needle', 'tuner-cents',
      'tuner-string', 'tuner-message', 'tuner-continue', 'tuner-skip',
      'lesson-step', 'lesson-title', 'lesson-tip', 'count-in', 'note-instruction',
      'card-string', 'card-fret', 'card-finger', 'mini-fretboard',
      'lesson-feedback', 'retry-note', 'skip-note', 'built-in-song-list',
      'play-title', 'song-part', 'song-progress-bar', 'result-whole-song', 'play-progress', 'play-count-in', 'rhythm-track',
      'play-string', 'play-fret', 'play-note', 'play-duration', 'play-feedback', 'tempo',
      'tempo-output', 'phrase-loop', 'play-toggle', 'play-retry',
      'custom-song-list', 'show-import', 'import-form', 'import-title',
      'import-tab', 'import-error', 'achievement-title', 'achievement-body',
      'next-session', 'achievement-home', 'resume-overlay', 'resume-button'
    ];
    this.el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  }

  bindEvents() {
    this.el['result-whole-song'].onclick = () => this.playWholeSong();
    this.el['nav-tuner'].onclick = () => this.openStandaloneTuner();
    this.el['open-settings'].onclick = () => this.show('settings');
    this.el['redo-sound-check'].onclick = () => {
      localStorage.setItem('soundCheckDone', 'false');
      this.calibrated = false;
      return this.beginDailySession('home');
    };
    this.el['pause-practice'].onclick = () => {
      this.practicePaused = !this.practicePaused;
      this.el['pause-practice'].textContent = this.practicePaused ? 'Resume' : 'Pause';
      this.stopLoop();
      if (!this.practicePaused) this.resumePractice();
    };
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
    this.el['sound-continue'].addEventListener('click', () => this.openGuidedTuner(this.routeAfterTuner));
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

  beginOperation() {
    this.navigationToken++;
    this.stopLoop();
    return this.navigationToken;
  }

  operationActive(token) { return token === this.navigationToken; }

  show(name) {
    this.beginOperation();
    if (this.currentScreen === 'onboarding' && name !== 'onboarding' &&
        FIRST_RUN[this.firstRunStep]?.type === 'win' && this.practiceKind === 'intro') {
      this.session = null;
      this.practiceKind = null;
    }
    this.currentScreen = name;
    this.el['pause-practice'].classList.toggle('hidden', !(name === 'lesson' || (name === 'onboarding' && FIRST_RUN[this.firstRunStep]?.type === 'phrase')));
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
    this.el['songs-status'].textContent = unlocked ? 'Melodies + easy riffs' : 'Unlock after starter step 4';
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
        <p class="eyebrow">Starter step ${this.firstRunStep} of 4</p><h1>${step.title}</h1>
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
    if (step.type === 'hold') { this.firstRunStep = 1; return this.beginDailySession('intro'); }
    if (step.type === 'phrase') return;
    if (step.type === 'sound' && !this.soundPassed) {
      this.el['onboarding-next'].disabled = true;
      const operation = this.beginOperation();
      const ok = await this.setupAudio(operation);
      if (!this.operationActive(operation)) return;
      if (!ok) { this.el['onboarding-next'].disabled = false; return; }
      const calibrated = await this.calibrateNoiseFloor(operation);
      if (calibrated === false || !this.operationActive(operation)) return;
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

  async setupAudio(operation = this.navigationToken) {
    let acquired = null;
    try {
      if (!this.operationActive(operation)) return false;
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone API unavailable');
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        if (!this.operationActive(operation)) return false;
      }
      if (this.pitchDetector.sampleRate !== this.audioContext.sampleRate) {
        this.pitchDetector = new PitchDetector(this.audioContext.sampleRate);
        this.loadNoiseFloor();
        this.calibrated = false;
      }
      if (!this.stream) {
        acquired = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        // Permission prompts cannot be cancelled. Dispose of their late result
        // before publishing it to app state or connecting an analyser.
        if (!this.operationActive(operation)) {
          acquired.getTracks().forEach(track => track.stop());
          return false;
        }
        const source = this.audioContext.createMediaStreamSource(acquired);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);
        this.micSettings = acquired.getAudioTracks()[0].getSettings();
        this.stream = acquired;
        this.analyser = analyser;
        this.buffer = new Float32Array(analyser.fftSize);
      }
      this.inputReady = true;
      return true;
    } catch (error) {
      if (acquired) acquired.getTracks().forEach(track => track.stop());
      if (!this.operationActive(operation)) return false;
      console.error(error);
      alert('Microphone access failed. Use HTTPS (or localhost), allow the mic, then try again.');
      return false;
    }
  }

  cancelCalibration() {
    if (this.calibrationRaf != null) cancelAnimationFrame(this.calibrationRaf);
    this.calibrationRaf = null;
    if (this.calibrationDetector) {
      this.calibrationDetector.calibrating = false;
      this.calibrationDetector.calibrationRms = [];
      this.calibrationDetector = null;
    }
    const resolve = this.calibrationResolve;
    this.calibrationResolve = null;
    if (resolve) resolve(false);
  }

  async calibrateNoiseFloor(operation = this.navigationToken) {
    this.cancelCalibration();
    const analyser = this.analyser;
    const buffer = this.buffer;
    const detector = this.pitchDetector;
    if (!analyser || !buffer || !this.operationActive(operation)) return false;
    detector.startCalibration();
    this.calibrationDetector = detector;
    const started = performance.now();
    const completed = await new Promise(resolve => {
      this.calibrationResolve = resolve;
      const sample = () => {
        if (!this.operationActive(operation) || this.calibrationResolve !== resolve
            || this.analyser !== analyser || this.buffer !== buffer) {
          if (this.calibrationResolve === resolve) this.cancelCalibration();
          else resolve(false);
          return;
        }
        this.calibrationRaf = null;
        analyser.getFloatTimeDomainData(buffer);
        detector.addCalibrationFrame(buffer);
        if (performance.now() - started >= 700) {
          this.calibrationResolve = null;
          resolve(true);
        } else this.calibrationRaf = requestAnimationFrame(sample);
      };
      sample();
    });
    if (!completed || !this.operationActive(operation) || this.analyser !== analyser) return false;
    this.calibrationDetector = null;
    detector.finishCalibration();
    localStorage.setItem('noiseFloor', String(detector.noiseFloor));
    this.calibrated = true;
    return true;
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
    if (!this.analyser || !this.buffer) return { frequency: null, rawFrequency: null, clarity: 0, rms: 0, onset: false };
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

  async beginDailySession(route = 'lesson') {
    this.routeAfterTuner = route;
    if (localStorage.getItem('soundCheckDone') === 'true') {
      const operation = this.beginOperation();
      const ok = await this.setupAudio(operation);
      if (!this.operationActive(operation)) return;
      if (ok) this.finishSetupRoute();
      return;
    }
    this.soundPassed = false;
    this.show('sound');
    const operation = this.beginOperation();
    const ok = await this.setupAudio(operation);
    if (!this.operationActive(operation)) return;
    if (!ok) return this.goHome();
    this.el['mic-settings'].textContent = this.formatMicSettings();
    this.el['level-message'].textContent = 'Stay quiet for a quick room check…';
    this.el['sound-continue'].disabled = true;
    if (!this.calibrated) {
      const calibrated = await this.calibrateNoiseFloor(operation);
      if (calibrated === false || !this.operationActive(operation)) return;
    }
    this.runSoundCheck();
  }

  runSoundCheck() {
    this.listenForSound(this.el['level-fill'], this.el['level-message'], this.el['sound-continue']);
  }

  async openStandaloneTuner() {
    if (this.currentScreen === 'tuner') return;
    this.tunerReturn = { screen: this.currentScreen, playing: this.playing, route: this.routeAfterTuner };
    this.stopLoop();
    const operation = this.beginOperation();
    const ok = await this.setupAudio(operation);
    if (!this.operationActive(operation)) return;
    if (!ok) return;
    this.openGuidedTuner('return', false);
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
    if (this.routeAfterTuner === 'return') {
      const saved = this.tunerReturn;
      this.routeAfterTuner = saved.route;
      this.show(saved.screen);
      this.playing = saved.playing;
      if ((saved.screen === 'lesson' || (saved.screen === 'play' && saved.playing) || (saved.screen === 'onboarding' && FIRST_RUN[this.firstRunStep]?.type === 'phrase')) && this.session && !this.practicePaused) this.resumePractice();
      if (saved.screen === 'play' && saved.playing && !this.session) { this.playing = false; this.toggleSong(); }
      if (saved.screen === 'sound') this.runSoundCheck();
      return;
    }
    localStorage.setItem('soundCheckDone', 'true');
    this.finishSetupRoute();
  }

  finishSetupRoute() {
    if (this.routeAfterTuner === 'intro') this.renderFirstRun();
    else if (this.routeAfterTuner === 'lesson') this.startLesson();
    else this.goHome();
  }

  resumePractice() {
    if (this.exerciseTransition) this.practiceResult();
    else if (this.session.state === 'playing') this.preparePracticeCard();
    else if (['feedback', 'result'].includes(this.session.state)) this.scheduleSongAdvance();
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
    this.el['card-string'].textContent = `String ${target.string}, ${target.fret === 0 ? 'open' : `fret ${target.fret}`}`;
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
    this.practicePaused = false;
    this.el['pause-practice'].textContent = 'Pause';
    this.stopLoop();
    this.session.skip();
    if (this.session.state === 'result') {
      this.practiceResult();
    }
    else this.preparePracticeCard();
  }

  retryCard() {
    this.practicePaused = false;
    this.el['pause-practice'].textContent = 'Pause';
    this.session.retry();
    this.preparePracticeCard();
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
      button.innerHTML = `<div><strong>${song.title}</strong><small>${({beginner:'★ Easy',intermediate:'★★ Medium',harder:'★★★ Harder'})[song.difficulty]} · ${song.description} · ${song.bpm} BPM</small></div><span>›</span>`;
      button.addEventListener('click', () => this.openSong(song));
      this.el['built-in-song-list'].appendChild(button);
    });
  }

  openSongs() {
    if (!this.progress.songsUnlocked()) return;
    this.show('songs');
  }

  async openSong(song) {
    const operation = this.beginOperation();
    const ok = await this.setupAudio(operation);
    if (!this.operationActive(operation)) return;
    if (!ok) return;
    this.song = song;
    this.el.tempo.value = song.bpm || 70;
    this.el['tempo-output'].textContent = `${this.el.tempo.value} BPM`;
    this.show('play');
    this.buildPhraseOptions();
    this.el['phrase-loop'].value = 'all';
    this.setSongRange();
  }

  buildPhraseOptions() {
    const select = this.el['phrase-loop'];
    select.innerHTML = '<option value="all">Whole song</option>';
    const ranges = this.phraseRanges(this.song.notes);
    ranges.forEach((range, index) => {
      const option = document.createElement('option');
      option.value = `${range[0]}:${range[1]}`;
      option.textContent = `Part ${index + 1} of ${ranges.length}`;
      select.appendChild(option);
    });
  }

  phraseRanges(notes) {
    const ranges = [];
    const explicitParts = notes.some(note => note.phraseEnd);
    let start = 0;
    let beats = 0;
    notes.forEach((note, index) => {
      beats += note.duration || 1;
      if (note.phraseEnd || (!explicitParts && beats >= 8) || index === notes.length - 1) {
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
    this.songRange = this.wholeSong ? [0, this.song.notes.length] : value.split(':').map(Number);
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
    this.renderSongProgress();
    this.el['play-string'].textContent = `String ${note.string}, ${note.fret === 0 ? 'open' : `fret ${note.fret}`}`;
    const name = document.createElement('small');
    name.className = 'scientific-note'; name.textContent = `${note.note}${note.octave}`;
    this.el['play-string'].appendChild(name);
    this.el['play-fret'].textContent = note.fret;
    this.el['play-note'].textContent = `${note.note}${note.octave}`;
    this.el['play-note'].classList.add('scientific-note');
    this.el['play-duration'].textContent = `${note.duration} beat${note.duration === 1 ? '' : 's'} · string 1 is the thin high E`;
  }

  renderSongProgress() {
    const ranges = this.phraseRanges(this.song.notes);
    const part = ranges.findIndex(([start, end]) => this.songIndex >= start && this.songIndex < end);
    const [start, end] = ranges[part];
    const done = this.songIndex - start + (this.session && ['feedback', 'result'].includes(this.session.state) ? 1 : 0);
    this.el['song-part'].textContent = `Part ${part + 1} of ${ranges.length} | ${this.wholeSong ? 'Whole song' : 'Part practice'}`;
    this.el['play-progress'].textContent = `${done}/${end - start} notes done in part | ${this.songIndex + (done > this.songIndex - start ? 1 : 0)}/${this.song.notes.length} overall`;
    this.el['song-progress-bar'].max = end - start;
    this.el['song-progress-bar'].value = done;
  }

  async playWholeSong() {
    const operation = this.beginOperation();
    const ok = await this.setupAudio(operation);
    if (!this.operationActive(operation)) return;
    if (!ok) return;
    this.el['phrase-loop'].value = 'all';
    this.show('play');
    this.setSongRange();
    this.startPractice(this.song.notes, 'song');
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
      const screen = this.currentScreen;
      const completed = await this.countIn(this.el['play-count-in'], Number(this.el.tempo.value));
      if (!completed || this.currentScreen !== screen) return;
      this.el['play-toggle'].disabled = false;
      if (!this.playing || this.currentScreen !== 'play') return;
      this.startPractice(this.song.notes.slice(...this.songRange), 'song');
    }
  }

  scheduleSongAdvance() {
    this.stopLoop();
    const session = this.session;
    const screen = this.currentScreen;
    const generation = this.countInGeneration;
    this.practiceFeedback()?.classList.add('right-flash');
    this.songAdvanceTimer = setTimeout(() => {
      if (generation !== this.countInGeneration) return;
      this.songAdvanceTimer = null;
      if ((this.practiceKind === 'song' && !this.playing) || this.practicePaused || this.currentScreen !== screen || this.session !== session) return;
      this.nextPracticeCard();
    }, 600);
  }

  runSongInput() { this.runPracticeInput(); }

  async countIn(element, bpm) {
    const generation = this.countInGeneration || 0;
    element.classList.remove('hidden');
    for (let beat = 4; beat >= 1; beat -= 1) {
      element.textContent = beat;
      this.clickMetronome(beat === 4);
      await new Promise(resolve => {
        this.countInResolve = resolve;
        this.countInTimer = setTimeout(() => { this.countInResolve = null; resolve(); }, 60000 / bpm);
      });
      if (generation !== this.countInGeneration) break;
      if (!this.playing || this.currentScreen !== 'play') break;
    }
    element.classList.add('hidden');
    return generation === this.countInGeneration;
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
    this.cancelCalibration();
    this.countInGeneration = (this.countInGeneration || 0) + 1;
    clearTimeout(this.countInTimer);
    if (this.countInResolve) { this.countInResolve(); this.countInResolve = null; }
    clearTimeout(this.songAdvanceTimer);
    this.songAdvanceTimer = null;
    if (this.session) this.practiceFeedback()?.classList.remove('right-flash');
    clearTimeout(this.exerciseTransitionTimer);
    this.exerciseTransitionTimer = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  stopAudioInput() {
    this.cancelCalibration();
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
      const operation = this.navigationToken;
      const lock = await navigator.wakeLock.request('screen');
      if (!this.operationActive(operation) || !this.needsWakeLock()) { await lock.release(); return; }
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
    const operation = this.navigationToken;
    this.el['resume-overlay'].classList.add('hidden');
    this.pausedByInterruption = false;
    if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
    if (!this.operationActive(operation)) return;
    await this.requestWakeLock();
    if (!this.operationActive(operation)) return;
    if (this.currentScreen === 'tuner') this.runTuner();
    if (this.currentScreen === 'sound') this.runSoundCheck();
    if (this.currentScreen === 'lesson' && this.session && !this.practicePaused) this.resumePractice();
    if (this.currentScreen === 'onboarding') {
      const type = FIRST_RUN[this.firstRunStep].type;
      if (type === 'sound') this.runFirstSoundCheck();
      if (type === 'tuner') this.runFirstTuner();
      if (type === 'phrase' && this.session && !this.practicePaused) this.resumePractice();
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
    return `<figure class="pick-illustration hint-card"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 540" width="100%" role="img" aria-labelledby="grip-title">
  <title id="grip-title">Player's view of holding a guitar pick</title>
  <rect width="520" height="540" rx="20" fill="#1f3a33"/>
  <g fill="#f4f5eb" font-family="sans-serif" font-size="23">
    <text x="24" y="38"><tspan x="24">Pick between thumb pad and side </tspan><tspan x="24" dy="29">of curled index finger</tspan></text>
  </g>
  <!-- Curled index below the thumb, viewed from the player's side. -->
  <path d="M96 240 C63 187 92 134 148 127 C202 119 259 145 291 181 C321 217 304 262 268 275 C228 289 190 266 180 234 L201 211 C217 240 254 245 265 222 C279 195 225 163 188 170 C158 175 159 206 175 222Z" fill="#bc8b68" stroke="#efc7a4" stroke-width="4"/>
  <!-- The covered pick body lies between finger and thumb. -->
  <path d="M218 197 Q247 182 275 201 Q285 210 275 230 L251 286 Q247 294 241 283 L211 225 Q203 207 218 197Z" fill="#f4c65e" stroke="#584422" stroke-width="4"/>
  <path d="M58 229 C61 196 96 182 133 185 L235 187 C264 187 279 204 270 224 C264 238 246 243 220 245 L135 261 C97 267 67 256 58 229Z" fill="#e2b18a" stroke="#f5d2b3" stroke-width="4"/>
  <path d="M218 199 Q242 193 252 204" fill="none" stroke="#bd8866" stroke-width="3"/>
  <g stroke="#b8c8bc" stroke-width="3"><path d="M36 322H484 M36 342H484 M36 362H484"/></g>
  <path d="M257 286 L296 280" fill="none" stroke="#f4f5eb" stroke-width="2"/>
  <path d="M248 297 L252 315 M246 310 L252 315 L256 308" fill="none" stroke="#f4f5eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="#f4f5eb" font-family="sans-serif" font-size="23">
    <text x="306" y="268"><tspan x="306">Only the tip shows</tspan><tspan x="306" dy="29">(2-3 mm)</tspan></text>
    <text x="24" y="478"><tspan x="24">Point it at the strings, </tspan><tspan x="24" dy="29">slightly angled</tspan></text>
  </g>
</svg><figcaption>Rest the pick on your curled index finger, then cover it with your thumb pad. Keep your grip relaxed.</figcaption></figure>`;
  }

  listenForSound(fill, message, button) {
    this.stopLoop();
    const gate = new SteadyPitch();
    let passed = false;
    button.disabled = true;
    const screen = this.currentScreen;
    const generation = this.countInGeneration;
    const tick = () => {
      if (generation !== this.countInGeneration) return;
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
    this.practicePaused = false;
    this.el['pause-practice'].textContent = 'Pause';
    this.practiceKind = kind;
    this.session = new PracticeSession(cards);
    this.exerciseTransition = false;
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
      button.classList.add('hidden'); button.disabled = true;
    }
    this.runPracticeInput();
  }

  practiceFeedback() {
    return this.practiceKind === 'intro' ? document.getElementById('first-feedback') : this.el[this.practiceKind === 'song' ? 'play-feedback' : 'lesson-feedback'];
  }

  runPracticeInput() {
    this.stopLoop();
    const screen = this.currentScreen;
    const generation = this.countInGeneration;
    const tick = () => {
      if (generation !== this.countInGeneration) return;
      if (this.currentScreen !== screen || this.session?.state !== 'playing' || !this.analyser) return;
      const target = this.session.cards[this.session.index];
      const info = this.noteDetector.noteAt(target.string, target.fret);
      const result = this.attempt.update(this.readAnalysis(), performance.now(), this.noteDetector.frequencyFor(info.note, info.octave), this.pitchDetector.noiseFloor);
      if (result) {
        const right = result.type === 'right';
        if (right || result.type === 'wrong') this.session.record(right);
        if (right && this.practiceKind === 'song') { this.songResults[this.songIndex] = 'hit'; this.renderSongProgress(); }
        const heard = result.frequency ? this.noteDetector.frequencyToNote(result.frequency).fullName : 'unclear sound';
        const message = right ? 'Right!' : result.type === 'muted' ? 'The note stopped too fast. Let it ring.' : result.type === 'unclear' ? "Didn't hear that clearly. Pick again and let it ring." : `Not quite - that was ${heard}, try string ${target.string} fret ${target.fret}`;
        this.setFeedback(this.practiceFeedback(), right ? 'success' : result.type === 'wrong' ? 'error' : 'neutral', message);
        if (right) {
          this.scheduleSongAdvance();
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
    let score = {right:this.session.right,total:this.session.cards.length,attempts:this.session.attempts};
    const lessonEnd = this.practiceKind === 'lesson' && this.exerciseIndex === this.lesson.exercises.length - 1;
    if (this.practiceKind === 'lesson') {
      this.saveExerciseScore();
      if (!lessonEnd) {
        this.exerciseTransition = true;
        this.setFeedback(this.practiceFeedback(), 'success', `✓ ${score.right}/${score.total}`);
        const generation = this.countInGeneration;
        const session = this.session;
        this.exerciseTransitionTimer = setTimeout(() => {
          if (generation !== this.countInGeneration || this.session !== session || this.currentScreen !== 'lesson') return;
          this.exerciseIndex++;
          this.startExercise();
        }, 1000);
        return;
      }
      score = this.exerciseScores.reduce((sum, ex) => ({right:sum.right+ex.right,total:sum.total+ex.total,attempts:sum.attempts+ex.attempts}), {right:0,total:0,attempts:0});
      this.lessonPassed = score.total > 0 && score.right / score.total >= 0.8;
      if (this.lessonPassed) this.progress.complete(this.lesson.id);
    }
    this.show('achievement');
    this.el['result-whole-song'].classList.add('hidden');
    document.getElementById('result-next').classList.remove('hidden');
    document.getElementById('result-next').textContent = 'Next';
    document.getElementById('result-retry').className = 'secondary-button';
    this.el['achievement-title'].textContent = lessonEnd ? 'Lesson result' : 'Practice result';
    this.el['achievement-body'].textContent = `${score.right}/${score.total} notes right · ${score.attempts} attempts. ${score.right === score.total ? 'Well done!' : 'You can try again or continue.'}`;
    this.el['next-session'].textContent = 'Try again, or press Next when you are ready.';
    if (this.practiceKind === 'intro') {
      this.el['achievement-title'].textContent = `Step ${this.firstRunStep} of 4 done`;
    }
    if (this.practiceKind === 'song') {
      const ranges = this.phraseRanges(this.song.notes);
      const part = ranges.findIndex(range => range[0] === this.songRange[0]);
      this.el['achievement-title'].textContent = this.wholeSong ? 'Song done' : `Part ${part + 1} of ${ranges.length} done`;
      this.el['next-session'].textContent = this.wholeSong ? 'You reached the end of the song.' : 'Continue to the next part, repeat this part, or play the whole song.';
      document.getElementById('result-next').textContent = this.wholeSong ? 'Done' : 'Next part';
      document.getElementById('result-next').disabled = !this.wholeSong && part === ranges.length - 1;
      this.el['result-whole-song'].classList.toggle('hidden', this.wholeSong);
    } else document.getElementById('result-next').disabled = false;
    if (lessonEnd) {
      const next = LEARNING_PATH[LEARNING_PATH.findIndex(item => item.id === this.lesson.id) + 1];
      this.el['achievement-title'].textContent = this.lessonPassed ? 'Nice work!' : 'Almost!';
      this.el['achievement-body'].textContent = `${score.right}/${score.total} notes right · ${score.attempts} attempts.`;
      this.el['next-session'].textContent = this.lessonPassed ? (next ? `Next up: ${next.title}` : 'All lessons done — try a song!') : 'Try again to unlock the next one';
      document.getElementById('result-next').textContent = 'Keep going';
      document.getElementById('result-next').classList.toggle('hidden', !this.lessonPassed);
      document.getElementById('result-retry').className = this.lessonPassed ? 'secondary-button' : 'primary-button';
    }
    this.el['achievement-home'].textContent = 'Home';
    this.el['achievement-home'].classList.toggle('hidden', !this.profile);
  }

  async retryPractice() {
    this.stopLoop();
    const kind = this.practiceKind;
    const cards = this.session.cards;
    const operation = this.beginOperation();
    const ok = await this.setupAudio(operation);
    if (!this.operationActive(operation)) return;
    if (!ok) return;
    if (kind === 'intro') { this.renderFirstRun(); return; }
    if (kind === 'lesson') { this.selectedLesson = this.lesson; this.startLesson(); return; }
    this.show(kind === 'song' ? 'play' : 'lesson');
    if (kind === 'song') this.resetSongPhrase();
    this.startPractice(cards, kind);
  }

  async finishPracticeResult() {
    if (this.session.state !== 'result') return;
    if (this.practiceKind === 'lesson') {
      if (!this.lessonPassed) return this.retryPractice();
      const next = LEARNING_PATH[LEARNING_PATH.findIndex(item => item.id === this.lesson.id) + 1];
      if (!next) { this.show('songs'); return; }
      this.selectedLesson = next;
      return this.beginDailySession();
    }
    this.session.next();
    if (this.practiceKind === 'intro') {
      if (FIRST_RUN[this.firstRunStep + 1]?.type === 'phrase') {
        const operation = this.beginOperation();
        const ok = await this.setupAudio(operation);
        if (!this.operationActive(operation)) return;
        if (!ok) { this.session.state = 'result'; return; }
      }
      this.firstRunStep++;
      this.renderFirstRun();
    } else if (this.practiceKind === 'song') {
      const ranges = this.phraseRanges(this.song.notes);
      const following = ranges.find(range => range[0] === this.songRange[1]);
      if (this.wholeSong || !following) { this.goHome(); return; }
      const operation = this.beginOperation();
      const ok = await this.setupAudio(operation);
      if (!this.operationActive(operation)) return;
      if (!ok) { this.session.state = 'result'; return; }
      this.el['phrase-loop'].value = `${following[0]}:${following[1]}`;
      this.songRange = following;
      this.show('play');
      this.resetSongPhrase();
      this.startPractice(this.song.notes.slice(...this.songRange), 'song');
    }
  }

  beginTunerTracking() {
    this.tunedStrings = new Set();
    this.tuneGate = new SteadyPitch(500, 10);
    this.tuneString = null;
  }

  listenTuner(first) {
    this.stopLoop();
    if (!this.tuneGate) this.beginTunerTracking();
    const generation = this.countInGeneration;
    const tick = () => {
      if (generation !== this.countInGeneration) return;
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
