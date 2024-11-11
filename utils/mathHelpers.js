/**
 * Math helper functions for signal processing
 */
export function factorial (n) {
  if (n <= 1) return 1
  return n * factorial(n - 1)
}

export function evaluateHermitePolynomial (n, x) {
  if (n === 0) return 1
  if (n === 1) return 2 * x
  return 2 * x * evaluateHermitePolynomial(n - 1, x) -
         2 * (n - 1) * evaluateHermitePolynomial(n - 2, x)
}
