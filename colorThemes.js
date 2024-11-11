let currentTheme = 'heatmap'
const customTheme = ['#0000FF', '#00FF00', '#FF0000']

/**
 * Color themes for the spectrogram.
 * @type {Object}
 */
const colorThemes = {
  heatmap: value => `hsl(${(1 - value) * 240}, 100%, 50%)`,
  grayscale: value => `rgb(${value * 255}, ${value * 255}, ${value * 255})`,
  rainbow: value => `hsl(${value * 360}, 100%, 50%)`,
  greenToRed: value => `rgb(${value * 255}, ${(1 - value) * 255}, 0)`,
  blueToYellow: value => `rgb(${value * 255}, ${value * 255}, ${(1 - value) * 255})`,
  darkOcean: value => `rgb(${value * 64}, ${value * 128}, ${128 + value * 127})`,
  blackToPurple: value => `rgb(${value * 255}, 0, ${value * 255})`,
  nightVision: value => {
    if (value < 0.5) {
      // Black to Yellow transition
      const intensity = value * 2
      return `rgb(${intensity * 255}, ${intensity * 255}, 0)`
    } else {
      // Yellow to Red transition
      const intensity = (value - 0.5) * 2
      return `rgb(255, ${255 - (intensity * 255)}, 0)`
    }
  },
  custom: value => interpolateColor(customTheme, value)
}

/**
 * Gets the color for a given value based on the current theme.
 * @param {number} value - The value to get the color for (0-1).
 * @returns {string} The color in CSS format.
 */
export function getColor (value) {
  return colorThemes[currentTheme](value)
}

/**
 * Updates the current color theme.
 * @param {string} theme - The name of the new theme.
 */
export function updateTheme (theme) {
  currentTheme = theme
}

/**
 * Updates a color in the custom theme.
 * @param {string} color - The new color in hex format.
 * @param {number} index - The index of the color to update (0-2).
 */
export function updateCustomTheme (color, index) {
  customTheme[index] = color
}

/**
 * Interpolates between colors in the custom theme.
 * @param {string[]} colors - Array of colors to interpolate between.
 * @param {number} value - The interpolation value (0-1).
 * @returns {string} The interpolated color in RGB format.
 */
function interpolateColor (colors, value) {
  if (value <= 0.5) {
    return interpolateTwoColors(colors[0], colors[1], value * 2)
  } else {
    return interpolateTwoColors(colors[1], colors[2], (value - 0.5) * 2)
  }
}

/**
 * Interpolates between two colors.
 * @param {string} color1 - The first color in hex format.
 * @param {string} color2 - The second color in hex format.
 * @param {number} factor - The interpolation factor (0-1).
 * @returns {string} The interpolated color in RGB format.
 */
function interpolateTwoColors (color1, color2, factor) {
  const r1 = parseInt(color1.substr(1, 2), 16)
  const g1 = parseInt(color1.substr(3, 2), 16)
  const b1 = parseInt(color1.substr(5, 2), 16)
  const r2 = parseInt(color2.substr(1, 2), 16)
  const g2 = parseInt(color2.substr(3, 2), 16)
  const b2 = parseInt(color2.substr(5, 2), 16)
  const r = Math.round(r1 + factor * (r2 - r1))
  const g = Math.round(g1 + factor * (g2 - g1))
  const b = Math.round(b1 + factor * (b2 - b1))
  return `rgb(${r}, ${g}, ${b})`
}
