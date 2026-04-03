import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { baseClient } from '@/api/baseClient';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [resetUrl, setResetUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resetPageUrl = useMemo(() => `${window.location.origin}${createPageUrl('ResetPassword')}`, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await baseClient.auth.forgotPassword({ email, reset_page_url: resetPageUrl });
      setResetUrl(response.reset_url || '');

      if (response.mail_sent === false) {
        toast.warning(response.mail_error || 'Reset link created, but the email could not be delivered.');
      } else {
        toast.success('If the email exists, a reset link has been prepared.');
      }
    } catch (error) {
      toast.error(error.message || 'Unable to create reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/20 px-4 py-10 sm:px-6">
      <Card className="mx-auto max-w-lg shadow-lg shadow-black/5">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>Enter your email address and the system will generate a password reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input id="forgot-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <Button className="w-full" disabled={isSubmitting} type="submit">Send reset link</Button>
          </form>

          {resetUrl ? (
            <div className="mt-6 rounded-2xl border bg-muted/30 p-4 text-sm">
              <p className="font-medium text-foreground">Development reset link</p>
              <p className="mt-2 break-all text-muted-foreground">{resetUrl}</p>
              <a className="mt-3 inline-block text-primary hover:underline" href={resetUrl}>Open reset page</a>
            </div>
          ) : null}

          <div className="mt-6 text-sm text-muted-foreground">
            <Link className="text-primary hover:underline" to={createPageUrl('AdminDashboard')}>Back to sign in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}