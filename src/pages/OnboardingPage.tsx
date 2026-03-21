import React, { useState } from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, ArrowRight } from 'lucide-react';

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
        <div className="flex items-center gap-3 justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Criar sua empresa</h1>
          <p className="text-muted-foreground">
            Configure sua organização para começar a usar o OmniChat
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
