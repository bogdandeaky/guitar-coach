# Pick & Play

A small, static guitar-practice app for Bogdan and Aron. It is designed for a phone or tablet near a clean electric-guitar amp and stores everything locally in the browser.

There is no backend, account, build step, advertising, or backing track.

## What is implemented

- A first-run path: pick-hold tip → microphone level check → guided tuner → three-note phrase → first achievement → profile choice.
- Two local profiles with separate lesson progress.
- Four short lessons: open strings, one fretted note, two-note changes, and a familiar phrase.
- Stationary wait-for-me note cards before performance practice unlocks.
- An auto tuner for standard tuning:
  - string 1: thin high E, E4
  - string 2: B3
  - string 3: G3
  - string 4: D3
  - string 5: A2
  - string 6: thick low E, E2
- Happy Birthday and the opening of Twinkle Twinkle as single-note arrangements.
- Rhythm bars whose widths reflect note duration, adjustable tempo, count-in, wait-for-me, and predefined phrase loops.
- ASCII tab and JSON import under **My songs**, saved in `localStorage`.
- Screen Wake Lock while listening or playing, including reacquisition after the page becomes visible.
- Explicit pause/resume after an interruption.

## Audio behavior

The app requests microphone audio only after a user tap with:

```js
{
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
}
```

It shows the settings the browser actually reports through `MediaStreamTrack.getSettings()`.

Pitch detection uses a 4096-sample YIN window. Practice and sound checks use a 300 ms confidence window: at least 75% of frames must have clarity ≥0.8 and stable pitch in the 75–1400 Hz guitar range. Brief weak readings are tolerated; more than 100 ms without a clear, stable reading resets the window. Scoring uses the detector’s filtered pitch and the window’s median, so isolated harmonic glitches do not produce wrong attempts. Practice also requires a pick onset and a match within 50 cents of the exact target octave. Noise, brief bursts and gliding pitches cannot advance the cards. These are pitch-based checks, not a guitar-versus-voice classifier: a deliberately held, steady sung note can resemble an instrument.

Lessons and the intro keep green feedback until you press Next. Songs show Right! briefly, then automatically advance within a phrase; Pause/Resume is available during play. Every phrase ends at a result with notes right / attempts, Try again and Next. Whole song plays one phrase at a time; result Next starts the following phrase, or returns Home after the final phrase. Lesson drill cards are presented once; musical repeated notes remain separate picks. Skip jumps past adjacent identical targets and crosses into the next exercise when needed; only the end of the lesson shows the final lesson result. Completed lessons and the intro can be replayed from Today without clearing saved progress.

The tuner shows string names, tightening/loosening directions and all six session checkmarks. In tune requires 500 ms within ±5 cents of the open string, with good clarity. A note is marked stopped too fast only after a confirmed early disappearance near the noise floor within 150 ms; normal slow decay is accepted. Retry clears attack and decay state. Pure gates and progression live in `practice.js` and are tested in Node.

Place the phone 30–50 cm from the amp speaker with its bottom microphone facing the amp. Use the clean channel at low-to-medium volume. Keep the phone off the amp and away from talking or TV.

Browsers and devices may decline requested microphone constraints. The displayed applied-settings line is authoritative.

## Run locally

Microphone access works on `localhost`:

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173>.

Run the synthetic pitch and parser tests with:

```bash
node test.js
```

## Publish free over HTTPS

Microphone access on a phone requires HTTPS.

### GitHub Pages

1. Push these files to a GitHub repository.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, `main`, and `/ (root)`.
4. Open the generated `https://<name>.github.io/<repository>/` URL on the phone.

The same folder can be deployed without configuration to Netlify, Cloudflare Pages, or Vercel.

## Tab import

Paste adjacent string lines in the usual order:

```text
e|--0--1--3--|
B|------------|
G|------------|
D|------------|
A|------------|
E|------------|
```

The parser supports:

- repeated six-line blocks mixed with headings and lyrics;
- uppercase or lowercase string labels;
- CRLF line endings and uneven line lengths;
- frets 0–24, including two-digit frets;
- common technique characters (`h`, `p`, `/`, `\`, `~`), which are ignored.

The app intentionally does not score chords or strums. If notes align vertically, import keeps the highest-pitched string and records a warning in the saved song data.

Optional JSON format:

```json
{
  "title": "Exercise",
  "bpm": 70,
  "notes": [
    { "string": 1, "fret": 0, "duration": 1 },
    { "string": 1, "fret": 1, "duration": 2 }
  ]
}
```

Note names and octaves are derived from string and fret so displayed tab cannot disagree with the expected pitch.

## Limitations

- Single notes only; chords, strums, bends, slides, and expressive techniques are not scored.
- Imported tab has no authoritative rhythm notation, so spacing is converted to approximate durations.
- Automatic pitch recognition can still struggle with distortion, room echoes, very low phone gain, or sympathetic strings.
- Wake Lock availability and applied microphone constraints depend on the browser.
- Twinkle Twinkle is an opening phrase rather than the full melody.
