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
    this.pendingOnsetAt = null;
    this.pausedByInterruption = false;
    this.inputReady = false;
    this.calibrated = false;
    this.lesson = null;
    this.exerciseIndex = 0;
    this.cardIndex = 0;
    this.song = null;
    this.songIndex = 0;
    this.songRange = [0, 0];
    this.playing = false;
    this.autoAdvanceTimer = null;
    this.customSongs = this.readJSON('guitar-custom-songs', []);
    this.cacheElements();
    this.bindEvents();
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
      'tempo-output', 'wait-mode', 'phrase-loop', 'play-toggle', 'play-retry',
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
    this.el['tuner-skip'].addEventListener('click', () => this.finishTuner());
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
        if (['lesson', 'play', 'tuner', 'sound'].includes(this.currentScreen)) {
          this.pausedByInterruption = true;
          this.stopLoop();
          this.playing = false;
          clearTimeout(this.autoAdvanceTimer);
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
    clearTimeout(this.autoAdvanceTimer);
    this.currentScreen = name;
    this.screens.forEach(screen => screen.classList.toggle('hidden', screen.id !== `${name}-screen`));
    this.el['home-button'].classList.toggle('hidden', ['onboarding', 'profile', 'home'].includes(name));
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
    const lesson = this.progress.nextLesson();
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
    const step = FIRST_RUN[this.firstRunStep];
    if (step.type === 'sound') {
      this.el['onboarding-content'].innerHTML = `
        <p class="eyebrow">First setup · 1 minute</p><h1>${step.title}</h1>
        <div class="hint-card"><strong>Before you pick</strong><ul><li>Clean channel and pedal off</li><li>Low volume</li><li>Phone 0.5–1 m away, off to the side</li></ul></div>
        <div class="level-track"><div id="first-level-fill"></div><span class="green-zone"></span></div>
        <p id="first-level-message" class="status-line">Tap below to allow the microphone.</p>`;
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
      this.firstPhraseIndex = 0;
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
      ${step.type === 'hold' ? '<div class="pick-illustration hero-card"><h2>Thumb ↓</h2><p>◢ Pick tip · only 3–4 mm showing</p><h2>Index finger ↑</h2></div>' : ''}`;
    this.el['onboarding-next'].textContent = step.type === 'welcome' ? 'Show me how' : 'Check my sound';
    this.el['onboarding-next'].disabled = false;
  }

  async nextFirstRun() {
    const step = FIRST_RUN[this.firstRunStep];
    if (step.type === 'sound' && !this.inputReady) {
      const ok = await this.setupAudio();
      if (!ok) return;
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
    this.stopLoop();
    const fill = document.getElementById('first-level-fill');
    const message = document.getElementById('first-level-message');
    const tick = () => {
      if (this.currentScreen !== 'onboarding' || FIRST_RUN[this.firstRunStep].type !== 'sound') return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const rms = this.pitchDetector.getRMS(this.buffer);
      const percent = Math.min(100, rms * 330);
      fill.style.width = `${percent}%`;
      const good = rms >= 0.015 && rms <= 0.24;
      fill.style.background = good ? 'var(--green)' : rms > 0.24 ? 'var(--red)' : 'var(--amber)';
      message.textContent = good ? 'Good level — clearly heard' : rms > 0.24 ? 'A little loud — turn the amp down' : 'Pick a little louder';
      this.el['onboarding-next'].disabled = !good;
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  readAnalysis() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    const result = this.pitchDetector.analyze(this.buffer);
    if (result.onset) this.pendingOnsetAt = performance.now();
    const pick = Boolean(
      result.frequency
      && this.pendingOnsetAt
      && performance.now() - this.pendingOnsetAt < 280
    );
    if (pick) this.pendingOnsetAt = null;
    return { ...result, pick };
  }

  runFirstTuner() {
    this.stopLoop();
    const tick = () => {
      if (this.currentScreen !== 'onboarding' || FIRST_RUN[this.firstRunStep].type !== 'tuner') return;
      const result = this.readAnalysis();
      const note = result.frequency ? this.noteDetector.frequencyToNote(result.frequency) : null;
      const noteEl = document.getElementById('first-tuner-note');
      const status = document.getElementById('first-tuner-status');
      const needle = document.getElementById('first-tuner-needle');
      if (note) {
        noteEl.textContent = note.fullName;
        status.textContent = Math.abs(note.cents) <= 8 ? 'In tune — nice' : `${Math.abs(note.cents)}¢ ${note.cents > 0 ? 'sharp' : 'flat'}`;
        needle.style.transform = `rotate(${Math.max(-45, Math.min(45, note.cents)) * 1.4}deg)`;
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  runFirstPhrase() {
    this.stopLoop();
    const notes = FIRST_RUN[this.firstRunStep].notes;
    const updateCard = () => {
      const target = notes[this.firstPhraseIndex];
      const info = this.noteDetector.noteAt(target.string, target.fret);
      document.getElementById('first-string').textContent = target.string;
      document.getElementById('first-fret').textContent = target.fret;
      document.getElementById('first-note').textContent = info.note;
    };
    updateCard();
    const tick = () => {
      if (this.currentScreen !== 'onboarding' || FIRST_RUN[this.firstRunStep].type !== 'phrase') return;
      const result = this.readAnalysis();
      const target = notes[this.firstPhraseIndex];
      const info = this.noteDetector.noteAt(target.string, target.fret);
      const feedback = document.getElementById('first-feedback');
      if (result.pick) {
        if (this.noteDetector.matchesNote(result.frequency, info.note, info.octave, 65)) {
          feedback.className = 'feedback success';
          feedback.textContent = 'Heard it — good pick';
          this.firstPhraseIndex += 1;
          if (this.firstPhraseIndex >= notes.length) {
            setTimeout(() => {
              this.firstRunStep += 1;
              this.el['onboarding-next'].classList.remove('hidden');
              this.renderFirstRun();
            }, 550);
            return;
          }
          setTimeout(() => {
            updateCard();
            feedback.className = 'feedback neutral';
            feedback.textContent = 'Mute, then pick the next note';
          }, 350);
        } else {
          feedback.className = 'feedback error';
          feedback.textContent = `Try fret ${target.fret} again`;
        }
      } else if (result.reason === 'unclear' && result.rms > this.pitchDetector.noiseFloor * 1.3) {
        feedback.className = 'feedback warning';
        feedback.textContent = 'I couldn’t hear clearly — no penalty';
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  async beginDailySession() {
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
    this.stopLoop();
    const tick = () => {
      if (this.currentScreen !== 'sound') return;
      this.analyser.getFloatTimeDomainData(this.buffer);
      const rms = this.pitchDetector.getRMS(this.buffer);
      const percent = Math.min(100, rms * 330);
      const good = rms >= 0.015 && rms <= 0.24;
      this.el['level-fill'].style.width = `${percent}%`;
      this.el['level-fill'].style.background = good ? 'var(--green)' : rms > 0.24 ? 'var(--red)' : 'var(--amber)';
      this.el['level-message'].textContent = good ? 'Good level — ready to tune' : rms > 0.24 ? 'Too loud — turn down a little' : 'Pick any string';
      this.el['sound-continue'].disabled = !good;
      this.raf = requestAnimationFrame(tick);
    };
    tick();
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
    this.el['tuner-target'].textContent = `String ${target.number} · ${target.note}${target.octave}`;
    this.el['tuner-continue'].disabled = true;
  }

  runTuner() {
    this.stopLoop();
    const tick = () => {
      if (this.currentScreen !== 'tuner') return;
      const result = this.readAnalysis();
      if (!result.frequency) {
        this.el['tuner-message'].textContent = result.reason === 'unclear' ? 'I couldn’t hear clearly' : 'Listening…';
        this.raf = requestAnimationFrame(tick);
        return;
      }
      const note = this.noteDetector.frequencyToNote(result.frequency);
      const detectedString = this.noteDetector.findGuitarString(result.frequency);
      this.el['tuner-note'].textContent = note.fullName;
      this.el['tuner-cents'].textContent = Math.abs(note.cents) <= 5 ? 'In tune' : `${Math.abs(note.cents)}¢ ${note.cents > 0 ? 'sharp' : 'flat'}`;
      this.el['tuner-needle'].style.transform = `rotate(${Math.max(-50, Math.min(50, note.cents)) * 1.3}deg)`;
      this.el['tuner-string'].textContent = `String ${detectedString.number} · ${detectedString.note}${detectedString.octave}${detectedString.number === 1 ? ' · thin high E' : ''}`;
      if (this.tunerGuided) {
        const target = this.noteDetector.guitarStrings[this.tunerStringIndex];
        const matches = this.noteDetector.matchesNote(result.frequency, target.note, target.octave, 12, false);
        this.el['tuner-message'].textContent = matches ? 'That string is ready' : `Need string ${target.number} · ${target.note}${target.octave}`;
        this.el['tuner-continue'].disabled = !matches;
      } else {
        this.el['tuner-message'].textContent = Math.abs(note.cents) <= 5 ? 'That string is ready' : note.cents > 0 ? 'Loosen slightly' : 'Tighten slightly';
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  finishTuner() {
    if (this.tunerGuided && this.el['tuner-continue'].disabled === false && this.tunerStringIndex < 5) {
      this.tunerStringIndex += 1;
      this.pitchDetector.resetTracking();
      this.renderTunerTarget();
      return;
    }
    if (this.routeAfterTuner === 'lesson') this.startLesson();
    else this.goHome();
  }

  startLesson() {
    this.lesson = this.progress.nextLesson();
    this.exerciseIndex = 0;
    this.cardIndex = 0;
    this.pitchDetector.resetTracking();
    this.show('lesson');
    this.renderLessonCard(true);
  }

  expandedExercise(exercise) {
    const base = exercise.type === 'note' ? [exercise] : exercise.notes;
    return Array.from({ length: exercise.repeats || 1 }, () => base).flat();
  }

  currentLessonTarget() {
    const exercise = this.lesson.exercises[this.exerciseIndex];
    return this.expandedExercise(exercise)[this.cardIndex];
  }

  async renderLessonCard(withCountIn = false) {
    const exercise = this.lesson.exercises[this.exerciseIndex];
    const cards = this.expandedExercise(exercise);
    const target = cards[this.cardIndex];
    const info = this.noteDetector.noteAt(target.string, target.fret);
    this.el['lesson-step'].textContent = `Card ${this.cardIndex + 1} of ${cards.length} · skill ${this.exerciseIndex + 1}/${this.lesson.exercises.length}`;
    this.el['lesson-title'].textContent = this.lesson.title;
    this.el['lesson-tip'].innerHTML = `<strong>One skill:</strong> ${this.lesson.tip}`;
    this.el['note-instruction'].textContent = exercise.instruction;
    this.el['card-string'].textContent = target.string;
    this.el['card-fret'].textContent = target.fret;
    this.el['card-finger'].textContent = target.fret === 0 ? 'OPEN' : target.fret === 1 ? '1' : '2';
    this.renderFretboard(this.el['mini-fretboard'], target.string, target.fret);
    this.setFeedback(this.el['lesson-feedback'], 'neutral', `${info.note}${info.octave} · pick once when ready`);
    if (withCountIn && exercise.type === 'phrase') await this.countIn(this.el['count-in'], 70);
    this.runLessonInput();
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

  runLessonInput() {
    this.stopLoop();
    const tick = () => {
      if (this.currentScreen !== 'lesson') return;
      const result = this.readAnalysis();
      const target = this.currentLessonTarget();
      const info = this.noteDetector.noteAt(target.string, target.fret);
      if (result.pick) {
        if (this.noteDetector.matchesNote(result.frequency, info.note, info.octave, 65)) {
          this.setFeedback(this.el['lesson-feedback'], 'success', `Heard ${info.note} — nice clean pick`);
          this.stopLoop();
          setTimeout(() => this.advanceLessonCard(), 500);
          return;
        }
        this.setFeedback(this.el['lesson-feedback'], 'error', `Try string ${target.string}, fret ${target.fret} again`);
      } else if (result.reason === 'unclear' && result.rms > this.pitchDetector.noiseFloor * 1.3) {
        this.setFeedback(this.el['lesson-feedback'], 'warning', 'I couldn’t hear clearly — mute, then pick again');
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  advanceLessonCard() {
    this.stopLoop();
    const exercise = this.lesson.exercises[this.exerciseIndex];
    const cards = this.expandedExercise(exercise);
    this.cardIndex += 1;
    if (this.cardIndex < cards.length) return this.renderLessonCard(false);
    this.exerciseIndex += 1;
    this.cardIndex = 0;
    if (this.exerciseIndex < this.lesson.exercises.length) return this.renderLessonCard(true);
    this.completeLesson();
  }

  retryCard() {
    this.pitchDetector.resetTracking();
    this.setFeedback(this.el['lesson-feedback'], 'neutral', 'Muted. Pick the card once more.');
    this.runLessonInput();
  }

  completeLesson() {
    const completedTitle = this.lesson.title;
    this.progress.complete(this.lesson.id);
    const next = this.progress.nextLesson();
    this.show('achievement');
    this.el['achievement-title'].textContent = `${completedTitle} complete`;
    this.el['achievement-body'].textContent = this.lesson.unlockSongs
      ? 'Scrolling rhythm practice is now unlocked.'
      : 'You learned one small skill without rushing.';
    this.el['next-session'].innerHTML = `<p class="eyebrow">Next session</p><h2>${next.title}</h2><p>${next.skill}</p>`;
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
    this.songRange = value === 'all' ? [0, this.song.notes.length] : value.split(':').map(Number);
    this.resetSongPhrase();
  }

  resetSongPhrase() {
    this.stopLoop();
    clearTimeout(this.autoAdvanceTimer);
    this.playing = false;
    this.songIndex = this.songRange[0];
    this.songResults = {};
    this.el['play-toggle'].textContent = 'Play with count-in';
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
    this.el['play-string'].textContent = note.string;
    this.el['play-fret'].textContent = note.fret;
    this.el['play-note'].textContent = `${note.note}${note.octave}`;
    this.el['play-duration'].textContent = `${note.duration} beat${note.duration === 1 ? '' : 's'} · string 1 is the thin high E`;
  }

  async toggleSong() {
    if (this.playing) {
      this.playing = false;
      this.stopLoop();
      clearTimeout(this.autoAdvanceTimer);
      this.el['play-toggle'].textContent = 'Resume';
      return;
    }
    this.playing = true;
    this.el['play-toggle'].textContent = 'Pause';
    await this.countIn(this.el['play-count-in'], Number(this.el.tempo.value));
    if (!this.playing || this.currentScreen !== 'play') return;
    this.pitchDetector.resetTracking();
    this.runSongInput();
    if (!this.el['wait-mode'].checked) this.scheduleSongDeadline();
  }

  runSongInput() {
    this.stopLoop();
    const tick = () => {
      if (!this.playing || this.currentScreen !== 'play') return;
      const result = this.readAnalysis();
      const target = this.song.notes[this.songIndex];
      if (result.pick) {
        if (this.noteDetector.matchesNote(result.frequency, target.note, target.octave, 65)) {
          this.songResults[this.songIndex] = 'hit';
          this.setFeedback(this.el['play-feedback'], 'success', 'Hit — keep going');
          clearTimeout(this.autoAdvanceTimer);
          this.advanceSongNote();
          return;
        }
        this.setFeedback(this.el['play-feedback'], 'error', `Try string ${target.string}, fret ${target.fret}`);
      } else if (result.reason === 'unclear' && result.rms > this.pitchDetector.noiseFloor * 1.3) {
        this.setFeedback(this.el['play-feedback'], 'warning', 'I couldn’t hear clearly — no penalty');
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  scheduleSongDeadline() {
    const target = this.song.notes[this.songIndex];
    const milliseconds = (target.duration || 1) * 60000 / Number(this.el.tempo.value) + 700;
    this.autoAdvanceTimer = setTimeout(() => {
      if (!this.playing) return;
      this.songResults[this.songIndex] = 'missed';
      this.setFeedback(this.el['play-feedback'], 'error', 'Miss — retry the phrase whenever you like');
      this.advanceSongNote();
    }, milliseconds);
  }

  advanceSongNote() {
    this.stopLoop();
    this.songIndex += 1;
    if (this.songIndex >= this.songRange[1]) {
      this.playing = false;
      this.el['play-toggle'].textContent = 'Play again';
      this.songIndex = this.songRange[0];
      this.renderSongTrack();
      this.setFeedback(this.el['play-feedback'], 'success', 'Phrase complete');
      return;
    }
    this.renderSongTrack();
    this.renderSongCard();
    this.runSongInput();
    if (!this.el['wait-mode'].checked) this.scheduleSongDeadline();
  }

  async countIn(element, bpm) {
    element.classList.remove('hidden');
    for (let beat = 4; beat >= 1; beat -= 1) {
      element.textContent = beat;
      this.clickMetronome(beat === 4);
      await new Promise(resolve => setTimeout(resolve, 60000 / bpm));
      if (!['lesson', 'play'].includes(this.currentScreen)) break;
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
    if (this.currentScreen === 'lesson') this.runLessonInput();
    if (this.currentScreen === 'play') {
      this.playing = true;
      this.runSongInput();
      if (!this.el['wait-mode'].checked) this.scheduleSongDeadline();
    }
  }
}

new GuitarApp();
