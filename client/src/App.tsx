import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProjectLayout from './components/layout/ProjectLayout';
import ProjectRedirect from './components/layout/ProjectRedirect';
import AppShell from './components/layout/AppShell';
import LoadingSpinner from './components/ui/LoadingSpinner';

// Code-split heavy pages
const DeviceList = lazy(() => import('./components/devices/DeviceList'));
const DeviceForm = lazy(() => import('./components/devices/DeviceForm'));
const DeviceDetail = lazy(() => import('./components/devices/DeviceDetail'));
const SubnetList = lazy(() => import('./components/subnets/SubnetList'));
const SubnetForm = lazy(() => import('./components/subnets/SubnetForm'));
const SubnetDetail = lazy(() => import('./components/subnets/SubnetDetail'));
const NetworkDiagram = lazy(() => import('./components/diagram/NetworkDiagram'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));
const CredentialList = lazy(() => import('./components/credentials/CredentialList'));
const AdminSettingsPage = lazy(() => import('./components/admin/AdminSettingsPage'));
const AdminLogsPage = lazy(() => import('./components/admin/AdminLogsPage'));
const OverviewPage = lazy(() => import('./components/overview/OverviewPage'));
const LogsPage = lazy(() => import('./components/logs/LogsPage'));

function SuspenseWrap({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
}

export default function App() {
  return (
    <SuspenseWrap>
      <Routes>
        {/* Root redirect to last-used project */}
        <Route path="/" element={<ProjectRedirect />} />

        {/* Admin routes (outside project context) */}
        <Route path="/admin" element={<AppShell><AdminSettingsPage /></AppShell>} />
        <Route path="/admin/logs" element={<AppShell><AdminLogsPage /></AppShell>} />

        {/* Project-scoped routes */}
        <Route path="/p/:projectSlug" element={<ProjectLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="devices" element={<DeviceList />} />
          <Route path="devices/new" element={<DeviceForm />} />
          <Route path="devices/:id" element={<DeviceDetail />} />
          <Route path="devices/:id/edit" element={<DeviceForm />} />
          <Route path="subnets" element={<SubnetList />} />
          <Route path="subnets/new" element={<SubnetForm />} />
          <Route path="subnets/:id" element={<SubnetDetail />} />
          <Route path="subnets/:id/edit" element={<SubnetForm />} />
          <Route path="credentials" element={<CredentialList />} />
          <Route path="diagram" element={<NetworkDiagram />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="logs" element={<LogsPage />} />
        </Route>

        {/* Legacy URL redirects */}
        <Route path="/devices/*" element={<Navigate to="/p/default/devices" replace />} />
        <Route path="/subnets/*" element={<Navigate to="/p/default/subnets" replace />} />
        <Route path="/credentials/*" element={<Navigate to="/p/default/credentials" replace />} />
        <Route path="/diagram" element={<Navigate to="/p/default/diagram" replace />} />
        <Route path="/settings" element={<Navigate to="/p/default/settings" replace />} />
      </Routes>
    </SuspenseWrap>
  );
}
