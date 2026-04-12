export type DiffLine = { type: 'equal' | 'add' | 'remove'; line: string };

/**
 * Computes a line-level diff between two texts using the LCS algorithm.
 * Returns an array of DiffLine objects representing the diff.
 */
export function computeLineDiff(textA: string, textB: string): DiffLine[] {
  const a = textA.split('\n');
  const b = textB.split('\n');
  const m = a.length;
  const n = b.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: 'equal', line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', line: b[j - 1] });
      j--;
    } else {
      result.push({ type: 'remove', line: a[i - 1] });
      i--;
    }
  }

  return result.reverse();
}
