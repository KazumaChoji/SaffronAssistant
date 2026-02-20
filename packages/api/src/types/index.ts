/**
 * Shared types used across the application
 */

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Makes specific properties of T optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Makes specific properties of T required
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
