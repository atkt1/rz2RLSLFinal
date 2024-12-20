// src/components/auth/LoginForm.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthCard } from './AuthCard';
import { FormInput } from './FormInput';
import { Button } from '@/components/ui/Button';
import { X } from 'lucide-react';
import { loginSchema } from '@/lib/validation';
import { useFormValidation } from '@/hooks/useFormValidation';
import { AuthService } from '@/lib/services/AuthService';
import { useAuth } from '@/lib/context/AuthContext';
import { getDeviceInfo } from '@/lib/utils/device';
import { ROUTES } from '@/lib/constants/routes';
import { AUTH_ERROR_CODES } from '@/lib/utils/errors';
import type { AuthNavigationProps } from '@/types/auth';

interface LoginFormProps extends AuthNavigationProps {
  onClose: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onClose, onNavigate }) => {
  const navigate = useNavigate();
  const { login: setAuthState } = useAuth();
  
  const { formData, errors, isSubmitting, handleChange, handleSubmit, setErrors } = useFormValidation({
    initialValues: { 
      email: '', 
      password: '',
      deviceInfo: getDeviceInfo()
    },
    validationSchema: loginSchema,
    onSubmit: async (values) => {
      try {
        const response = await AuthService.login(values);
        setAuthState(response);
        onClose();
        navigate(ROUTES.DASHBOARD);
      } catch (error: any) {
        if (error.code === AUTH_ERROR_CODES.RATE_LIMIT) {
          if (error.details?.locked) {
            setErrors({
              submit: error.message,
              email: 'Account temporarily locked',
              password: 'Please try again later'
            });
          } else if (error.details?.warning) {
            setErrors({
              submit: error.message,
              password: `${error.details.remainingAttempts} attempts remaining`
            });
          }
        } else if (error.code === AUTH_ERROR_CODES.INVALID_CREDENTIALS) {
          setErrors({
            submit: 'Invalid email or password',
            password: 'Please check your credentials'
          });
        } else {
          setErrors({
            submit: 'An unexpected error occurred. Please try again.'
          });
        }
        console.error('Login failed:', error);
      }
    }
  });

  return (
    <AuthCard
      title="Welcome back"
      description="Log in to your ReviewZone account"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <form onSubmit={handleSubmit} className="space-y-6">
        {errors.submit && (
          <div className={`p-3 text-sm rounded-lg ${
            errors.email === 'Account temporarily locked'
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {errors.submit}
          </div>
        )}
        
        <FormInput
          label="Email"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="john@company.com"
          error={errors.email}
          required
          disabled={isSubmitting || errors.email === 'Account temporarily locked'}
        />
        
        <div className="space-y-2">
          <FormInput
            label="Password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="••••••••"
            error={errors.password}
            required
            disabled={isSubmitting || errors.email === 'Account temporarily locked'}
          />
          <div className="text-right">
            <button
              type="button"
              onClick={() => onNavigate('forgot-password')}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Forgot password?
            </button>
          </div>
        </div>
        
        <Button 
          type="submit" 
          variant="primary" 
          className="w-full"
          disabled={isSubmitting || errors.email === 'Account temporarily locked'}
        >
          {isSubmitting ? 'Logging in...' : 'Log in'}
        </Button>
        
        <p className="text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={() => onNavigate('signup')}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Sign up
          </button>
        </p>
      </form>
    </AuthCard>
  );
};
