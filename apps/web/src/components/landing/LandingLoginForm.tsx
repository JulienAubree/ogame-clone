import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc, resetRefreshState } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { formatApiError } from '@/lib/error';

export function LandingLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      resetRefreshState();
      setAuth(data.accessToken, data.refreshToken, data.user);
      navigate('/');
    },
    onError: (err) => setError(formatApiError(err.message)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({ email, password, rememberMe });
  };

  return (
    <section
      id="connexion"
      className="mx-auto max-w-md px-4 py-16 scroll-mt-20 sm:px-6 sm:py-24"
    >
      <h2 className="mb-6 text-center text-2xl font-semibold text-foreground">Déjà empereur ?</h2>
      <div className="glass-card p-6 animate-slide-up">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm text-muted-foreground">Se souvenir de moi</span>
          </label>
          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Connexion...' : 'Se connecter'}
          </Button>
          <p className="text-center text-sm">
            <Link to="/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">
              Mot de passe oublié ?
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Pas de compte ?{' '}
            <Link to="/register" className="text-primary hover:underline">
              S&apos;inscrire
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
