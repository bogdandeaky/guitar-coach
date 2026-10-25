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
];

// Export for use in both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BUILTIN_SONGS };
}
