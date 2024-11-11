import { getColor } from './colorThemes.js'
import { frequencyToMIDI, saveMidiFile } from './utils/midiUtils.js'
import { analyzeReassignment } from './timeFrequencyReassignment.js'

/**
 * Global variables for the spectrogram renderer.
 */
let canvas, ctx, labelCanvas, labelCtx
const MIN_FREQUENCY = 30
let MAX_FREQUENCY = 22050
let MIN_DB = -100
let MAX_DB = -30
let contrast = 1
let brightness = 0

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MIN_NOTE = 21 // A0 (27,5 Hz)
const MAX_NOTE = 108 // C8 (4186 Hz)
const showPianoKeys = true

let mouseX = 0
let mouseY = 0
let isMouseOverCanvas = false

// Variables for persistence
let persistenceThreshold = 0
const frequencyHistory = new Map()

// Smoothing variables
const SMOOTHING_FACTOR = 0.8
const previousValues = new Float32Array(2048)

// Status variables for drawing and interaction
let isPaused = false
let isDrawing = false
const drawnNotes = new Map()
let drawingStartX = 0
let drawingStartY = 0

const TICKS_PER_BEAT = 480
const PIXELS_PER_BEAT = 100

// Persistence parameters
const PERSISTENCE_WINDOW = 500
const PERSISTENCE_MIN_AMPLITUDE = 0.15

let useReassignment = false

/**
 * Initializes the spectrogram renderer.
 */
export function initSpectrogramRenderer(mainCanvas, mainCtx, labelsCanvas, labelsCtx) {
  canvas = mainCanvas
  ctx = mainCtx
  labelCanvas = labelsCanvas
  labelCtx = labelsCtx

  if (!mainCanvas || !mainCanvas.getContext) {
    console.error('Invalid canvas reference')
    return
  }

  mainCanvas.addEventListener('mousemove', handleMouseMove)
  mainCanvas.addEventListener('mousedown', handleMouseDown)
  mainCanvas.addEventListener('mouseup', handleMouseUp)
  mainCanvas.addEventListener('mouseleave', handleMouseLeave)
  mainCanvas.addEventListener('mouseenter', handleMouseEnter)
  mainCanvas.addEventListener('dblclick', handleDoubleClick)

  return { updateSpectrogramm, togglePause }
}

/**
 * Toggles the pause state.
 */
export function togglePause() {
  isPaused = !isPaused
  if (!isPaused) {
    drawnNotes.clear()
    labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height)
    drawFrequencyMarkers()
  }
  return isPaused
}

/**
 * Updates the spectrogram visualization.
 */
export function updateSpectrogramm(analyser, dataArray, audioContext) {
  if (isPaused) {
    redrawAllNotes()
    return
  }

  // Get raw time domain data for reassignment
  const timeData = new Float32Array(analyser.frequencyBinCount)
  if (useReassignment) {
    analyser.getFloatTimeDomainData(timeData)
    dataArray = analyzeReassignment(timeData, audioContext.sampleRate)
  } else {
    analyser.getByteFrequencyData(dataArray)
  }

  // Shift the existing spectrogram to the left
  const imageData = ctx.getImageData(1, 0, canvas.width - 1, canvas.height)
  ctx.putImageData(imageData, 0, 0)

  const binCount = analyser.frequencyBinCount
  const nyquist = audioContext.sampleRate / 2
  const heightSteps = canvas.height * 2
  const currentTime = performance.now()

  const currentFrame = new Float32Array(heightSteps)

  // First pass: Calculate raw values
  for (let y = 0; y < heightSteps; y++) {
    const normalizedY = y / heightSteps
    const frequency = MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, 1 - normalizedY)
    const binIndexFloat = (frequency / nyquist) * binCount
    const binIndex1 = Math.floor(binIndexFloat)
    const binIndex2 = Math.min(binIndex1 + 1, dataArray.length - 1)
    const binFraction = binIndexFloat - binIndex1

    let amplitude = 0
    if (binIndex1 < dataArray.length) {
      amplitude = dataArray[binIndex1] * (1 - binFraction) + dataArray[binIndex2] * binFraction
    }

    currentFrame[y] = amplitude
  }

  // Second pass: Apply smoothing and draw
  for (let y = 0; y < heightSteps; y++) {
    // Spatial smoothing (vertical)
    let smoothedAmplitude = 0
    const smoothingRange = 2
    let weightSum = 0

    for (let offset = -smoothingRange; offset <= smoothingRange; offset++) {
      const sampleY = Math.max(0, Math.min(heightSteps - 1, y + offset))
      const weight = 1 / (1 + Math.abs(offset))
      smoothedAmplitude += currentFrame[sampleY] * weight
      weightSum += weight
    }

    smoothedAmplitude /= weightSum

    // Temporal smoothing
    smoothedAmplitude = SMOOTHING_FACTOR * previousValues[y] + (1 - SMOOTHING_FACTOR) * smoothedAmplitude
    previousValues[y] = smoothedAmplitude

    // Update frequency history
    const frequency = MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, 1 - y / heightSteps)
    const freqKey = Math.round(frequency)

    if (!frequencyHistory.has(freqKey)) {
      frequencyHistory.set(freqKey, [])
    }

    const history = frequencyHistory.get(freqKey)
    history.push({ time: currentTime, amplitude: smoothedAmplitude })

    while (history.length > 0 && currentTime - history[0].time > 1000) {
      history.shift()
    }

    const persistenceScore = calculatePersistenceScore(history)

    if (persistenceThreshold === 0 || persistenceScore > persistenceThreshold) {
      const db = 20 * Math.log10(smoothedAmplitude / 255)
      const normalizedDb = (db - MIN_DB) / (MAX_DB - MIN_DB)
      let value = Math.max(0, Math.min(1, normalizedDb))

      if (persistenceThreshold > 0) {
        const scaleFactor = (persistenceScore - persistenceThreshold) / (1 - persistenceThreshold)
        value *= Math.max(0, Math.min(1, scaleFactor))
      }

      value = (value - 0.5) * contrast + 0.5 + brightness
      value = Math.max(0, Math.min(1, value))

      ctx.fillStyle = getColor(value)
      const canvasY = Math.floor((y / heightSteps) * canvas.height)
      ctx.fillRect(canvas.width - 1, canvasY, 1, 1)
    }
  }

  // After drawing the spectrogram, overlay the notes
  if (drawnNotes.size > 0) {
    redrawAllNotes()
  }
}

/**
 * Calculates a persistence score for a frequency based on its history.
 */
export function calculatePersistenceScore(history) {
  if (history.length === 0) return 0

  const recentHistory = history.filter(entry => entry.time >= history[history.length - 1].time - PERSISTENCE_WINDOW)

  if (recentHistory.length === 0) return 0

  const avgAmplitude = recentHistory.reduce((sum, entry) => sum + entry.amplitude, 0) / recentHistory.length

  if (avgAmplitude < PERSISTENCE_MIN_AMPLITUDE * 255) return 0

  const variance = recentHistory.reduce((sum, entry) => {
    const diff = entry.amplitude - avgAmplitude
    return sum + diff * diff
  }, 0) / recentHistory.length

  const stdDev = Math.sqrt(variance)
  const relativeStdDev = stdDev / avgAmplitude

  const stabilityScore = Math.max(0, 1 - relativeStdDev)

  return stabilityScore
}

/**
 * Updates the persistence threshold.
 */
export function updatePersistence(value) {
  persistenceThreshold = value
}

/**
 * Draws frequency markers and piano keys on the label canvas.
 */
export function drawFrequencyMarkers() {
  if (!labelCtx || !labelCanvas) return

  labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height)
  const keyWidth = 25

  if (showPianoKeys) {
    const currentNote = isMouseOverCanvas ? getFrequencyInfo(mouseY).midiNote : null

    for (let midiNote = MIN_NOTE; midiNote <= MAX_NOTE; midiNote++) {
      const noteName = NOTES[midiNote % 12]
      const octave = Math.floor(midiNote / 12) - 1
      const isBlackKey = noteName.includes('#')
      const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)
      const normalizedY = (Math.log(frequency) - Math.log(MIN_FREQUENCY)) / (Math.log(MAX_FREQUENCY) - Math.log(MIN_FREQUENCY))
      const y = labelCanvas.height * (1 - normalizedY)

      if (!isBlackKey) {
        labelCtx.fillStyle = midiNote === currentNote ? '#aaf' : '#fff'
        labelCtx.strokeStyle = '#666'
        labelCtx.lineWidth = 1
        const keyHeight = labelCanvas.height / 52
        labelCtx.fillRect(0, y - keyHeight / 2, keyWidth, keyHeight)
        labelCtx.strokeRect(0, y - keyHeight / 2, keyWidth, keyHeight)

        if (noteName === 'C') {
          labelCtx.fillStyle = '#666'
          labelCtx.font = '10px Arial'
          labelCtx.fillText(`C${octave}`, 2, y + 4)
        }
      } else {
        labelCtx.fillStyle = midiNote === currentNote ? '#66f' : '#000'
        labelCtx.strokeStyle = '#444'
        labelCtx.lineWidth = 1

        const keyHeight = labelCanvas.height / 52
        const blackKeyWidth = keyWidth * 0.7
        const blackKeyHeight = keyHeight * 0.7
        labelCtx.fillRect(0, y - blackKeyHeight / 2, blackKeyWidth, blackKeyHeight)
        labelCtx.strokeRect(0, y - blackKeyHeight / 2, blackKeyWidth, blackKeyHeight)
      }
    }
  }

  // Draw frequency markers
  labelCtx.fillStyle = 'white'
  labelCtx.font = '10px Arial'
  const markers = [100, 500, 1000, 5000, 10000]

  markers.forEach(freq => {
    if (freq <= MAX_FREQUENCY) {
      const y = labelCanvas.height * (1 - (Math.log(freq) - Math.log(MIN_FREQUENCY)) / (Math.log(MAX_FREQUENCY) - Math.log(MIN_FREQUENCY)))
      const xOffset = showPianoKeys ? 30 : 5
      labelCtx.fillText(`${freq}Hz`, xOffset, y)
      labelCtx.beginPath()
      labelCtx.moveTo(0, y)
      labelCtx.lineTo(labelCanvas.width, y)
      labelCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      labelCtx.stroke()
    }
  })

  // Draw crosshair and info box
  if (isMouseOverCanvas) {
    const info = getFrequencyInfo(mouseY)

    // Draw horizontal line
    labelCtx.beginPath()
    labelCtx.moveTo(0, mouseY)
    labelCtx.lineTo(labelCanvas.width, mouseY)
    labelCtx.strokeStyle = 'rgba(255, 255, 0, 0.5)'
    labelCtx.stroke()

    // Info box
    const boxX = Math.min(mouseX + 10, labelCanvas.width - 130)
    const boxY = Math.min(Math.max(mouseY - 30, 10), labelCanvas.height - 50)

    labelCtx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    labelCtx.fillRect(boxX, boxY, 120, 40)

    labelCtx.fillStyle = 'yellow'
    labelCtx.font = '12px Arial'
    labelCtx.fillText(`Note: ${info.note}`, boxX + 5, boxY + 15)
    labelCtx.fillText(`Freq: ${info.frequency}Hz`, boxX + 5, boxY + 35)
  }
}

/**
 * Returns note and frequency information for a y-position.
 */
export function getFrequencyInfo(y) {
  const normalizedY = y / labelCanvas.height
  const frequency = MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, 1 - normalizedY)
  const midiNote = frequencyToMIDI(frequency)
  const noteName = NOTES[midiNote % 12]
  const octave = Math.floor(midiNote / 12) - 1

  return {
    frequency: Math.round(frequency),
    note: `${noteName}${octave}`,
    midiNote,
    height:normalizedY
  }
}

/**
 * Updates the frequency range for the spectrogram.
 */
export function updateFrequencyRange(maxFreq) {
  MAX_FREQUENCY = maxFreq
  drawFrequencyMarkers()
}

/**
 * Updates the dB range for the spectrogram.
 */
export function updateDbRange(minDb, maxDb) {
  MIN_DB = minDb
  MAX_DB = maxDb
}

/**
 * Updates the contrast and brightness of the spectrogram.
 */
export function updateContrastBrightness(newContrast, newBrightness) {
  contrast = newContrast
  brightness = newBrightness
}

/**
 * Redraws all saved notes.
 */
function redrawAllNotes() {
  for (const note of drawnNotes.values()) {
    drawNoteOnLabelCanvas(note.x, note.y, note.width)
  }
}

/**
 * Draws a note on the label canvas.
 */
function drawNoteOnLabelCanvas(x, y, width) {
  const noteHeight = 4
  const info = getFrequencyInfo(y)

  labelCtx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  labelCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
  labelCtx.lineWidth = 2
  labelCtx.fillRect(x - 1, y - noteHeight/2 - 1, width + 2, noteHeight + 2)
  labelCtx.strokeRect(x - 1, y - noteHeight/2 - 1, width + 2, noteHeight + 2)

  labelCtx.fillStyle = 'rgba(255, 255, 0, 0.5)'
  labelCtx.strokeStyle = 'rgba(255, 255, 0, 0.8)'
  labelCtx.lineWidth = 1
  labelCtx.fillRect(x, y - noteHeight/2, width, noteHeight)
  labelCtx.strokeRect(x, y - noteHeight/2, width, noteHeight)

  labelCtx.fillStyle = 'yellow'
  labelCtx.font = '10px Arial'
  labelCtx.fillText(info.note, x + 2, y - noteHeight)
}

/**
 * Creates MIDI data from the drawn notes.
 */
export function createMidiData() {
  if (drawnNotes.size === 0) return null

  const sortedNotes = Array.from(drawnNotes.values()).sort((a, b) => a.x - b.x)

  const midiNotes = sortedNotes.map(note => {
    const startTick = Math.round((note.x / PIXELS_PER_BEAT) * TICKS_PER_BEAT)
    const duration = Math.round((note.width / PIXELS_PER_BEAT) * TICKS_PER_BEAT)

    return {
      noteNumber: frequencyToMIDI(note.frequency),
      startTime: startTick,
      duration: Math.max(duration, TICKS_PER_BEAT / 4),
      velocity: 100
    }
  })

  return {
    ticksPerBeat: TICKS_PER_BEAT,
    tracks: [{
      name: 'Spectrogram Notes',
      notes: midiNotes
    }]
  }
}

/**
 * Exports the drawn notes as a MIDI file.
 */
export function exportToMidi() {
  const midiData = createMidiData()
  if (midiData) {
    saveMidiFile(midiData, 'spectrogram_notes.mid')
  }
}

// Event Handlers
function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect()
  mouseX = e.clientX - rect.left
  mouseY = e.clientY - rect.top
  isMouseOverCanvas = true

  drawFrequencyMarkers()

  if (isDrawing && isPaused) updateDrawing(e)
}

function handleMouseDown(e) {
  if (isPaused) {
    const rect = canvas.getBoundingClientRect()
    drawingStartX = e.clientX - rect.left
    drawingStartY = e.clientY - rect.top
    isDrawing = true
  }
}

function handleMouseUp(e) {
  if (isPaused && isDrawing) {
    const rect = canvas.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const width = endX - drawingStartX

    if (Math.abs(width) > 5) {
      const info = getFrequencyInfo(drawingStartY)
      const noteId = `${info.frequency}-${drawingStartX}`
      drawnNotes.set(noteId, {
        x: drawingStartX,
        y: drawingStartY,
        width,
        frequency: info.frequency,
        note: info.note
      })
    }

    isDrawing = false
    redrawAllNotes()
  }
}

function handleMouseLeave() {
  isMouseOverCanvas = false
  drawFrequencyMarkers()
}

function handleMouseEnter() {
  isMouseOverCanvas = true
  drawFrequencyMarkers()
}

function handleDoubleClick(e) {
  if (!isPaused) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const clickThreshold = 5

  for (const [noteId, note] of drawnNotes.entries()) {
    if (
      y >= note.y - clickThreshold &&
      y <= note.y + clickThreshold &&
      x >= note.x &&
      x <= note.x + note.width
    ) {
      drawnNotes.delete(noteId)
      redrawAllNotes()
      break
    }
  }
}

/**
 * Updates the note drawing while dragging.
 */
function updateDrawing(e) {
  if (!isDrawing) return

  const rect = canvas.getBoundingClientRect()
  let currentX = e.clientX - rect.left
  const width = currentX - drawingStartX

  // Delete previous drawing
  labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height)
  drawFrequencyMarkers()
  redrawAllNotes()

  // Draw current note
  drawNoteOnLabelCanvas(drawingStartX, drawingStartY, width)
}

/**
 * Toggles the reassignment state.
 */
export function toggleReassignment(enable) {
  useReassignment = enable
}
