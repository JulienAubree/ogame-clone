import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { formatApiError } from '@/lib/error';
import { AuthShell } from '@/components/landing/AuthShell';

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

export default function Register() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  // Pre-fill from the landing newsletter ("?email=…")
  useEffect(() => {
    const prefill = searchParams.get('email');
    if (prefill) setEmail(prefill);
  }, [searchParams]);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      setAuth(data.accessToken, data.refreshToken, data.user);
      navigate('/empire');
    },
    onError: (err) => setError(formatApiError(err.message)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    registerMutation.mutate({ email, username, password });
  };

  return (
    <AuthShell
      eyebrow="Première mission"
      title="Fonder votre empire"
      footer={
        <p className="text-muted-foreground">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <Input
          placeholder="Nom de commandant"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="username"
        />
        <div>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe (8 caractères min.)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
        <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? 'Création...' : "S'inscrire"}
        </Button>
      </form>
    </AuthShell>
  );
}
