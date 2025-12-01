import React, { useState } from 'react';
import { Phone, ArrowRight, Loader2 } from 'lucide-react';
import { supabaseClient } from '../supabaseClient';

const Onboarding: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatPhoneNumber = (value: string) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Extract only digits for storage
    const digitsOnly = phoneNumber.replace(/\D/g, '');

    if (digitsOnly.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setIsSubmitting(true);

    try {
      // Get current user session
      const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Not authenticated');
      }

      // Call edge function to complete onboarding (updates phone + metadata)
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-onboarding`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: `+1${digitsOnly}`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete onboarding');
      }

      console.log('✅ Onboarding completed successfully');

      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      console.error('Error saving phone number:', err);
      setError(err instanceof Error ? err.message : 'Failed to save phone number');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <Phone className="w-8 h-8" style={{ color: '#53AD6D' }} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              One More Step!
            </h1>
            <p className="text-gray-600">
              Help us recognize you when you forward text orders to Frootful
            </p>
          </div>

          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>Why we need this:</strong> When you forward text messages to Frootful,
              we use your phone number to identify you and automatically process orders for your account.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number <span className="text-red-600">*</span>
              </label>
              <input
                type="tel"
                id="phone"
                value={phoneNumber}
                onChange={handlePhoneChange}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                disabled={isSubmitting}
                required
                maxLength={14}
              />
              <p className="mt-2 text-xs text-gray-500">
                Required - We'll use this to match forwarded text messages to your account
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-3">
              <button
                type="submit"
                disabled={isSubmitting || !phoneNumber}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: '#53AD6D' }}
                onMouseEnter={(e) => {
                  if (!isSubmitting && phoneNumber) {
                    e.currentTarget.style.backgroundColor = '#4a9c63';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#53AD6D';
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Privacy Note */}
          <p className="mt-6 text-xs text-center text-gray-500">
            Your phone number is stored securely and only used to identify forwarded messages.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
