import { initSpectrogramRenderer, updateFrequencyRange, drawFrequencyMarkers } from './spectrogramRenderer.js'
import { initUIControls } from './uiController.js'

/**
 * Initializes the spectrogram canvas and its label canvas.
 * @returns {void}
 */
document.addEventListener('DOMContentLoaded', function () {
  const canvas = document.getElementById('spectrogramCanvas')
  const ctx = canvas.getContext('2d')

  const labelCanvas = document.createElement('canvas')
  const labelCtx = labelCanvas.getContext('2d')

  canvas.parentNode.insertBefore(labelCanvas, canvas.nextSibling)
  labelCanvas.id = 'labelCanvas'

  // Initial setup
  setCanvasSize()
  updateLabelCanvasSize()

  // Initialize renderer and UI
  initSpectrogramRenderer(canvas, ctx, labelCanvas, labelCtx)
  initUIControls(canvas, labelCanvas)

  // Draw frequency markers immediately after initialization
  const maxFreq = Math.pow(10, 4) // 10^4 = 10000 Hz
  updateFrequencyRange(maxFreq)
  drawFrequencyMarkers()

  // Event listeners for canvas sizing
  window.addEventListener('load', () => {
    setCanvasSize()
    updateLabelCanvasSize()
    drawFrequencyMarkers() // Redraw markers after resize
  })
  window.addEventListener('resize', () => {
    setCanvasSize()
    updateLabelCanvasSize()
    drawFrequencyMarkers() // Redraw markers after resize
  })

  function setCanvasSize () {
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
  }

  function updateLabelCanvasSize () {
    labelCanvas.width = canvas.width
    labelCanvas.height = canvas.height
    labelCanvas.style.left = canvas.offsetLeft + 'px'
    labelCanvas.style.top = canvas.offsetTop + 'px'
  }
})
