import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { formatApiError } from '@/lib/error';

type Status = 'pending' | 'success' | 'error';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>('pending');
  const [error, setError] = useState('');
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const calledRef = useRef(false);

  const verifyMutation = trpc.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setStatus('success');
      if (user && !user.emailVerifiedAt) {
        setUser({ ...user, emailVerifiedAt: new Date().toISOString() });
      }
    },
    onError: (err) => {
      setError(formatApiError(err.message));
      setStatus('error');
    },
  });

  useEffect(() => {
    if (!token || calledRef.current) return;
    calledRef.current = true;
    verifyMutation.mutate({ token });
  }, [token, verifyMutation]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background bg-stars p-4">
      <div className="w-full max-w-sm glass-card p-6 animate-slide-up space-y-4">
        <h1 className="text-center text-2xl font-bold glow-silicium">Exilium</h1>
        <p className="text-center text-sm text-muted-foreground">Vérification de l'email</p>

        {!token && (
          <p className="text-sm text-destructive">Lien invalide. Le jeton de vérification est manquant.</p>
        )}

        {token && status === 'pending' && (
          <p className="text-sm text-muted-foreground text-center">Vérification en cours...</p>
        )}

        {status === 'success' && (
          <div className="space-y-3">
            <p className="text-sm text-green-500 text-center">Votre adresse email est vérifiée.</p>
            <Link to="/" className="block text-center text-sm text-primary hover:underline">
              Aller au jeu
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Link to="/login" className="block text-center text-sm text-primary hover:underline">
              Retour à la connexion
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
