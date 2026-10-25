const fs = require('node:fs');
const path = require('node:path');

const output = process.argv[2] || '/tmp/guitar-test-loop.wav';
const sampleRate = 44100;
const frequencies = [
  82.41, 110, 146.83, 196, 246.94, 329.63,
  349.23, 261.63, 220, 392, 440, 293.66
];
const samples = [];

function addSilence(seconds) {
  for (let i = 0; i < seconds * sampleRate; i += 1) samples.push(0);
}

function addGuitarTone(frequency, seconds) {
  const length = Math.floor(seconds * sampleRate);
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / (sampleRate * 0.012));
    const decay = Math.exp(-2.1 * t);
    const sample = attack * decay * (
      Math.sin(2 * Math.PI * frequency * t)
      + 0.44 * Math.sin(2 * Math.PI * frequency * 2 * t)
      + 0.2 * Math.sin(2 * Math.PI * frequency * 3 * t)
      + 0.035 * Math.sin(2 * Math.PI * 1733 * t)
    ) / 1.7;
    samples.push(sample * 0.46);
  }
}

addSilence(1.1);
for (let round = 0; round < 5; round += 1) {
  for (const frequency of frequencies) {
    addSilence(0.22);
    addGuitarTone(frequency, 0.58);
  }
}

const dataSize = samples.length * 2;
const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataSize, 40);
samples.forEach((sample, index) => {
  wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), 44 + index * 2);
});

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, wav);
console.log(`${output}: ${(samples.length / sampleRate).toFixed(1)}s, ${frequencies.length} guitar-like pitches`);
