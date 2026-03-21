import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { OrgProvider, useOrg } from "@/contexts/OrgContext";
import AppLayout from "@/components/layout/AppLayout";
import AuthPage from "@/pages/AuthPage";
import OnboardingPage from "@/pages/OnboardingPage";
import DashboardPage from "@/pages/DashboardPage";
import ConversationsPage from "@/pages/ConversationsPage";
import ContactsPage from "@/pages/ContactsPage";
import TeamPage from "@/pages/TeamPage";
import ChannelsPage from "@/pages/ChannelsPage";
import LabelsPage from "@/pages/LabelsPage";
import SettingsPage from "@/pages/SettingsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import WebhooksPage from "@/pages/WebhooksPage";
import NotFound from "@/pages/NotFound";
import MetaOAuthCallbackPage from "@/pages/MetaOAuthCallbackPage";
import CannedResponsesPage from "@/pages/CannedResponsesPage";
import CaptainPage from "@/pages/CaptainPage";
import CampaignsPage from "@/pages/CampaignsPage";
import HelpCenterAdminPage from "@/pages/HelpCenterAdminPage";
import TeamsSettingsPage from "@/pages/TeamsSettingsPage";
import CustomAttributesPage from "@/pages/CustomAttributesPage";
import AutomationRulesPage from "@/pages/AutomationRulesPage";
import MacrosPage from "@/pages/MacrosPage";
import AuditLogPage from "@/pages/AuditLogPage";
import RolePermissionsPage from "@/pages/RolePermissionsPage";
import SlaPoliciesPage from "@/pages/SlaPoliciesPage";
import WorkflowSettingsPage from "@/pages/WorkflowSettingsPage";
import SecuritySettingsPage from "@/pages/SecuritySettingsPage";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const { user, loading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useOrg();

  if (authLoading || (user && orgLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <AuthPage />;
  if (!currentOrg) return <OnboardingPage />;

  return (
    <Routes>
      <Route path="/integrations/meta/callback" element={<MetaOAuthCallbackPage />} />
      <Route
        path="*"
        element={
          <AppLayout>
            <Routes>
              <Route path="/" element={<Navigate to="/inbox" replace />} />
              <Route path="/dashboard" element={<Navigate to="/inbox" replace />} />
              <Route path="/inbox" element={<DashboardPage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/contacts" element={<ContactsPage />} />
              <Route path="/reports" element={<AnalyticsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/captain" element={<CaptainPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/help-center" element={<HelpCenterAdminPage />} />
              <Route path="/settings" element={<Navigate to="/settings/account" replace />} />
              <Route path="/settings/account" element={<SettingsPage />} />
              <Route path="/settings/bots" element={<SettingsPage />} />
              <Route path="/settings/webhooks" element={<SettingsPage />} />
              <Route path="/settings/agents" element={<TeamPage />} />
              <Route path="/settings/inboxes" element={<ChannelsPage />} />
              <Route path="/settings/labels" element={<LabelsPage />} />
              <Route path="/settings/canned-responses" element={<CannedResponsesPage />} />
              <Route path="/settings/teams" element={<TeamsSettingsPage />} />
              <Route path="/settings/attributes" element={<CustomAttributesPage />} />
              <Route path="/settings/automation" element={<AutomationRulesPage />} />
              <Route path="/settings/macros" element={<MacrosPage />} />
              <Route path="/settings/audit" element={<AuditLogPage />} />
              <Route path="/settings/roles" element={<RolePermissionsPage />} />
              <Route path="/settings/sla" element={<SlaPoliciesPage />} />
              <Route path="/settings/workflow" element={<WorkflowSettingsPage />} />
              <Route path="/settings/security" element={<SecuritySettingsPage />} />
              <Route path="/settings/integrations" element={<WebhooksPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="/labels" element={<LabelsPage />} />
              <Route path="/webhooks" element={<WebhooksPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        }
      />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <AppRoutes />
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
