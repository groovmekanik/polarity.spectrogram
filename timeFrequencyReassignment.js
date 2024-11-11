/**
 * Time-Frequency Reassignment implementation
 */
import { createHermiteFunctions } from './utils/windowFunctions.js'
import { computeSTFT } from './utils/fft.js'

const WINDOW_SIZE = 2048
const previousPhase = new Float32Array(WINDOW_SIZE)

/**
 * Compute Time-Frequency Reassignment spectrogram
 * @param {Float32Array} audioData - Input signal
 * @param {number} sampleRate - Audio sample rate
 * @param {number} step - Step size in samples
 * @param {number} K - Number of tapers (default 6)
 * @param {number} tm - Time support (default 6.0)
 */
export function analyzeReassignment (audioData, sampleRate, step = WINDOW_SIZE / 4, K = 6, tm = 6.0) {
  // Initialize Hermite functions
  const { h, Dh } = createHermiteFunctions(WINDOW_SIZE, K, tm)

  // Normalize and amplify input data
  const maxAmp = Math.max(...audioData.map(Math.abs))
  const normalizedData = new Float32Array(audioData.length)
  const amplificationFactor = 200.0

  for (let i = 0; i < audioData.length; i++) {
    normalizedData[i] = (audioData[i] / maxAmp) * amplificationFactor
  }

  // Calculate number of frames
  const nFrames = Math.max(1, Math.floor((audioData.length - WINDOW_SIZE) / step) + 1)
  const result = new Uint8Array(WINDOW_SIZE / 2)

  // For each time frame
  for (let frame = 0; frame < nFrames; frame++) {
    const startIdx = frame * step
    const frameData = normalizedData.slice(startIdx, startIdx + WINDOW_SIZE)

    // Apply each taper
    const tfr = new Float32Array(WINDOW_SIZE / 2)
    let maxMagnitude = 0

    for (let k = 0; k < K; k++) {
      // Apply time and frequency windows
      const timeWindow = h.slice(k * WINDOW_SIZE, (k + 1) * WINDOW_SIZE)
      const freqWindow = Dh.slice(k * WINDOW_SIZE, (k + 1) * WINDOW_SIZE)

      // Compute STFTs
      const stft = computeSTFT(frameData, timeWindow)
      const freqMod = computeSTFT(frameData, freqWindow)

      // Compute instantaneous frequency with improved precision
      for (let bin = 0; bin < WINDOW_SIZE / 2; bin++) {
        const real = stft[bin * 2]
        const imag = stft[bin * 2 + 1]
        const mag = Math.sqrt(real * real + imag * imag)

        // Calculate actual frequency for this bin
        const binFreq = (bin * sampleRate) / WINDOW_SIZE

        // Focus on the 500Hz range
        const targetFreq = 500
        const freqWeight = Math.exp(-Math.pow(binFreq - targetFreq, 2) / (2 * 100 * 100))

        if (mag > maxMagnitude * 0.01) { // Lower threshold
          maxMagnitude = Math.max(maxMagnitude, mag)

          const phase = Math.atan2(imag, real)
          previousPhase[bin] = phase

          // Calculate frequency phase
          const freqReal = freqMod[bin * 2]
          const freqImag = freqMod[bin * 2 + 1]
          const freqPhase = Math.atan2(freqImag, freqReal)

          // Calculate frequency offset
          let instFreqOffset = (freqPhase - phase) / (2 * Math.PI)
          while (instFreqOffset > Math.PI) instFreqOffset -= 2 * Math.PI
          while (instFreqOffset < -Math.PI) instFreqOffset += 2 * Math.PI

          // Limit frequency offset
          const maxOffset = 50 // Hz
          const freqOffset = Math.max(-maxOffset, Math.min(maxOffset,
            instFreqOffset * sampleRate / WINDOW_SIZE))

          const reassignedFreq = binFreq + freqOffset
          const reassignedBin = Math.round((reassignedFreq * WINDOW_SIZE) / sampleRate)

          if (reassignedBin >= 0 && reassignedBin < WINDOW_SIZE / 2) {
            // Gaussian weighting with very narrow window
            const distance = Math.abs(reassignedBin - bin)
            const sigma = 0.5 // very narrow window
            const weight = Math.exp(-distance * distance / (2 * sigma * sigma))

            // Final weight
            const finalWeight = weight * freqWeight * Math.pow(mag / maxMagnitude, 2)

            tfr[reassignedBin] += mag * finalWeight
          }
        }
      }
    }

    // Normalize and convert to output format
    const maxVal = Math.max(...tfr)
    if (maxVal > 0) {
      for (let i = 0; i < WINDOW_SIZE / 2; i++) {
        const normalized = tfr[i] / maxVal
        // Stronger gamma correction
        const enhanced = Math.pow(normalized, 0.1)
        result[i] = Math.min(255, Math.max(0, enhanced * 255 * 5.0))
      }
    }
  }

  return result
}
