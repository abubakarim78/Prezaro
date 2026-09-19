// ============================================================
// Prezaro — Face matching (pure functions, no DOM)
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

export interface MatchOptions {
  /**
   * Ambiguity margin. When the SECOND-closest student is also inside the
   * threshold and within this margin of the best distance, the match is
   * treated as ambiguous and rejected (returns null). This is what stops
   * one face from verifying as two different students.
   */
  margin?: number
}

/**
 * Closest student across ALL of their descriptors, with an ambiguity guard.
 *
 * Returns null when:
 *  - the roster is empty, or
 *  - the global minimum distance is greater than `threshold`, or
 *  - `opts.margin` is set and a DIFFERENT student's distance falls within
 *    the margin of the best while also being inside the threshold
 *    (two students are effectively equally close — not safe to pick one).
 */
export function bestMatch(
  desc: FaceVector,
  roster: MatcherEntry[],
  threshold: number,
  opts: MatchOptions = {}
): BestMatch | null {
  const margin = opts.margin ?? 0
  let bestId: string | null = null
  let bestDist = Infinity
  let secondDist = Infinity // closest distance from any OTHER student

  for (const entry of roster) {
    const descriptors = entry.descriptors
    let entryBest = Infinity
    for (let i = 0; i < descriptors.length; i++) {
      let dist: number
      try {
        dist = euclidean(desc, descriptors[i])
      } catch {
        // malformed descriptor in cache — skip it
        continue
      }
      if (dist < entryBest) entryBest = dist
      // Near-perfect match can't be beaten meaningfully — early exit
      if (dist < 0.02) {
        return dist <= threshold
          ? { id: entry.id, distance: dist }
          : null
      }
    }
    if (entryBest === Infinity) continue
    if (entryBest < bestDist) {
      // previous best becomes the runner-up (it belonged to another id)
      if (bestId !== null && bestId !== entry.id) {
        secondDist = bestDist
      }
      bestDist = entryBest
      bestId = entry.id
    } else if (entryBest < secondDist) {
      secondDist = entryBest
    }
  }

  if (bestId === null || bestDist > threshold) return null
  if (margin > 0 && secondDist <= threshold && secondDist - bestDist < margin) {
    return null // ambiguous — the same face is close to two students
  }
  return { id: bestId, distance: bestDist }
}
