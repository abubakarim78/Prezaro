// ============================================================
// ClassCheck — Face matching (pure functions, no DOM)
// Runs anywhere: browser scan loop, node tests, workers.
// ============================================================

export type FaceVector = number[] | Float32Array

/** Euclidean distance between two equal-length vectors. */
export function euclidean(a: FaceVector, b: FaceVector): number {
  if (a.length !== b.length) {
    throw new Error(
      `Descriptor length mismatch: ${a.length} vs ${b.length}`
    )
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] as number) - (b[i] as number)
    sum += d * d
  }
  return Math.sqrt(sum)
}

export interface MatcherEntry {
  id: string
  descriptors: number[][]
}

export interface BestMatch {
  id: string
  distance: number
}

/**
 * Closest student across ALL of their descriptors.
 * Returns null when the roster is empty or the global minimum
 * distance is greater than `threshold` (inclusive match: min <= threshold).
 */
export function bestMatch(
  desc: FaceVector,
  roster: MatcherEntry[],
  threshold: number
): BestMatch | null {
  let best: BestMatch | null = null
  for (const entry of roster) {
    const descriptors = entry.descriptors
    for (let i = 0; i < descriptors.length; i++) {
      let dist: number
      try {
        dist = euclidean(desc, descriptors[i])
      } catch {
        // malformed descriptor in cache — skip it
        continue
      }
      if (!best || dist < best.distance) {
        best = { id: entry.id, distance: dist }
        // Near-perfect match can't be beaten meaningfully — early exit
        if (dist < 0.02) {
          return best.distance <= threshold ? best : null
        }
      }
    }
  }
  return best && best.distance <= threshold ? best : null
}
