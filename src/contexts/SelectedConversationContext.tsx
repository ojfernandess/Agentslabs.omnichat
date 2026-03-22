import React, { createContext, useContext, useState, useCallback } from 'react';

type SelectedConversationContextValue = {
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;
};

const SelectedConversationContext = createContext<SelectedConversationContextValue | null>(null);

export function SelectedConversationProvider({ children }: { children: React.ReactNode }) {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const setter = useCallback((id: string | null) => setSelectedConversationId(id), []);
  return (
    <SelectedConversationContext.Provider
      value={{ selectedConversationId, setSelectedConversationId: setter }}
    >
      {children}
    </SelectedConversationContext.Provider>
  );
}

export function useSelectedConversation() {
  const ctx = useContext(SelectedConversationContext);
  if (!ctx) return { selectedConversationId: null, setSelectedConversationId: () => {} };
  return ctx;
}
