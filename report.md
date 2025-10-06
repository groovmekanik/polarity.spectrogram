# Polarity Spectrogram – Accuracy PRD and Implementation Plan

## Goal
Achieve an accurate, reproducible Time–Frequency Reassigned Spectrogram matching the canonical method (per Flandrin/Auger/Fitz and librosa.reassigned_spectrogram) and provide guidance to port to JUCE plugins and Max for Live JSUI.

## References
- librosa.reassigned_spectrogram API and notes: https://librosa.org/doc/latest/generated/librosa.reassigned_spectrogram.html#librosa.reassigned_spectrogram
- Flandrin, Auger, Chassande-Mottin (2002); Fulop & Fitz (2006) cited in the above docs.

---

## Current State (Summary)
- Multi-taper Hermite approach with frequency-only reassignment heuristics in `timeFrequencyReassignment.js`.
- Derivative window `Dh` is computed and used; time-weighted window `Th` is computed but unused.
- No explicit complex-ratio S_th/S_h or S_dh/S_h; no time reassignment; fixed ±50 Hz clamp and visual weighting around 500 Hz.
- Custom FFT in `utils/fft.js` is non-standard and risks incorrect spectra.

Risks: Inaccurate STFT, incorrect reassignment vectors, display-only byte scaling, undefined frame sizing vs `analyser.getFloatTimeDomainData` length.

---

## Product Requirements

### Scope
- Implement canonical reassigned spectrogram that returns `(freqs, times, mags)` per frame and bin.
- Preserve a visualization path, but the computational core must be API-clean and unit-testable.

### Must-Haves
1. STFT Core
   - Parameterized `nFft`, `hopLength`, `winLength`, `window` (Hann default), `center` (recommend `false`).
   - Robust FFT: replace custom FFT with a correct Cooley–Tukey or use WebAudio OfflineAudioContext FFT if allowed; otherwise use a well-tested JS FFT (no external dep preferred, but correctness is required).
   - Zero-padding policy if `center=true`.

2. Reassignment Vectors
   - Compute three complex STFTs per frame: `S_h` (original window), `S_dh` (derivative window), `S_th` (time-weighted window).
   - Frequency reassignment: `omega_reassigned = omega - imag(S_dh / S_h)`.
   - Time reassignment: `t_reassigned = t + real(S_th / S_h)`.
   - Handle bins with power below `refPower` → NaN unless `fillNan` is true; `clip` times/freqs to valid ranges when enabled.

3. API
   - New module `reassigned.js` exporting `reassignedSpectrogram({ y, sr, nFft, hopLength, winLength, window, center, refPower, fillNan, clip }) -> { freqs, times, mags }`.
   - Keep `spectrogramRenderer.js` display decoupled; it can choose to display either standard magnitude spectrogram or scatter of `(times, freqs)` colored by mags (dB scaled).

4. Numerical Stability and Real-Time Considerations
   - Avoid allocation in per-sample inner loops; pre-allocate frames and FFT plans. Guard against denormals by small DC offsets where needed.
   - Use `float` processing; double for accumulations where needed.
   - Deterministic outputs for given inputs.

5. Tests & Validation
   - Unit tests for STFT windowing (energy preservation within tolerance), reassignment formulas on synthetic tones/chirps, and boundary handling.
   - Compare against a reference (Python + librosa) with fixtures to validate mean absolute error of `(times, freqs)` within small tolerances (e.g., < 1 sample hop for time, < 1 bin for frequency on single-sinusoid; tighter when SNR>40 dB).

6. Backward Compatibility
   - Keep the existing visualization working. Add a toggle to use accurate reassignment path.

### Nice-to-Haves
- Multi-taper (Hermite) option layered on top of canonical reassignment (average vectors or mags). Off by default.
- Window factories: Hann, Blackman-Harris, Gaussian.
- CPU profiling hooks.

---

## Acceptance Criteria
- Functionality
  - `reassignedSpectrogram` returns arrays with shapes `(1 + nFft/2, nFrames)` for `freqs`, `times`, `mags`.
  - Frequency/time NaNs produced for low-power bins unless `fillNan=true`.
  - `clip=true` clamps to `[0, sr/2]` for frequency and `[0, len(y)/sr]` for time.
- Accuracy
  - On a single sinusoid test at 1 kHz, SNR ≥ 40 dB, the median absolute frequency error < 5 Hz; time reassignment points to the tone’s center within ≤ hopLength/(2*sr) seconds.
  - On a linear chirp, reassigned ridge tracks within 1 bin median error.
- Performance
  - Processes 10 seconds of mono 44.1 kHz audio with `nFft=2048`, `hopLength=512` under 150 ms on an M1/M2 Mac in release build.
- Visualization
  - Toggle in UI to render reassigned scatter overlay; color by mags in dB.

---

## Implementation Plan (Minimal Code Changes)

1. Add `utils/stft.js`
   - Correct radix-2 FFT (or small, vetted FFT implementation). Plan caching per `nFft`.
   - STFT function producing complex arrays for `S_h`, `S_dh`, `S_th`.

2. Add `dsp/windows.js`
   - Window generation: Hann; derivative of Hann; time-weighted Hann (centered index weighting).
   - Optionally Gaussian for future use.

3. New file `reassigned.js`
   - Implement canonical reassignment equations.
   - Parameters: `{ y, sr, nFft, hopLength, winLength, window, center=false, refPower=1e-6, fillNan=false, clip=true }`.
   - Returns `{ freqs, times, mags }` as Float32Array matrices.

4. Integrate with `spectrogramRenderer.js`
   - Add optional path to call `reassignedSpectrogram` and draw reassigned scatter.
   - Keep existing mode unchanged when disabled.

5. Deprecate/Retain
   - Keep `timeFrequencyReassignment.js` behind a feature flag for experimentation; note that it is non-canonical.

6. Tests
   - Add simple fixtures (generated tones/chirps) and checks against expected outcomes.

---

## Technical Notes

- Window Derivative (example Hann): if `w[n] = 0.5 - 0.5 cos(2πn/(N-1))`, then `dw/dn = (π/(N-1)) sin(2πn/(N-1))`; scale properly for discrete-time and sample-rate when computing `S_dh/S_h` contribution to instantaneous frequency (frequency in Hz via `(sr/(2π)) * imag(log-derivative)`).
- Time-weighted window: `t[n] = (n - (winLength-1)/2)` if `center=false`; multiply by `w[n]` for `S_th`. Reassigned time in seconds: `t_frame_seconds + real(S_th/S_h)/sr` when hop-to-time mapping is consistent.
- Guard bins where `|S_h|^2 < refPower`.

---

## Porting Guidance

### JUCE Audio Plugin (C++)
- Structure
  - Real-time processor: pre-allocate FFT buffers, windows, and derivative/time-weighted windows in `prepareToPlay`.
  - Process blocks: accumulate frames with hop indexing; avoid allocations and locks; use `dsp::FFT` or custom FFT with plan reuse.
- Data Types
  - Use `float` for per-sample, `double` for accumulations if needed.
  - SIMD via JUCE’s `dsp::SIMDRegister` for windowing and magnitude.
- Threading
  - Compute reassignment in the audio thread only if output is needed for audio-rate control; otherwise push minimal stats to a GUI-safe FIFO and render visuals in the editor thread.
- API Surface
  - Parameters for `nFft`, `hopLength`, `window`, `refPower`, toggles for `fillNan`, `clip`.
- Testing/Benchmarks
  - Add a standalone test target using JUCE UnitTest for tones/chirps; profile `processBlock` max times; ensure no allocations.

### Max for Live JSUI (JavaScript)
- Constraints
  - JSUI runs in UI thread; heavy DSP should be moved to a `node.script` or `gen~` where possible.
- Approach
  - Use `node.script` for the reassigned computation with a correct JS FFT; communicate `(times, freqs, mags)` via lightweight messages to JSUI for drawing.
  - If staying in JSUI, reduce `nFft` and hop; pre-allocate TypedArrays and reuse.
- Drawing
  - Use scatter plotting and decibel color mapping; throttle redraws to UI frame rate.

---

## Rollout & Milestones
- M1: Core STFT + windows + canonical reassignment in `reassigned.js` (tests on tones)
- M2: UI integration toggle + dB mapping + scatter overlay
- M3: Fixtures vs librosa reference; tolerance thresholds satisfied
- M4: Porting examples for JUCE and Max for Live; documentation updates

---

## Open Questions / Risks
- Choice of FFT: bring in a minimal, vetted FFT implementation vs maintaining our custom one.
- Multi-channel support (out of scope for first pass?).
- Performance targets on lower-power devices; may require reducing `nFft` or using WebAssembly.
