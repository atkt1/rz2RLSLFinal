import { supabase } from '@/lib/supabase';
import { RateLimitError } from '@/lib/utils/errors';
import type { RateLimitResult } from '@/lib/types/rateLimit';

export class RateLimitService {
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly WINDOW_MINUTES = 15;

  static async checkAndIncrementAttempts(ipAddress: string, identifier: string): Promise<RateLimitResult> {
    try {
      const { data: attempts, error } = await supabase.rpc(
        'increment_failed_attempts',
        {
          p_ip_address: ipAddress,
          p_identifier: identifier,
          p_last_attempt: new Date().toISOString()
        }
      );

      if (error) {
        console.error('Failed to check/increment attempts:', error);
        throw new RateLimitError('Unable to process login attempt');
      }

      const currentAttempts = attempts || 0;
      const remainingAttempts = this.MAX_ATTEMPTS - currentAttempts;

      // Rate limit exceeded (after 5 attempts)
      if (remainingAttempts <= 0) {
        throw new RateLimitError(
          'Too many failed attempts. Please try again after 15 minutes.',
          'LOCKED',
          0
        );
      }

      // Warning zone (attempts 4-5)
      if (remainingAttempts <= 2) {
        throw new RateLimitError(
          `Warning: ${remainingAttempts} login ${remainingAttempts === 1 ? 'attempt' : 'attempts'} remaining before temporary lockout.`,
          'WARNING',
          remainingAttempts
        );
      }

      // Standard error (attempts 1-3)
      return {
        isLimited: false,
        remainingAttempts,
        shouldWarn: false,
        message: 'Invalid email or password'
      };

    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      console.error('Error in checkAndIncrementAttempts:', error);
      throw new RateLimitError('Rate limit check failed');
    }
  }

  static async resetAttempts(ipAddress: string, identifier: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('failed_attempts')
        .delete()
        .eq('ip_address', ipAddress)
        .eq('identifier', identifier);

      if (error) {
        console.error('Failed to reset attempts:', error);
      }
    } catch (error) {
      console.error('Error in resetAttempts:', error);
    }
  }
}
