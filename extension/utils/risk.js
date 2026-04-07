/**
 * Gets the risk label and color based on a risk score.
 *
 * Risk ranges:
 * - 0-29: SAFE (green)
 * - 30-59: CAUTION (yellow)
 * - 60-79: SUSPICIOUS (orange)
 * - 80-100: DANGER (red)
 *
 * @param {number} score - A risk score between 0 and 100
 * @returns {{ label: string, color: string }} An object containing the risk label and corresponding color
 */
export function getRiskLabel(score) {
  if (score >= 0 && score <= 29) {
    return { label: 'SAFE', color: '#00b894' };
  } else if (score >= 30 && score <= 59) {
    return { label: 'CAUTION', color: '#fdcb6e' };
  } else if (score >= 60 && score <= 79) {
    return { label: 'SUSPICIOUS', color: '#e17055' };
  } else if (score >= 80 && score <= 100) {
    return { label: 'DANGER', color: '#d63031' };
  }
  // Default to DANGER for any out-of-range scores
  return { label: 'DANGER', color: '#d63031' };
}

/**
 * Gets a badge text symbol based on a risk score.
 *
 * Badge symbols:
 * - 0-29: ✓ (checkmark)
 * - 30-59: ! (single exclamation)
 * - 60-79: !! (double exclamation)
 * - 80-100: ✕ (cross mark)
 *
 * @param {number} score - A risk score between 0 and 100
 * @returns {string} A badge text symbol
 */
export function getBadgeText(score) {
  if (score >= 0 && score <= 29) {
    return '✓';
  } else if (score >= 30 && score <= 59) {
    return '!';
  } else if (score >= 60 && score <= 79) {
    return '!!';
  } else if (score >= 80 && score <= 100) {
    return '✕';
  }
  // Default to ✕ for any out-of-range scores
  return '✕';
}
