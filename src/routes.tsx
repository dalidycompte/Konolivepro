import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

// Lazy imports
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));

const ApplicantDashboard = lazy(() => import('./pages/applicant/ApplicantDashboard'));
const NewRequestPage = lazy(() => import('./pages/applicant/NewRequestPage'));
const RequestHistoryPage = lazy(() => import('./pages/applicant/RequestHistoryPage'));
const RequestDetailPage = lazy(() => import('./pages/applicant/RequestDetailPage'));
const ApplicantMessagesPage = lazy(() => import('./pages/applicant/ApplicantMessagesPage'));
const NotificationsPage = lazy(() => import('./pages/applicant/NotificationsPage'));

const AgentDashboard = lazy(() => import('./pages/agent/AgentDashboard'));
const ProcessRequestPage = lazy(() => import('./pages/agent/ProcessRequestPage'));
const AgentHistoryPage = lazy(() => import('./pages/agent/AgentHistoryPage'));
const AgentMessagesPage = lazy(() => import('./pages/agent/AgentMessagesPage'));
const AgentMonthlyTrackingPage = lazy(() => import('./pages/agent/AgentMonthlyTrackingPage'));
const AgentPerformancePage = lazy(() => import('./pages/agent/AgentPerformancePage'));
const AgentSettingsPage = lazy(() => import('./pages/agent/AgentSettingsPage'));
const AgentMyGSMPage = lazy(() => import('./pages/agent/AgentMyGSMPage'));
const AgentDailyEvolutionPage = lazy(() => import('./pages/agent/AgentDailyEvolutionPage'));

const SupervisorDashboard = lazy(() => import('./pages/supervisor/SupervisorDashboard'));
const SupervisorAgentStatsPage = lazy(() => import('./pages/supervisor/SupervisorAgentStatsPage'));
const SupervisorQueuePage = lazy(() => import('./pages/supervisor/SupervisorQueuePage'));
const SupervisorHistoryPage = lazy(() => import('./pages/supervisor/SupervisorHistoryPage'));
const SupervisorRequestsPage = lazy(() => import('./pages/supervisor/SupervisorRequestsPage'));
const SupervisorReportsPage = lazy(() => import('./pages/supervisor/SupervisorReportsPage'));
const SupervisorSettingsPage = lazy(() => import('./pages/supervisor/SupervisorSettingsPage'));
const SupervisorProcessingOptionsPage = lazy(() => import('./pages/supervisor/SupervisorProcessingOptionsPage'));
const SupervisorProcessingTimePage = lazy(() => import('./pages/supervisor/SupervisorProcessingTimePage'));
const SupervisorGrossAddPage = lazy(() => import('./pages/supervisor/SupervisorGrossAddPage'));
const AgentStatusPage = lazy(() => import('./pages/supervisor/AgentStatusPage'));
const PublicSupervisorDashboard = lazy(() => import('./pages/supervisor/PublicSupervisorDashboard'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminAccountPage = lazy(() => import('./pages/admin/AdminAccountPage'));
const AdminRequestsPage = lazy(() => import('./pages/admin/AdminRequestsPage'));
const AdminStatsPage = lazy(() => import('./pages/admin/AdminStatsPage'));
const AdminLogsPage = lazy(() => import('./pages/admin/AdminLogsPage'));
const AdminConfigPage = lazy(() => import('./pages/admin/AdminConfigPage'));
const AdminHistoryPage = lazy(() => import('./pages/admin/AdminHistoryPage'));
const AdminIntegrationsPage = lazy(() => import('./pages/admin/AdminIntegrationsPage'));

const StyleShowcasePage = lazy(() => import('./pages/StyleShowcasePage'));

const DiscussionPage = lazy(() => import('./pages/discussion/DiscussionPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function L({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          {/* Spinner neumorphique */}
          <div
            className="w-14 h-14 rounded-full animate-spin"
            style={{
              background: 'hsl(var(--background))',
              boxShadow: '6px 6px 12px hsl(var(--shadow-dark,0 0% 70%)/0.6), -6px -6px 12px hsl(var(--shadow-light,0 0% 100%)/0.8), inset 0 0 0 3px transparent',
              borderTop: '3px solid hsl(var(--primary))',
            }}
          />
          <span className="text-sm text-muted-foreground animate-pulse">Chargement…</span>
        </div>
      </div>
    }>
      {children}
    </Suspense>
  );
}

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  // Redirect root → login
  { name: 'Home', path: '/', element: <Navigate to="/login" replace />, public: true },

  // Auth
  { name: 'Connexion', path: '/login', element: <L><LoginPage /></L>, public: true },
  { name: 'Inscription', path: '/register', element: <L><RegisterPage /></L>, public: true },
  { name: 'Mot de passe oublié', path: '/forgot-password', element: <L><ForgotPasswordPage /></L>, public: true },

  // Public dashboard
  { name: 'Tableau public', path: '/public/dashboard/:token', element: <L><PublicSupervisorDashboard /></L>, public: true },
  { name: 'Statut agents', path: '/supervisor/agent-status', element: <L><AgentStatusPage /></L> },

  // Applicant
  { name: 'Tableau de bord', path: '/dashboard', element: <L><ApplicantDashboard /></L> },
  { name: 'Nouvelle demande', path: '/dashboard/new-request', element: <L><NewRequestPage /></L> },
  { name: 'Historique demandes', path: '/dashboard/requests', element: <L><RequestHistoryPage /></L> },
  { name: 'Détail demande', path: '/dashboard/requests/:id', element: <L><RequestDetailPage /></L> },
  { name: 'Messages', path: '/dashboard/messages', element: <L><ApplicantMessagesPage /></L> },
  { name: 'Notifications', path: '/dashboard/notifications', element: <L><NotificationsPage /></L> },

  // Agent
  { name: 'Agent', path: '/agent', element: <L><AgentDashboard /></L> },
  { name: 'Traitement', path: '/agent/process/:id', element: <L><ProcessRequestPage /></L> },
  { name: 'Historique agent', path: '/agent/history', element: <L><AgentHistoryPage /></L> },
  { name: 'Messages agent', path: '/agent/messages', element: <L><AgentMessagesPage /></L> },
  { name: 'Suivi mensuel', path: '/agent/monthly-tracking', element: <L><AgentMonthlyTrackingPage /></L> },
  { name: 'Performances', path: '/agent/performances', element: <L><AgentPerformancePage /></L> },
  { name: 'Paramètres agent', path: '/agent/settings', element: <L><AgentSettingsPage /></L> },
  { name: 'Mon GSM', path: '/agent/my-gsm', element: <L><AgentMyGSMPage /></L> },
  { name: 'Évolution journalière', path: '/agent/daily-evolution', element: <L><AgentDailyEvolutionPage /></L> },

  // Supervisor
  { name: 'Superviseur', path: '/supervisor', element: <L><SupervisorDashboard /></L> },
  { name: 'Stats agents', path: '/supervisor/agents', element: <L><SupervisorAgentStatsPage /></L> },
  { name: 'Fil d’attente', path: '/supervisor/queue', element: <L><SupervisorQueuePage /></L> },
  { name: 'Historique', path: '/supervisor/history', element: <L><SupervisorHistoryPage /></L> },
  { name: 'Demandes', path: '/supervisor/requests', element: <L><SupervisorRequestsPage /></L> },
  { name: 'Rapports', path: '/supervisor/reports', element: <L><SupervisorReportsPage /></L> },
  { name: 'Paramètres superviseur', path: '/supervisor/settings', element: <L><SupervisorSettingsPage /></L> },
  { name: 'Options traitement', path: '/supervisor/processing-options', element: <L><SupervisorProcessingOptionsPage /></L> },
  { name: 'Temps traitement', path: '/supervisor/processing-time', element: <L><SupervisorProcessingTimePage /></L> },
  { name: 'Ajout brut', path: '/supervisor/gross-add', element: <L><SupervisorGrossAddPage /></L> },

  // Admin
  { name: 'Admin', path: '/admin', element: <L><AdminDashboard /></L> },
  { name: 'Utilisateurs', path: '/admin/users', element: <L><AdminUsersPage /></L> },
  { name: 'Compte admin', path: '/admin/account', element: <L><AdminAccountPage /></L> },
  { name: 'Demandes admin', path: '/admin/requests', element: <L><AdminRequestsPage /></L> },
  { name: 'Statistiques admin', path: '/admin/stats', element: <L><AdminStatsPage /></L> },
  { name: 'Logs', path: '/admin/logs', element: <L><AdminLogsPage /></L> },
  { name: 'Configuration', path: '/admin/config', element: <L><AdminConfigPage /></L> },
  { name: 'Historique admin', path: '/admin/history', element: <L><AdminHistoryPage /></L> },
  { name: 'Intégrations & API', path: '/admin/integrations', element: <L><AdminIntegrationsPage /></L> },

  // Discussion interne
  { name: 'Discussion', path: '/discussion', element: <L><DiscussionPage /></L> },
  { name: 'Discussion avec', path: '/discussion/:userId', element: <L><DiscussionPage /></L> },

  // 404
  { name: 'Non trouvé', path: '/404', element: <L><NotFound /></L>, public: true },

  // Styles de design
  { name: 'Styles', path: '/styles', element: <L><StyleShowcasePage /></L>, public: true },
];

