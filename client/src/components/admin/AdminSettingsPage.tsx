import { useEffect } from 'react';
import TimezoneSection from './sections/TimezoneSection';
import NotificationBarSection from './sections/NotificationBarSection';
import ProjectsSection from './sections/ProjectsSection';
import BackupSection from './sections/BackupSection';

export default function AdminSettingsPage() {
  useEffect(() => {
    document.title = 'Network Manager - Admin Settings';
    return () => { document.title = 'Network Manager'; };
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Admin Settings</h2>
      <TimezoneSection />
      <NotificationBarSection />
      <ProjectsSection />
      <BackupSection />
    </div>
  );
}
