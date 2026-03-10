import { Routes, Route, Navigate } from 'react-router-dom';
import ProjectLayout from './components/layout/ProjectLayout';
import ProjectRedirect from './components/layout/ProjectRedirect';
import DeviceList from './components/devices/DeviceList';
import DeviceForm from './components/devices/DeviceForm';
import DeviceDetail from './components/devices/DeviceDetail';
import SubnetList from './components/subnets/SubnetList';
import SubnetForm from './components/subnets/SubnetForm';
import SubnetDetail from './components/subnets/SubnetDetail';
import NetworkDiagram from './components/diagram/NetworkDiagram';
import SettingsPage from './components/settings/SettingsPage';
import CredentialList from './components/credentials/CredentialList';
import CredentialForm from './components/credentials/CredentialForm';
import AdminSettingsPage from './components/admin/AdminSettingsPage';
import AppShell from './components/layout/AppShell';
import OverviewPage from './components/overview/OverviewPage';
import LogsPage from './components/logs/LogsPage';

export default function App() {
  return (
    <Routes>
      {/* Root redirect to last-used project */}
      <Route path="/" element={<ProjectRedirect />} />

      {/* Admin Settings (outside project context) */}
      <Route path="/admin" element={<AppShell><AdminSettingsPage /></AppShell>} />

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
        <Route path="credentials/new" element={<CredentialForm />} />
        <Route path="credentials/:id/edit" element={<CredentialForm />} />
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
  );
}
