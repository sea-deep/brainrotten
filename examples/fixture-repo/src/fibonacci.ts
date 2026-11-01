/**
 * Fibonacci — naive recursive implementation.
 *
 * This file is the source evidence for the scaffold demonstration lesson.
 * It demonstrates O(2^n) exponential time complexity.
 */

/**
 * Returns the nth Fibonacci number using naive recursion.
 *
 * @param n - Non-negative integer index
 * @returns The nth Fibonacci number
 *
 * @example
 * fibonacci(0) // 0
 * fibonacci(1) // 1
 * fibonacci(6) // 8
 */
export function fibonacci(n: number): number {
  if (n < 0) throw new RangeError('n must be non-negative');
  if (n === 0) return 0;
  if (n === 1) return 1;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * Returns the nth Fibonacci number using memoization.
 * Much faster than the naive version: O(n) time, O(n) space.
 */
export function fibonacciMemo(n: number, memo: Map<number, number> = new Map()): number {
  if (n < 0) throw new RangeError('n must be non-negative');
  if (n === 0) return 0;
  if (n === 1) return 1;
  const cached = memo.get(n);
  if (cached !== undefined) return cached;
  const result = fibonacciMemo(n - 1, memo) + fibonacciMemo(n - 2, memo);
  memo.set(n, result);
  return result;
}
