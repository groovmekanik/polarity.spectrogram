let audioContext
let analyser
let dataArray
let source
let isRunning = false

// Update the FFT size constants
const FFT_SIZES = [2048, 4096, 8192, 16384, 32768]
const DEFAULT_FFT_SIZE = 2048

/**
 * Initializes the audio context and analyzer.
 * @returns {Object} An object containing the analyser and dataArray.
 */
export function initAudio () {
  // We'll create the AudioContext here, but not start it yet
  return { analyser: null, dataArray: null, audioContext: null }
}

/**
 * Toggles the audio input on and off.
 * @returns {Promise<boolean>} A promise that resolves to the new state of the audio input.
 */
export function toggleAudio () {
  if (isRunning) {
    return stopAudioInput()
  } else {
    return startAudioInput()
  }
}

/**
 * Starts the audio input.
 * @returns {Promise<boolean>} A promise that resolves to true if the audio input was started successfully.
 */
function startAudioInput () {
  if (isRunning) return Promise.resolve(true)

  // Check if mediaDevices API is supported
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const msg = 'MediaDevices API is not supported in this browser.'
    console.error(msg)
    return Promise.resolve(false)
  }

  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048 // Default FFT size, can be changed later
    dataArray = new Uint8Array(analyser.frequencyBinCount)
  }

  return navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      isRunning = true
      return audioContext.resume()
    })
    .then(() => {
      console.log('Audio context started successfully')
      return true
    })
    .catch(err => {
      console.error('Error accessing microphone:', err)
      window.alert('Microphone access denied. Please allow access to use this feature.')
      return false
    })
}

/**
 * Stops the audio input.
 * @returns {Promise<boolean>} A promise that resolves to false when the audio input is stopped.
 */
function stopAudioInput () {
  if (!isRunning) return Promise.resolve(false)

  source.disconnect()
  isRunning = false
  return audioContext.suspend().then(() => false)
}

/**
 * Updates the FFT size of the analyser.
 * @param {number} size - The new FFT size.
 * @returns {Object} The updated analyser and dataArray.
 */
export function updateFFTSize (size) {
  if (FFT_SIZES.includes(size) && analyser) {
    analyser.fftSize = size
    dataArray = new Uint8Array(analyser.frequencyBinCount)
  }
  return { analyser, dataArray }
}

/**
 * Gets the current audio data.
 * @returns {Object} An object containing the analyser, dataArray, and audioContext.
 */
export function getAudioData () {
  return { analyser, dataArray, audioContext }
}
