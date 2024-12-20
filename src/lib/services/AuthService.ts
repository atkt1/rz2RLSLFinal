import { supabase } from '@/lib/supabase';
import { TokenService } from './TokenService';
import { CookieService } from './CookieService';
import { AuditService } from './AuditService';
import { RateLimitService } from './RateLimitService';
import { AuthError, RateLimitError, AUTH_ERROR_CODES } from '@/lib/utils/errors';
import { hashPassword } from '@/lib/utils/crypto';
import { getClientIp } from '@/lib/utils/network';
import type { AuthResponse, UserSession } from '@/lib/types/auth';
import type { LoginInput, SignUpInput } from '@/lib/validation/auth';

export class AuthService {
  static async login({ email, password, deviceInfo }: LoginInput): Promise<AuthResponse> {
    const ipAddress = getClientIp();
    
    try {
      // Check rate limit and increment attempts
      await RateLimitService.checkAndIncrementAttempts(
        ipAddress, 
        email.toLowerCase()
      );

      // Hash password for comparison
      const passwordHash = await hashPassword(password);

      // Get user with plan information
      const { data: user, error: userError } = await supabase
        .from('users')
        .select(`
          id,
          email,
          firstname,
          lastname,
          password_hash,
          role,
          is_verified,
          plan_id
        `)
        .eq('email', email.toLowerCase())
        .single();

      if (userError || !user) {
        throw new AuthError(
          'Invalid email or password',
          AUTH_ERROR_CODES.INVALID_CREDENTIALS
        );
      }

      // Verify password
      if (user.password_hash !== passwordHash) {
        throw new AuthError(
          'Invalid email or password',
          AUTH_ERROR_CODES.INVALID_CREDENTIALS
        );
      }

      // Generate tokens
      const tokens = TokenService.generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role || 'user',
        planId: user.plan_id
      }, deviceInfo);

      // Store tokens in HTTP-only cookies
      CookieService.setAuthTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);

      // Reset rate limit attempts on successful login
      await RateLimitService.resetAttempts(ipAddress, email.toLowerCase());

      // Log successful login
      await AuditService.logAuthEvent('LOGIN_SUCCESS', {
        userId: user.id,
        email: user.email,
        ipAddress
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstname,
          lastName: user.lastname,
          role: user.role || 'user',
          isVerified: user.is_verified,
          planId: user.plan_id
        },
        tokens
      };

    } catch (error) {
      if (error instanceof RateLimitError) {
        throw new AuthError(
          error.message,
          AUTH_ERROR_CODES.RATE_LIMIT,
          {
            locked: error.status === 'LOCKED',
            warning: error.status === 'WARNING',
            remainingAttempts: error.remainingAttempts
          }
        );
      }

      if (error instanceof AuthError) {
        throw error;
      }

      throw new AuthError(
        'An unexpected error occurred',
        AUTH_ERROR_CODES.SERVER_ERROR,
        { originalError: error }
      );
    }
  }

  static async signUp({ email, password, firstName, lastName, deviceInfo }: SignUpInput): Promise<AuthResponse> {
    try {
      // Hash password
      const passwordHash = await hashPassword(password);

      // Check if email already exists
      const { data: existingUsers, error: checkError } = await supabase
        .from('users')
        .select('email')
        .eq('email', email.toLowerCase());

      if (checkError) {
        throw new AuthError(
          'Failed to check email availability',
          AUTH_ERROR_CODES.SERVER_ERROR,
          { originalError: checkError }
        );
      }

      if (existingUsers && existingUsers.length > 0) {
        throw new AuthError(
          'Email already registered',
          AUTH_ERROR_CODES.EMAIL_EXISTS
        );
      }

      // Create user with default plan (Unpaid)
      const { data: userData, error: userError } = await supabase.rpc(
        'create_user_with_plan',
        {
          p_email: email.toLowerCase(),
          p_firstname: firstName,
          p_lastname: lastName,
          p_password_hash: passwordHash,
          p_plan_name: 'Unpaid'
        }
      );

      if (userError || !userData) {
        throw new AuthError(
          'Failed to create account',
          AUTH_ERROR_CODES.SIGNUP_FAILED,
          { originalError: userError }
        );
      }

      // Generate tokens
      const tokens = TokenService.generateTokens({
        userId: userData.id,
        email: userData.email,
        role: userData.role,
        planId: userData.plan_id
      }, deviceInfo);

      // Store tokens in HTTP-only cookies
      CookieService.setAuthTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);

      // Log signup event
      await AuditService.logAuthEvent('SIGNUP_SUCCESS', {
        userId: userData.id,
        email: userData.email,
        ipAddress: getClientIp()
      });

      return {
        user: {
          id: userData.id,
          email: userData.email,
          firstName: userData.firstname,
          lastName: userData.lastname,
          role: userData.role,
          isVerified: false,
          planId: userData.plan_id
        },
        tokens
      };
    } catch (error) {
      console.error('Signup error:', error);
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        'Failed to create account',
        AUTH_ERROR_CODES.SIGNUP_FAILED,
        { originalError: error }
      );
    }
  }

  private static async handleFailedLogin(ipAddress: string, email: string, reason: string): Promise<void> {
    try {
      const attempts = await RateLimitService.checkAndIncrementAttempts(ipAddress, email.toLowerCase());
      
      // Log the failed attempt
      await AuditService.logAuthEvent('LOGIN_FAILED', { 
        email, 
        reason,
        ipAddress,
        attemptCount: attempts.remainingAttempts
      });

      if (attempts.shouldWarn) {
        throw new RateLimitError(
          attempts.message || 'Too many failed attempts',
          attempts.isLimited ? 'LOCKED' : 'WARNING'
        );
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error;
      }
      console.error('Error handling failed login:', error);
    }
  }
}