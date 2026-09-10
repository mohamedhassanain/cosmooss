import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/auth-utils';
import { useLoginBackoff } from '@/hooks/useLoginBackoff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Store, Mail, Lock, ArrowLeft, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
});

function formatCooldown(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { isBlocked, cooldownRemaining, beforeAttempt, registerFailure, registerSuccess } = useLoginBackoff();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const handleSubmit = async () => {
    if (!beforeAttempt()) {
      toast.error(`Trop de tentatives. Réessayez dans ${formatCooldown(cooldownRemaining)}.`);
      return;
    }

    try {
      const validation = loginSchema.safeParse({ email, password });
      if (!validation.success) {
        toast.error(validation.error.errors[0].message);
        return;
      }

      setLoading(true);

      const { error } = await signIn(email, password);

      if (error) {
        registerFailure(error);
        const message = error.message.includes('Invalid login credentials')
          ? 'Email ou mot de passe incorrect'
          : error.message.includes('rate limit') || error.message.includes('Request rate limit')
            ? `Trop de tentatives. Réessayez dans ${formatCooldown(cooldownRemaining)}.`
            : error.message;
        toast.error(message);
        return;
      }

      registerSuccess();
      toast.success('Connexion réussie !');
      navigate(from, { replace: true });
    } catch {
      toast.error('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/30 to-background p-4">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l'accueil
        </Link>

        {isBlocked && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span>
              Trop de tentatives de connexion. Réessayez dans {formatCooldown(cooldownRemaining)}.
            </span>
          </div>
        )}

        <Card className="border-2 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg">
              <Store className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-display">Cosmooss</CardTitle>
            <CardDescription>
              Votre boutique de cosmétiques naturels & bio au Maroc
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full gradient-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
              onClick={handleSubmit}
              disabled={loading || isBlocked}
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
