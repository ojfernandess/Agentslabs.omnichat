import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, ArrowRight, Mail, Lock, User } from 'lucide-react';

const AuthPage: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = isSignUp
      ? await signUp(email, password, name)
      : await signIn(email, password);

    if (result.error) {
      setError(result.error.message || 'Erro ao autenticar');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <MessageSquare className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <span className="text-xl font-semibold text-sidebar-foreground">OmniChat</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-sidebar-foreground leading-tight" style={{ lineHeight: '1.15' }}>
            Atendimento omnichannel unificado
          </h1>
          <p className="text-lg text-sidebar-muted max-w-md">
            Gerencie WhatsApp, Messenger, Instagram, Telegram, E-mail e Live Chat em um único painel com CRM integrado.
          </p>
          <div className="flex gap-4">
            {['WhatsApp', 'Messenger', 'Instagram', 'Telegram', 'E-mail', 'Live Chat'].map((ch) => (
              <span key={ch} className="rounded-full bg-sidebar-accent px-3 py-1 text-xs text-sidebar-accent-foreground">
                {ch}
              </span>
            ))}
          </div>
        </div>

        <p className="text-sm text-sidebar-muted">© 2025 OmniChat. Plataforma multi-tenant.</p>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <MessageSquare className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">OmniChat</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{isSignUp ? 'Criar conta' : 'Entrar'}</h2>
            <p className="text-muted-foreground">
              {isSignUp ? 'Preencha os dados para começar' : 'Acesse sua conta para continuar'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    placeholder="Seu nome completo"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {isSignUp ? 'Já tem conta? Entrar' : 'Não tem conta? Criar agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
