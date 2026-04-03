import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import { baseClient } from '@/api/baseClient';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState({ loading: true, valid: false, email: '' });
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus({ loading: false, valid: false, email: '' });
      return;
    }

    baseClient.auth.validateResetToken(token)
      .then((response) => setStatus({ loading: false, valid: true, email: response.email || '' }))
      .catch(() => setStatus({ loading: false, valid: false, email: '' }));
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await baseClient.auth.resetPassword({ token, new_password: form.password });
      toast.success('Password updated. You can now sign in.');
      navigate(createPageUrl('Login'));
    } catch (error) {
      toast.error(error.message || 'Unable to reset password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/20 px-4 py-10 sm:px-6">
      <Card className="mx-auto max-w-lg shadow-lg shadow-black/5">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>Create a new password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          {status.loading ? <p className="text-sm text-muted-foreground">Validating reset link...</p> : null}

          {!status.loading && !status.valid ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">This reset link is invalid or expired.</p>
              <Link className="text-sm text-primary hover:underline" to={createPageUrl('ForgotPassword')}>Request a new reset link</Link>
            </div>
          ) : null}

          {!status.loading && status.valid ? (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <p className="text-sm text-muted-foreground">Resetting password for <span className="font-medium text-foreground">{status.email}</span>.</p>
              <div className="space-y-2">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-confirm-password">Confirm new password</Label>
                <Input
                  id="reset-confirm-password"
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  required
                />
              </div>
              <Button className="w-full" disabled={isSubmitting} type="submit">Update password</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}