import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/trpc';
import { formatApiError } from '@/lib/error';

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Faible', color: 'bg-destructive' };
  if (score <= 3) return { score, label: 'Moyen', color: 'bg-energy' };
  return { score, label: 'Fort', color: 'bg-green-500' };
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    },
    onError: (err) => setError(formatApiError(err.message)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas');
      return;
    }
    resetMutation.mutate({ token, password });
  };

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background bg-stars p-4">
        <div className="w-full max-w-sm glass-card p-6 animate-slide-up space-y-4">
          <h1 className="text-center text-2xl font-bold glow-silicium">Exilium</h1>
          <p className="text-sm text-destructive">Lien invalide. Le jeton de réinitialisation est manquant.</p>
          <Link to="/forgot-password" className="block text-center text-sm text-primary hover:underline">
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background bg-stars p-4">
      <div className="w-full max-w-sm glass-card p-6 animate-slide-up">
        <h1 className="text-center text-2xl font-bold glow-silicium mb-2">Exilium</h1>
        <p className="text-center text-sm text-muted-foreground mb-6">Nouveau mot de passe</p>

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-green-500">Mot de passe mis à jour. Redirection vers la connexion...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nouveau mot de passe (8 min.)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${i < strength.score ? strength.color : 'bg-muted'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{strength.label}</p>
                </div>
              )}
            </div>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Confirmer le mot de passe"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
            <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
              {resetMutation.isPending ? 'Mise à jour...' : 'Réinitialiser'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="hover:text-primary hover:underline">
                Retour à la connexion
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
