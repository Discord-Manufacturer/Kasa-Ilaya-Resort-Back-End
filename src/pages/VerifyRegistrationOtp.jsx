import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { baseClient } from '@/api/baseClient';
import { createPageUrl } from '@/utils';

export default function VerifyRegistrationOtp() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const email = searchParams.get('email') || '';
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!otp || otp.length < 4) {
      toast.error('Please enter the OTP sent to your email.');
      return;
    }

    setIsSubmitting(true);
    try {
      await baseClient.auth.verifyRegistrationOtp({ email, otp });
      toast.success('Email verified. You can now sign in.');
      navigate(createPageUrl('Login'));
    } catch (error) {
      toast.error(error.message || 'Unable to verify OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resend = async () => {
    try {
      const response = await baseClient.auth.sendRegistrationOtp({ email });
      if (response?.mail_sent === false) {
        toast.error(response.mail_error || 'Verification code was created, but email delivery failed.');
        return;
      }

      toast.success('Verification OTP resent.');
    } catch (error) {
      toast.error(error.message || 'Unable to resend OTP.');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/20 px-4 py-10 sm:px-6">
      <Card className="mx-auto max-w-lg shadow-lg shadow-black/5">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>Enter the code sent to {email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleVerify}>
            <div className="space-y-2">
              <Label htmlFor="otp">Verification code</Label>
              <Input id="otp" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" />
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to your email address.</p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button className="flex-1" disabled={isSubmitting} type="submit">Verify</Button>
              <Button variant="ghost" onClick={resend}>Resend</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
