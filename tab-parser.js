/**
 * Pragmatic parser for common Ultimate Guitar-style six-line ASCII tabs.
 * It intentionally produces one note at a time; simultaneous notes are
 * reduced to the highest-pitched string and reported in `warnings`.
 */
class TabParser {
  constructor() {
    this.noteDetector = typeof NoteDetector !== 'undefined' ? new NoteDetector() : null;
  }

  normalize(text) {
    return text.replace(/\r/g, '').replace(/\t/g, '    ');
  }

  parseLine(line) {
    // Accept e|--, E|--, e:-- and tuning labels such as D#|--.
    const match = line.match(/^\s*([A-Ga-g])(?:[#b])?\s*[|:]\s*(.*)$/);
    if (!match) return null;
    const content = match[2];
    if (!/[-0-9xX|]/.test(content)) return null;
    return { label: match[1], content };
  }

  findSections(text) {
    const lines = this.normalize(text).split('\n');
    const sections = [];
    let pending = [];

    const flush = () => {
      if (pending.length >= 3) sections.push(pending);
      pending = [];
    };

    for (const rawLine of lines) {
      const parsed = this.parseLine(rawLine);
      if (!parsed) {
        flush();
        continue;
      }
      pending.push(parsed);
      if (pending.length === 6) flush();
    }
    flush();
    return sections;
  }

  assignStrings(section) {
    if (section.length === 6) {
      // Real tabs often use uppercase E for both outside strings. Row order is
      // more reliable than case: high E, B, G, D, A, low E.
      return section.map((line, index) => ({ ...line, string: index + 1 }));
    }

    const labelMap = { e: 1, b: 2, g: 3, d: 4, a: 5 };
    return section.map((line, index) => {
      const lower = line.label.toLowerCase();
      let string = labelMap[lower];
      if (lower === 'e') string = index === 0 ? 1 : 6;
      return { ...line, string };
    }).filter(line => line.string);
  }

  tokenPositions(content) {
    const tokens = [];
    const regex = /\d{1,2}/g;
    let match;
    while ((match = regex.exec(content))) {
      const fret = Number(match[0]);
      if (fret <= 24) tokens.push({ column: match.index, fret });
    }
    return tokens;
  }

  parseSection(section, warnings) {
    const rows = this.assignStrings(section).map(row => ({
      ...row,
      tokens: this.tokenPositions(row.content)
    }));
    const events = new Map();
    for (const row of rows) {
      for (const token of row.tokens) {
        if (!events.has(token.column)) events.set(token.column, []);
        events.get(token.column).push({ string: row.string, fret: token.fret });
      }
    }

    const columns = [...events.keys()].sort((a, b) => a - b);
    return columns.map((column, index) => {
      const candidates = events.get(column).sort((a, b) => a.string - b.string);
      if (candidates.length > 1) {
        warnings.push(`Chord at column ${column + 1} reduced to string ${candidates[0].string}.`);
      }
      const picked = candidates[0];
      const noteInfo = this.noteAt(picked.string, picked.fret);
      const nextColumn = columns[index + 1];
      const gap = nextColumn == null ? 3 : Math.max(1, nextColumn - column);
      return {
        ...picked,
        ...noteInfo,
        duration: Math.max(0.25, Math.min(4, Math.round((gap / 3) * 4) / 4))
      };
    });
  }

  noteAt(string, fret) {
    if (this.noteDetector) return this.noteDetector.noteAt(string, fret);
    const openMidi = { 1: 64, 2: 59, 3: 55, 4: 50, 5: 45, 6: 40 };
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = openMidi[string] + fret;
    return { note: names[midi % 12], octave: Math.floor(midi / 12) - 1 };
  }

  parseTab(text, title = 'Imported Song') {
    const sections = this.findSections(text);
    if (!sections.length) {
      throw new Error('No playable tab found. Paste at least 3 adjacent string lines in e| B| G| D| A| E| format.');
    }
    const warnings = [];
    const notes = sections.flatMap(section => this.parseSection(section, warnings));
    if (!notes.length) throw new Error('The tab contains no fret numbers to play.');
    return {
      id: `custom-${Date.now()}`,
      title: title.trim() || 'Imported Song',
      bpm: 70,
      description: 'Imported single-note tab',
      notes,
      warnings
    };
  }

  parseJSON(jsonText) {
    const data = JSON.parse(jsonText);
    if (!data || typeof data.title !== 'string' || !Array.isArray(data.notes) || !data.notes.length) {
      throw new Error('JSON needs a title and a non-empty notes array.');
    }
    const notes = data.notes.map((raw, index) => {
      const string = Number(raw.string);
      const fret = Number(raw.fret);
      if (!Number.isInteger(string) || string < 1 || string > 6) {
        throw new Error(`Note ${index + 1}: string must be 1-6.`);
      }
      if (!Number.isInteger(fret) || fret < 0 || fret > 24) {
        throw new Error(`Note ${index + 1}: fret must be 0-24.`);
      }
      return {
        string,
        fret,
        ...this.noteAt(string, fret),
        duration: Number(raw.duration) > 0 ? Number(raw.duration) : 1
      };
    });
    return {
      id: data.id || `custom-${Date.now()}`,
      title: data.title.trim(),
      bpm: Number(data.bpm) > 0 ? Number(data.bpm) : 70,
      description: data.description || 'Imported JSON song',
      notes,
      warnings: []
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TabParser };
}
