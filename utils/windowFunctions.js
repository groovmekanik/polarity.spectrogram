/**
 * Window function generators for signal processing
 */
import { factorial, evaluateHermitePolynomial } from './mathHelpers.js'

export function createHermiteFunctions (N, M = 6, tm = 6.0) {
  const h = new Float32Array(M * N)
  const Dh = new Float32Array(M * N)
  const Th = new Float32Array(M * N)

  const dt = 2.0 * tm / (N - 1)
  const t = new Float32Array(N)

  // Generate time points
  for (let i = 0; i < N; i++) {
    t[i] = -tm + i * dt
  }

  // Generate Hermite functions
  for (let k = 0; k < M; k++) {
    const norm = Math.sqrt(Math.sqrt(Math.PI) * Math.pow(2, k) * factorial(k))

    for (let i = 0; i < N; i++) {
      const x = t[i]
      const hermite = evaluateHermitePolynomial(k, x)

      h[k * N + i] = hermite * Math.exp(-x * x / 2) / norm
      Dh[k * N + i] = (k * hermite - x * hermite) * Math.exp(-x * x / 2) / norm
      Th[k * N + i] = x * h[k * N + i]
    }
  }

  return { h, Dh, Th }
}
