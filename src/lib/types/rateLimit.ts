export interface RateLimitConfig {
  maxAttempts: number;
  windowMinutes: number;
}

export interface RateLimitKey {
  ip: string;
  identifier: string;
}

export interface RateLimitResult {
  isLimited: boolean;
  remainingAttempts: number;
  shouldWarn: boolean;
  message?: string;
}

export interface RateLimitAttempt {
  attemptCount: number;
  lastReset: Date;
  lastAttempt: Date;
}