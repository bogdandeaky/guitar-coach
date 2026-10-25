const LEARNING_PATH = [
  {
    id: 'open-strings',
    title: 'Picking open strings',
    skill: 'A relaxed, even pick',
    tip: 'Rest your picking hand lightly. Mute the string before each new pick.',
    exercises: [
      { type: 'note', string: 1, fret: 0, finger: 0, repeats: 2, instruction: 'Pick the thin high E' },
      { type: 'note', string: 2, fret: 0, finger: 0, repeats: 2, instruction: 'Move down to the B string' },
      { type: 'note', string: 3, fret: 0, finger: 0, repeats: 2, instruction: 'Now pick the G string' }
    ]
  },
  {
    id: 'one-fret',
    title: 'Fretting one note',
    skill: 'A clear fretted note',
    tip: 'Press just behind the fret wire. Keep your wrist and thumb relaxed.',
    exercises: [
      { type: 'note', string: 1, fret: 1, finger: 1, repeats: 3, instruction: 'Play F with finger 1' },
      { type: 'note', string: 3, fret: 2, finger: 2, repeats: 3, instruction: 'Play A with finger 2' }
    ]
  },
  {
    id: 'two-note-change',
    title: 'Two-note changes',
    skill: 'Moving without extra noise',
    tip: 'Mute before moving, then place the next finger and pick once.',
    exercises: [
      {
        type: 'phrase',
        instruction: 'Change between open E and F',
        repeats: 2,
        notes: [
          { string: 1, fret: 0, duration: 1 },
          { string: 1, fret: 1, duration: 1 }
        ]
      },
      {
        type: 'phrase',
        instruction: 'Change strings: E to C',
        repeats: 2,
        notes: [
          { string: 1, fret: 0, duration: 1 },
          { string: 2, fret: 1, duration: 1 }
        ]
      }
    ]
  },
  {
    id: 'familiar-phrase',
    title: 'A familiar phrase',
    skill: 'Three notes with a count-in',
    tip: 'Listen to the count-in, then play one clean pick for each card.',
    unlockSongs: true,
    exercises: [
      {
        type: 'phrase',
        instruction: 'Play the opening of Ode to Joy',
        repeats: 2,
        notes: [
          { string: 1, fret: 0, duration: 1 },
          { string: 1, fret: 0, duration: 1 },
          { string: 1, fret: 1, duration: 1 },
          { string: 1, fret: 3, duration: 2 }
        ]
      }
    ]
  }
];

const FIRST_RUN = [
  {
    type: 'welcome',
    title: 'Play your first phrase',
    body: 'No account and no pressure. We’ll check the sound, tune quickly, then play three notes.'
  },
  {
    type: 'hold',
    title: 'Hold, relax, pick',
    body: 'Pinch the pick gently between thumb and index finger. Leave only the tip showing.',
    tips: ['Use a small wrist motion', 'Mute the string before picking again']
  },
  { type: 'sound', title: 'Turn up and play' },
  { type: 'tuner', title: 'Quick tune' },
  {
    type: 'phrase',
    title: 'Your first phrase',
    notes: [
      { string: 1, fret: 0, duration: 1 },
      { string: 1, fret: 0, duration: 1 },
      { string: 1, fret: 1, duration: 2 }
    ]
  },
  {
    type: 'win',
    title: 'You played it!',
    body: 'That was real music. Choose who played so the next short session is ready.'
  }
];

class LearningProgress {
  constructor(profile) {
    this.profile = profile;
    this.completed = [];
    this.load();
  }

  get key() {
    return `guitar-progress-${this.profile}`;
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.key) || '{}');
      this.completed = Array.isArray(saved.completed) ? saved.completed : [];
    } catch {
      this.completed = [];
    }
  }

  save() {
    localStorage.setItem(this.key, JSON.stringify({ completed: this.completed }));
  }

  complete(id) {
    if (!this.completed.includes(id)) this.completed.push(id);
    this.save();
  }

  nextLesson() {
    return LEARNING_PATH.find(lesson => !this.completed.includes(lesson.id)) || LEARNING_PATH[0];
  }

  songsUnlocked() {
    return this.completed.includes('familiar-phrase');
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LEARNING_PATH, FIRST_RUN, LearningProgress };
}
