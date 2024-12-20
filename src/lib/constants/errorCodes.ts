export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'auth/invalid-credentials',
  EMAIL_EXISTS: 'auth/email-exists',
  WEAK_PASSWORD: 'auth/weak-password',
  RATE_LIMIT: 'auth/rate-limit',
  NETWORK_ERROR: 'auth/network-error',
  SERVER_ERROR: 'auth/server-error',
  SIGNUP_FAILED: 'auth/signup-failed'
} as const;