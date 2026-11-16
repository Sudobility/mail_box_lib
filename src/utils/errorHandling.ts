/**
 * @fileoverview Error handling utilities for the mail_box_lib ecosystem.
 * Provides a structured AppError class, error extraction helpers,
 * API error handling, retry logic with exponential backoff, and
 * error boundary wrappers.
 */

import { ERROR_MESSAGES, logger, Optional } from '@sudobility/types';
// import { EnvUtils } from '../../di'; // TODO: Implement proper DI setup

// Platform-specific global
declare const fetch: typeof globalThis.fetch; // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * Structured application error with error code, HTTP status, and optional details.
 * Extends the native Error class with additional metadata for error tracking.
 */
class AppError extends Error {
  code: string;
  statusCode?: number;
  details?: any;

  /**
   * @param message - Human-readable error message
   * @param code - Machine-readable error code (e.g., "NETWORK_ERROR", "UNAUTHORIZED")
   * @param statusCode - HTTP status code (defaults to 500)
   * @param details - Additional error context or metadata
   */
  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode ?? 500;
    this.details = details;
  }
}

/**
 * Type guard to check if an unknown error is an AppError instance.
 *
 * @param error - The error to check
 * @returns True if the error is an AppError
 */
const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError;
};

/**
 * Extracts a human-readable message from any error type.
 * Handles AppError, Error, string, and object-with-message patterns.
 *
 * @param error - The error to extract a message from
 * @returns A string error message
 */
const getErrorMessage = (error: unknown): string => {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }

  return ERROR_MESSAGES.NETWORK_ERROR;
};

/**
 * Converts any error into a structured AppError.
 * Maps fetch errors and HTTP status codes to appropriate error types.
 *
 * @param error - The raw error to convert
 * @returns An AppError with appropriate code and status
 */
const handleApiError = (error: unknown): AppError => {
  if (isAppError(error)) {
    return error;
  }

  // Handle fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new AppError(ERROR_MESSAGES.NETWORK_ERROR, 'NETWORK_ERROR', 0);
  }

  // Handle response errors
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as any).status;

    switch (status) {
      case 401:
        return new AppError(
          ERROR_MESSAGES.AUTHENTICATION_FAILED,
          'UNAUTHORIZED',
          401
        );
      case 403:
        return new AppError(ERROR_MESSAGES.PERMISSION_DENIED, 'FORBIDDEN', 403);
      case 429:
        return new AppError(ERROR_MESSAGES.RATE_LIMITED, 'RATE_LIMITED', 429);
      default:
        return new AppError(ERROR_MESSAGES.NETWORK_ERROR, 'API_ERROR', status);
    }
  }

  return new AppError(getErrorMessage(error), 'UNKNOWN_ERROR');
};

/**
 * Logs an error with optional context using the platform logger.
 *
 * @param error - The error to log
 * @param context - Optional context string describing where the error occurred
 */
const logError = (error: unknown, context?: string): void => {
  const errorMessage = getErrorMessage(error);
  logger.error(errorMessage, context, error);

  // In production, you might want to send this to an error tracking service
  // Note: EnvUtils would need to be instantiated with a platform-specific implementation
  // For now, we'll comment this out until proper DI setup
  // if (envUtils.isProduction()) {
  //   // Send to error tracking service
  //   // e.g., Sentry, LogRocket, etc.
  // }
};

/**
 * Retries an async function with exponential backoff on failure.
 *
 * @param fn - The async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelay - Initial delay in milliseconds before first retry (default: 1000)
 * @returns The result of the successful function call
 * @throws The last error if all retries are exhausted
 */
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> => {
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

/**
 * Wraps an async function in an error boundary, catching errors and returning a fallback.
 *
 * @param fn - The async function to execute
 * @param fallback - Optional fallback value to return on error
 * @param context - Optional context string for error logging
 * @returns The function result, the fallback value, or undefined on error
 */
const withErrorBoundary = async <T>(
  fn: () => Promise<T>,
  fallback?: T,
  context?: string
): Promise<Optional<T>> => {
  try {
    return await fn();
  } catch (error) {
    logError(error, context);
    return fallback;
  }
};

export {
  isAppError,
  getErrorMessage,
  handleApiError,
  logError,
  retryWithBackoff,
  withErrorBoundary,
  AppError,
};
