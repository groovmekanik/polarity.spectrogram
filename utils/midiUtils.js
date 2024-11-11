/**
 * MIDI-related utility functions
 */

/**
 * Converts a frequency to a MIDI note number.
 * @param {number} frequency - The frequency in Hz.
 * @returns {number} The MIDI note number.
 */
export function frequencyToMIDI (frequency) {
  return Math.round(69 + 12 * Math.log2(frequency / 440))
}

/**
 * Converts a MIDI note number to a frequency.
 * @param {number} midi - The MIDI note number.
 * @returns {number} The frequency in Hz.
 */
export function MIDIToFrequency (midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * Saves MIDI data as a .mid file
 * @param {Object} midiData - The MIDI data
 * @param {string} filename - The filename
 */
export function saveMidiFile (midiData, filename) {
  // MIDI File Format 1 Header
  const header = [
    0x4D, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // Header size
    0x00, 0x01, // Format 1
    0x00, 0x01, // One track
    (midiData.ticksPerBeat >> 8) & 0xFF, midiData.ticksPerBeat & 0xFF // Ticks per beat
  ]

  // Track data
  const track = midiData.tracks[0]
  const events = []

  // Track name
  events.push([0x00, 0xFF, 0x03, track.name.length, ...track.name.split('').map(c => c.charCodeAt(0))])

  // Set tempo (120 BPM = 500000 microseconds per beat)
  events.push([0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20])

  // Note events
  track.notes.forEach(note => {
    // Note On
    events.push([note.startTime, 0x90, note.noteNumber, note.velocity])
    // Note Off
    events.push([note.startTime + note.duration, 0x80, note.noteNumber, 0])
  })

  // Sort events by time
  events.sort((a, b) => a[0] - b[0])

  // Convert delta times
  let lastTime = 0
  events.forEach(event => {
    const deltaTime = event[0] - lastTime
    event[0] = deltaTime
    lastTime = event[0]
  })

  // Create track data
  const trackData = []
  events.forEach(event => {
    // Write variable-length delta time
    let deltaTime = event[0]
    if (deltaTime > 0) {
      const bytes = []
      while (deltaTime > 0) {
        bytes.unshift(deltaTime & 0x7F)
        deltaTime = deltaTime >> 7
        if (bytes.length > 1) {
          bytes[0] |= 0x80
        }
      }
      trackData.push(...bytes)
    } else {
      trackData.push(0)
    }
    // Write event data
    trackData.push(...event.slice(1))
  })

  // End of track
  trackData.push(0x00, 0xFF, 0x2F, 0x00)

  // Track header
  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B, // MTrk
    (trackData.length >> 24) & 0xFF,
    (trackData.length >> 16) & 0xFF,
    (trackData.length >> 8) & 0xFF,
    trackData.length & 0xFF
  ]

  // Combine all data
  const fileData = new Uint8Array([...header, ...trackHeader, ...trackData])

  // Create and download file
  const blob = new Blob([fileData], { type: 'audio/midi' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
