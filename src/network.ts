export interface SortPlan {
  /** Size of the network after padding to the next power of two. */
  paddedLength: number;
  /** Maximum number of dependent comparison stages. */
  rounds: number;
  /** Conservative upper bound; includes padding and cached comparisons. */
  maxComparisons: number;
}

/** Inspect the network's work before making any paid API calls. */
export function estimateSort(length: number): SortPlan {
  if (!Number.isSafeInteger(length) || length < 0 || length > 2 ** 30) {
    throw new RangeError("length must be an integer between 0 and 2^30");
  }
  if (length < 2) return { paddedLength: length, rounds: 0, maxComparisons: 0 };
  const levels = Math.ceil(Math.log2(length));
  const paddedLength = 2 ** levels;
  const rounds = (levels * (levels + 1)) / 2;
  return { paddedLength, rounds, maxComparisons: (paddedLength / 2) * rounds };
}

export interface Comparator {
  left: number;
  right: number;
  ascending: boolean;
}

/** Each yielded stage contains disjoint wires, so its comparisons are independent. */
export function* network(size: number): Generator<Comparator[]> {
  for (let width = 2; width <= size; width *= 2) {
    for (let stride = width / 2; stride >= 1; stride /= 2) {
      const stage: Comparator[] = [];
      for (let left = 0; left < size; left++) {
        const right = left ^ stride;
        if (right > left) stage.push({ left, right, ascending: (left & width) === 0 });
      }
      yield stage;
    }
  }
}
