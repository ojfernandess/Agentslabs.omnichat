import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight } from 'lucide-react';
import { APP_LOGO_SRC, APP_NAME } from '@/constants/branding';

const OnboardingPage: React.FC = () => {
  const { createOrganization } = useOrg();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await createOrganization(name, slug);
    if (error) {
      setError(typeof error === 'string' ? error : error.message || 'Erro ao criar organização');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="flex flex-col items-center gap-3 justify-center">
          <img src={APP_LOGO_SRC} alt={APP_NAME} className="h-14 w-auto max-w-[220px] object-contain" />
          <p className="text-sm font-medium text-muted-foreground">{APP_NAME}</p>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Criar sua empresa</h1>
          <p className="text-muted-foreground">
            Configure a sua organização para começar a utilizar a plataforma {APP_NAME}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Nome da empresa</Label>
            <Input
              id="orgName"
              placeholder="Minha Empresa"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgSlug">Identificador único</Label>
            <Input
              id="orgSlug"
              placeholder="minha-empresa"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              pattern="[a-z0-9-]+"
            />
            <p className="text-xs text-muted-foreground">Usado na URL. Apenas letras minúsculas, números e hífens.</p>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-3">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Criando...' : 'Criar empresa'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default OnboardingPage;
