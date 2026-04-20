import { useState } from 'react';
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { formatApiError } from '@/lib/error';

export function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const resendMutation = trpc.auth.resendVerification.useMutation({
    onSuccess: () => {
      setSent(true);
      setError('');
    },
    onError: (err) => setError(formatApiError(err.message)),
  });

  if (!user || user.emailVerifiedAt) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium bg-energy/90 text-background">
      <span className="flex-1 text-center">
        {sent
          ? 'Email de vérification envoyé. Pensez à vérifier vos spams.'
          : 'Votre adresse email n\u2019est pas vérifiée.'}
        {error && ` — ${error}`}
      </span>
      {!sent && (
        <button
          type="button"
          onClick={() => resendMutation.mutate()}
          disabled={resendMutation.isPending}
          className="whitespace-nowrap underline hover:no-underline disabled:opacity-60"
        >
          {resendMutation.isPending ? 'Envoi...' : 'Renvoyer l\u2019email'}
        </button>
      )}
    </div>
  );
}
