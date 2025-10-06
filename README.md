# Audio Spectrogram
Try it out [on the web: Demo](https://bit.ly/3Z1b7xm)

## Description
A real-time audio spectrogram visualizer with time-frequency reassignment and MIDI export capabilities, implemented in vanilla JavaScript. 

## Features
- Real-time audio visualization
- Time-Frequency Reassignment for improved frequency resolution
- MIDI note detection and export
- Adjustable FFT size (up to 32768)
- Adjustable contrast and brightness
- Pause and resume functionality
- Drawing and exporting MIDI notes

## Requirements
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Node.js (for running the local dev server). No project dependencies or node_modules required.

## Development
```bash
npm run dev
# then open http://127.0.0.1:5173
```

Notes:
- Uses a tiny zero-dependency static server (`server.cjs`).
- If `node_modules` or `package-lock.json` exist, they can be deleted.

### See report.md for future development. Modified Repo for zero dependancies (too many node packages before)
