/**
 * Built-in songs for guitar practice
 * Carefully arranged for beginners
 * Songs are in JSON format: {title, notes: [{string, fret, note, octave, duration}]}
 */

const BUILTIN_SONGS = [
  {
    id: 'happy-birthday',
    title: 'Happy Birthday',
    difficulty: 'beginner',
    bpm: 80,
    description: 'Classic birthday song - single notes on G, B, and high E strings (key of C)',
    notes: [
      // G0 G0 G2 G0 C0 B0
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 0.75 },
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 0.25 },
      { string: 3, fret: 2, note: 'A', octave: 3, duration: 1.0 },
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 1.0 },
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 1.0 },
      { string: 2, fret: 0, note: 'B', octave: 3, duration: 2.0 },
      
      // G0 G0 G2 G0 D1 C0
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 0.75 },
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 0.25 },
      { string: 3, fret: 2, note: 'A', octave: 3, duration: 1.0 },
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 1.0 },
      { string: 2, fret: 3, note: 'D', octave: 4, duration: 1.0 },
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 2.0 },
      
      // G0 G0 e3 e0 B1 B0 G2
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 0.75 },
      { string: 3, fret: 0, note: 'G', octave: 3, duration: 0.25 },
      { string: 1, fret: 3, note: 'G', octave: 4, duration: 1.0 },
      { string: 1, fret: 0, note: 'E', octave: 4, duration: 1.0 },
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 1.0 },
      { string: 2, fret: 0, note: 'B', octave: 3, duration: 1.0 },
      { string: 3, fret: 2, note: 'A', octave: 3, duration: 1.0 },
      
      // e1 e1 e0 C0 D1 C0
      { string: 1, fret: 1, note: 'F', octave: 4, duration: 0.75 },
      { string: 1, fret: 1, note: 'F', octave: 4, duration: 0.25 },
      { string: 1, fret: 0, note: 'E', octave: 4, duration: 1.0 },
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 1.0 },
      { string: 2, fret: 3, note: 'D', octave: 4, duration: 1.0 },
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 2.0 }
    ]
  },
  
  {
    id: 'twinkle-twinkle',
    title: 'Twinkle Twinkle Little Star',
    difficulty: 'beginner',
    bpm: 75,
    description: 'Opening phrase on the B and high E strings',
    notes: [
      // Twinkle twinkle little star
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 1.0 },
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 1.0 },
      { string: 1, fret: 3, note: 'G', octave: 4, duration: 1.0 },
      { string: 1, fret: 3, note: 'G', octave: 4, duration: 1.0 },
      { string: 1, fret: 5, note: 'A', octave: 4, duration: 1.0 },
      { string: 1, fret: 5, note: 'A', octave: 4, duration: 1.0 },
      { string: 1, fret: 3, note: 'G', octave: 4, duration: 2.0 },
      
      // How I wonder what you are
      { string: 1, fret: 1, note: 'F', octave: 4, duration: 1.0 },
      { string: 1, fret: 1, note: 'F', octave: 4, duration: 1.0 },
      { string: 1, fret: 0, note: 'E', octave: 4, duration: 1.0 },
      { string: 1, fret: 0, note: 'E', octave: 4, duration: 1.0 },
      { string: 2, fret: 3, note: 'D', octave: 4, duration: 1.0 },
      { string: 2, fret: 3, note: 'D', octave: 4, duration: 1.0 },
      { string: 2, fret: 1, note: 'C', octave: 4, duration: 2.0 }
    ]
  },
  {
  "id": "smoke-on-the-water",
  "title": "Smoke on the Water",
  "difficulty": "beginner",
  "bpm": 65,
  "description": "Easy single-string riff; move your hand gently between frets.",
  "notes": [
    {
      "string": 3,
      "fret": 0,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 3,
      "note": "A#",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 5,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": true
    },
    {
      "string": 3,
      "fret": 0,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 3,
      "note": "A#",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 6,
      "note": "C#",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 5,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": true
    },
    {
      "string": 3,
      "fret": 0,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 3,
      "note": "A#",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 5,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": true
    },
    {
      "string": 3,
      "fret": 3,
      "note": "A#",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 3,
      "fret": 0,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": true
    }
  ]
},
  {
  "id": "iron-man",
  "title": "Iron Man",
  "difficulty": "beginner",
  "bpm": 65,
  "description": "Easy single-string riff; move your hand gently between frets.",
  "notes": [
    {
      "string": 6,
      "fret": 7,
      "note": "B",
      "octave": 2,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 10,
      "note": "D",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 10,
      "note": "D",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 12,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 12,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": true
    },
    {
      "string": 6,
      "fret": 15,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 14,
      "note": "F#",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 15,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 14,
      "note": "F#",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 15,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 14,
      "note": "F#",
      "octave": 3,
      "duration": 1,
      "phraseEnd": true
    },
    {
      "string": 6,
      "fret": 10,
      "note": "D",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 10,
      "note": "D",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 12,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 6,
      "fret": 12,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": true
    }
  ]
},
  {
  "id": "seven-nation-army",
  "title": "Seven Nation Army (main riff)",
  "difficulty": "beginner",
  "bpm": 70,
  "description": "Easy melody arrangement on two strings, frets 0-5.",
  "pitchPhrases": [
    "E3 E3 G3 E3 D3 C3 B2",
    "E3 E3 G3 E3 D3 C3 D3 C3 B2"
  ],
  "notes": [
    {
      "string": 4,
      "fret": 2,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 2,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 5,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 2,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 0,
      "note": "D",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 5,
      "fret": 3,
      "note": "C",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 5,
      "fret": 2,
      "note": "B",
      "octave": 2,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 4,
      "fret": 2,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 2,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 5,
      "note": "G",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 2,
      "note": "E",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 0,
      "note": "D",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 5,
      "fret": 3,
      "note": "C",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 4,
      "fret": 0,
      "note": "D",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 5,
      "fret": 3,
      "note": "C",
      "octave": 3,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 5,
      "fret": 2,
      "note": "B",
      "octave": 2,
      "duration": 2,
      "phraseEnd": true
    }
  ]
},
  {
  "id": "ode-to-joy",
  "title": "Ode to Joy (main theme)",
  "difficulty": "beginner",
  "bpm": 70,
  "description": "Easy melody arrangement on two strings, frets 0-5.",
  "pitchPhrases": [
    "E4 E4 F4 G4 G4 F4 E4 D4",
    "C4 C4 D4 E4 E4 D4 D4",
    "E4 E4 F4 G4 G4 F4 E4 D4",
    "C4 C4 D4 E4 D4 C4 C4"
  ],
  "notes": [
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    }
  ]
},
  {
  "id": "jingle-bells",
  "title": "Jingle Bells (chorus)",
  "difficulty": "beginner",
  "bpm": 70,
  "description": "Easy melody arrangement on two strings, frets 0-5.",
  "pitchPhrases": [
    "E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4",
    "F4 F4 F4 F4 F4 E4 E4 E4 E4 E4 D4 D4 E4 D4 G4",
    "E4 E4 E4 E4 E4 E4 E4 G4 C4 D4 E4",
    "F4 F4 F4 F4 F4 E4 E4 E4 E4 G4 G4 F4 D4 C4"
  ],
  "notes": [
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 1,
      "note": "F",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    }
  ]
},
  {
  "id": "mary-had-a-little-lamb",
  "title": "Mary Had a Little Lamb",
  "difficulty": "beginner",
  "bpm": 70,
  "description": "Easy melody arrangement on two strings, frets 0-5.",
  "pitchPhrases": [
    "E4 D4 C4 D4 E4 E4 E4",
    "D4 D4 D4 E4 G4 G4",
    "E4 D4 C4 D4 E4 E4 E4 E4",
    "D4 D4 E4 D4 C4"
  ],
  "notes": [
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 3,
      "note": "G",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 1,
      "fret": 0,
      "note": "E",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 3,
      "note": "D",
      "octave": 4,
      "duration": 1,
      "phraseEnd": false
    },
    {
      "string": 2,
      "fret": 1,
      "note": "C",
      "octave": 4,
      "duration": 2,
      "phraseEnd": true
    }
  ]
},
];

// Export for use in both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BUILTIN_SONGS };
}
