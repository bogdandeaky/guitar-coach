# Pick & Play

A small, static guitar-practice app for Bogdan and Aron. It is designed for a phone or tablet near a clean electric-guitar amp and stores everything locally in the browser.

There is no backend, account, build step, advertising, or backing track.

## What is implemented

- A first-run path: pick-hold tip, one-time sound check and guided tuner, four practice steps, achievement, then profile choice.
- Two local profiles with separate lesson progress.
- Four starter lessons plus a lower-string lesson, with 8-11 notes per exercise.
- Stationary wait-for-me note cards before performance practice unlocks.
- An auto tuner for standard tuning:
  - string 1: thin high E, E4
  - string 2: B3
  - string 3: G3
  - string 4: D3
  - string 5: A2
  - string 6: thick low E, E2
- Eight single-note melody/riff arrangements, with explicit parts and continuous Whole song mode.
- Rhythm bars, adjustable tempo, count-in, wait-for-me, and a Whole song / individual part selector.
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

Lessons, intro steps, and songs show Right! briefly, then automatically advance to the next note. Wrong, muted, or unclear notes stay for retry. Each lesson exercise or intro step ends at one result with notes right / attempts, Try again and Next. Whole song flows across parts to one final result; individual part mode offers Next part, Try again, and Play whole song. Skip jumps past adjacent identical targets and stops at the exercise result. Completed lessons and the intro can be replayed without clearing saved progress.

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


## Round 2 practice updates

Sound check and guided tuning run once per browser (`soundCheckDone` in
localStorage). Settings > Redo sound check repeats setup. Microphone access is
still obtained when practice starts. The header Tuner returns to the same
screen/card. Lessons and intro have Pause/Resume.

All four original starter steps remain: open strings, one fretted note,
two-note changes, and a familiar phrase. Each exercise has 8-11 notes. The
first-use intro has a pick demonstration followed by four practice steps,
with one result per step. An additional lower-string lesson covers all six
strings through fret 5. Original lesson IDs, including `one-fret`, retain saved
progress; unknown IDs are ignored.

Correct notes briefly show "Right!" and automatically advance within the step.
Wrong, muted or unclear notes stay for retry. Each exercise ends with a
notes-right/attempt count and explicit Try again / Next controls. Skip finds a
different card and stops at the exercise result. Exercises never advance
without Next.

Songs now also include Smoke on the Water, Iron Man, Seven Nation Army (main
riff), Ode to Joy (main theme), Jingle Bells (chorus), and Mary Had a Little Lamb.
The four new arrangements use two strings and frets 0-5. Their `pitchPhrases`
record the melody notes before mapping to guitar positions; tests independently
check the requested opening phrases and validate pitch against string/fret.
These are easy melody/riff arrangements, not complete band transcriptions.
Melody references checked: [Seven Nation Army lesson/tab](https://www.theguitarlesson.com/wp-content/uploads/lessons/seven-nation-army-guitar-tabs.pdf),
[Ode to Joy and Jingle Bells score](https://nebomusic.net/arduinolessons/Project_03_Piezo_Music_SketchVersion.pdf),
and [Mary Had a Little Lamb melody lesson](https://onlinepianokeyboard.com/learn/first-song).

Whole song is selected every time a song opens. It flows continuously through
all parts with one final result. The player always shows Part X of N, notes
done in the part, overall progress, and a part progress bar. Choose an individual
part in Practice mode to get a "Part X of N done" result with Try again,
Next part, and Play whole song controls. Next part is disabled after the final
part; Play whole song starts from the beginning.

Validation: `node test.js` and `node --check` for every JavaScript file. No new
dependencies or server are required; asset paths remain relative.
