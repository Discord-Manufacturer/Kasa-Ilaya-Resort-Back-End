import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, TreePalm, UserPlus } from 'lucide-react';
import { baseClient } from '@/api/baseClient';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const normalizeEmail = (value) => value.trim().toLowerCase();

const isValidEmail = (value) => /^(?:[^\s@]+)@(?:[^\s@]+)\.[^\s@]+$/.test(value);

const isValidPhoneNumber = (value) => {
  const normalized = value.replace(/\D/g, '');
  return normalized.length >= 10 && normalized.length <= 13;
};

const resolveNextPath = (nextValue) => {
  if (!nextValue) {
    return createPageUrl('Home');
  }

  try {
    const nextUrl = new URL(nextValue, window.location.origin);
    return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  } catch {
    return nextValue;
  }
};

const loadGoogleScript = () => new Promise((resolve, reject) => {
  if (typeof window === 'undefined') {
    reject(new Error('Google sign-in is only available in the browser.'));
    return;
  }

  if (window.google?.accounts?.id) {
    resolve(window.google);
    return;
  }

  const existingScript = document.querySelector('script[data-google-identity="true"]');
  if (existingScript) {
    existingScript.addEventListener('load', () => resolve(window.google), { once: true });
    existingScript.addEventListener('error', () => reject(new Error('Unable to load Google sign-in.')), { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = 'true';
  script.onload = () => resolve(window.google);
  script.onerror = () => reject(new Error('Unable to load Google sign-in.'));
  document.head.appendChild(script);
});

const GoogleMark = () => (
  <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c6.9 0 9.6-4.8 9.6-7.3 0-.5 0-.9-.1-1.3H12z" />
    <path fill="#34A853" d="M3.3 7.4l3.2 2.3C7.3 8 9.5 6 12 6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2c-3.8 0-7.1 2.2-8.7 5.2z" />
    <path fill="#FBBC05" d="M12 21.8c2.6 0 4.8-.9 6.5-2.5l-3-2.4c-.8.6-1.9 1.1-3.5 1.1-3.9 0-5.2-2.6-5.5-3.8l-3.2 2.5c1.6 3.1 4.9 5.1 8.7 5.1z" />
    <path fill="#4285F4" d="M21.6 14.5c.1-.4.2-.9.2-1.4 0-.5 0-.9-.1-1.3H12v3.9h5.5c-.3 1.3-1.1 2.3-2.1 3l3 2.4c1.8-1.7 3.2-4.2 3.2-6.6z" />
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = useMemo(() => resolveNextPath(searchParams.get('next')), [searchParams]);
  const [activeTab, setActiveTab] = useState('signin');
  const [signInForm, setSignInForm] = useState({ email: '', password: '' });
  const [signUpForm, setSignUpForm] = useState({ first_name: '', middle_name: '', last_name: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleConfig, setGoogleConfig] = useState({ enabled: false, client_id: '' });
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [isCheckingGoogle, setIsCheckingGoogle] = useState(true);
  const googleButtonRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    baseClient.auth.getGoogleConfig()
      .then((config) => {
        if (!isMounted) {
          return;
        }

        setGoogleConfig({
          enabled: Boolean(config?.enabled && config?.client_id),
          client_id: config?.client_id || '',
        });
        setIsCheckingGoogle(false);
      })
      .catch(() => {
        if (isMounted) {
          setGoogleConfig({ enabled: false, client_id: '' });
          setIsCheckingGoogle(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!googleConfig.enabled || !googleConfig.client_id || !googleButtonRef.current) {
      return undefined;
    }

    loadGoogleScript()
      .then((google) => {
        if (!isMounted || !google?.accounts?.id || !googleButtonRef.current) {
          return;
        }

        google.accounts.id.initialize({
          client_id: googleConfig.client_id,
          callback: async (response) => {
            if (!response?.credential) {
              toast.error('Google sign-in was cancelled.');
              return;
            }

            setIsSubmitting(true);

            try {
              const payload = await baseClient.auth.googleLogin({
                credential: response.credential,
                next_url: nextPath,
              });
              toast.success('Signed in with Google successfully.');
              const destination = ['admin', 'super_admin'].includes(payload?.user?.role)
                ? createPageUrl('AdminDashboard')
                : nextPath;
              navigate(destination);
            } catch (error) {
              toast.error(error.message || 'Unable to sign in with Google.');
            } finally {
              if (isMounted) {
                setIsSubmitting(false);
              }
            }
          },
        });

        googleButtonRef.current.innerHTML = '';
        google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: '360',
          text: 'continue_with',
          shape: 'pill',
        });
        setIsGoogleReady(true);
      })
      .catch(() => {
        if (isMounted) {
          setIsGoogleReady(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [googleConfig.client_id, googleConfig.enabled, navigate, nextPath]);

  const handleGoogleUnavailable = () => {
    toast.error('Google sign-in is not configured yet. Add KASA_GOOGLE_CLIENT_ID on the server first.');
  };

  const notifyOtpMailStatus = (response, successMessage) => {
    if (response?.mail_sent === false) {
      toast.error(response.mail_error || 'Verification code was created, but email delivery failed.');
      return;
    }

    toast.success(successMessage);
  };

  const sendVerificationAndRedirect = async (email) => {
    const normalizedEmail = normalizeEmail(email);

    try {
      const response = await baseClient.auth.sendRegistrationOtp({ email: normalizedEmail });
      notifyOtpMailStatus(response, 'Verification code sent. Please verify your email first.');
    } catch (otpError) {
      toast.error(otpError.message || 'Unable to send verification code.');
    } finally {
      navigate(`${createPageUrl('VerifyRegistrationOtp')}?email=${encodeURIComponent(normalizedEmail)}`);
    }
  };

  const handleSignIn = async (event) => {
    event.preventDefault();
    const email = normalizeEmail(signInForm.email);
    const password = signInForm.password;

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    if (!password) {
      toast.error('Password is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = await baseClient.auth.login({
        email,
        password,
        next_url: nextPath,
      });
      toast.success('Signed in successfully.');
      const destination = ['admin', 'super_admin'].includes(payload?.user?.role)
        ? createPageUrl('AdminDashboard')
        : nextPath;
      navigate(destination);
    } catch (error) {
      if ((error.message || '').toLowerCase().includes('verify your email')) {
        await sendVerificationAndRedirect(email);
        return;
      }

      toast.error(error.message || 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (event) => {
    event.preventDefault();

    const firstName = signUpForm.first_name.trim();
    const middleName = signUpForm.middle_name.trim();
    const lastName = signUpForm.last_name.trim();
    const phone = signUpForm.phone.trim();
    const email = normalizeEmail(signUpForm.email);
    const password = signUpForm.password;

    const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

    if (firstName.length < 2) {
      toast.error('Please enter your first name.');
      return;
    }

    if (lastName.length < 2) {
      toast.error('Please enter your last name.');
      return;
    }

    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    if (phone && !isValidPhoneNumber(phone)) {
      toast.error('Please enter a valid phone number.');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }

    if (signUpForm.password !== signUpForm.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = await baseClient.auth.register({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        full_name: fullName,
        phone,
        email,
        password,
        next_url: nextPath,
      });
      notifyOtpMailStatus(payload, 'Account created successfully. Verification code sent to your email.');
      navigate(`${createPageUrl('VerifyRegistrationOtp')}?email=${encodeURIComponent(email)}`);
    } catch (error) {
      toast.error(error.message || 'Unable to create account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background via-muted/30 to-background px-4 py-10 sm:px-6">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border bg-card/70 p-8 backdrop-blur-sm">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <TreePalm className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-primary">Kasa Ilaya</p>
              <h1 className="font-display text-3xl font-bold text-foreground">Welcome back</h1>
            </div>
          </div>

          <p className="max-w-xl text-sm leading-7 text-muted-foreground">
            Sign in to manage your bookings, track lost-and-found reports, and keep your profile details up to date.
            New guests can create an account here as well.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border bg-background/80 p-5">
              <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">Secure account access</p>
              <p className="mt-2 text-sm text-muted-foreground">Your session, profile updates, and password changes are now stored in the database.</p>
            </div>
            <div className="rounded-2xl border bg-background/80 p-5">
              <UserPlus className="mb-3 h-5 w-5 text-secondary" />
              <p className="font-semibold text-foreground">Quick account setup</p>
              <p className="mt-2 text-sm text-muted-foreground">Create a guest account to book packages, leave reviews, and recover access with reset links.</p>
            </div>
          </div>
        </div>

        <Card className="border-0 shadow-xl shadow-black/5">
          <CardHeader>
            <CardTitle>Account access</CardTitle>
            <CardDescription>Use your email and password to sign in, or create a new guest account.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 space-y-3">
              {googleConfig.enabled ? (
                <div className="flex justify-center">
                  <div ref={googleButtonRef} className="min-h-11" />
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleGoogleUnavailable}
                  disabled={isCheckingGoogle}
                >
                  {isCheckingGoogle ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
                  Continue with Google
                </Button>
              )}

              {googleConfig.enabled && !isGoogleReady ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading Google sign-in...
                </div>
              ) : null}

              {!googleConfig.enabled && !isCheckingGoogle ? (
                <p className="text-center text-xs text-muted-foreground">
                  Google sign-in button is ready in the UI, but it still needs a Google client ID in server config to connect.
                </p>
              ) : null}

              <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span>or continue with email</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Create Account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="pt-4">
                <form className="space-y-4" onSubmit={handleSignIn}>
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      value={signInForm.email}
                      onChange={(event) => setSignInForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      value={signInForm.password}
                      onChange={(event) => setSignInForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <Link className="text-primary hover:underline" to={`${createPageUrl('ForgotPassword')}?email=${encodeURIComponent(signInForm.email)}`}>
                      Forgot password?
                    </Link>
                    <button className="text-muted-foreground hover:text-foreground" type="button" onClick={() => setActiveTab('signup')}>
                      Need an account?
                    </button>
                  </div>
                  <Button className="w-full" disabled={isSubmitting} type="submit">Sign In</Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="pt-4">
                <form className="space-y-4" onSubmit={handleSignUp}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-first-name">First name</Label>
                      <Input
                        id="signup-first-name"
                        value={signUpForm.first_name}
                        onChange={(event) => setSignUpForm((current) => ({ ...current, first_name: event.target.value }))}
                        placeholder="Juan"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-last-name">Last name</Label>
                      <Input
                        id="signup-last-name"
                        value={signUpForm.last_name}
                        onChange={(event) => setSignUpForm((current) => ({ ...current, last_name: event.target.value }))}
                        placeholder="Dela Cruz"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-middle-name">Middle name (optional)</Label>
                    <Input
                      id="signup-middle-name"
                      value={signUpForm.middle_name}
                      onChange={(event) => setSignUpForm((current) => ({ ...current, middle_name: event.target.value }))}
                      placeholder="Santos"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Phone number</Label>
                    <Input
                      id="signup-phone"
                      value={signUpForm.phone}
                      onChange={(event) => setSignUpForm((current) => ({ ...current, phone: event.target.value }))}
                      placeholder="09xxxxxxxxx"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={signUpForm.email}
                      onChange={(event) => setSignUpForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        value={signUpForm.password}
                        onChange={(event) => setSignUpForm((current) => ({ ...current, password: event.target.value }))}
                        placeholder="Minimum 8 characters"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm">Confirm password</Label>
                      <Input
                        id="signup-confirm"
                        type="password"
                        value={signUpForm.confirmPassword}
                        onChange={(event) => setSignUpForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                        placeholder="Repeat password"
                        required
                      />
                    </div>
                  </div>
                  <Button className="w-full" disabled={isSubmitting} type="submit">Create Account</Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}