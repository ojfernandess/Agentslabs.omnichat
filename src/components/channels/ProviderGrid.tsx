import React from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CHANNEL_PROVIDERS, type ChannelProvider } from './providerCatalog';
import { cn } from '@/lib/utils';

type Props = {
  onSelect: (provider: ChannelProvider) => void;
};

const ProviderGrid: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {CHANNEL_PROVIDERS.map((provider) => {
        const Icon = provider.icon;
        const disabled = provider.comingSoon;
        return (
          <Card
            key={provider.id}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onClick={() => !disabled && onSelect(provider)}
            onKeyDown={(e) => {
              if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onSelect(provider);
              }
            }}
            className={cn(
              'transition-all border bg-card',
              disabled
                ? 'opacity-60 cursor-not-allowed'
                : 'cursor-pointer hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
          >
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                {disabled && (
                  <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
                    Em breve
                  </Badge>
                )}
              </div>
              <div>
                <CardTitle className="text-base">{provider.name}</CardTitle>
                <CardDescription className="text-sm mt-1 leading-snug">
                  {provider.description}
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
};

export default ProviderGrid;
