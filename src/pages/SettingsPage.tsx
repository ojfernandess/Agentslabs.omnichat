import React from 'react';
import { useOrg } from '@/contexts/OrgContext';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, User, Shield } from 'lucide-react';

const SettingsPage: React.FC = () => {
  const { currentOrg, currentMember } = useOrg();
  const { user } = useAuth();

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 lg:p-8 space-y-8 max-w-3xl">
        <div className="animate-fade-in">
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground text-sm">Gerencie as configurações da sua organização</p>
        </div>

        {/* Org info */}
        <div className="rounded-xl border bg-card p-6 space-y-4 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Organização</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={currentOrg?.name || ''} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={currentOrg?.slug || ''} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Plano</Label>
              <Input value={currentOrg?.plan || 'free'} readOnly className="capitalize" />
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="rounded-xl border bg-card p-6 space-y-4 animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Minha conta</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={user?.email || ''} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={currentMember?.display_name || user?.user_metadata?.display_name || ''} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <Input value={currentMember?.role || ''} readOnly className="capitalize" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
