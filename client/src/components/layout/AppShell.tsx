import { type ReactNode, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import { fetchSettings } from '../../api/settings';

export default function AppShell({ children }: { children: ReactNode }) {
  const { data: settings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: fetchSettings,
    staleTime: 30_000,
  });

  const isVisible = settings?.notification_enabled === 'true' && !!settings?.notification_text?.trim();
  const height = isVisible ? `${parseInt(settings?.notification_height || '40', 10)}px` : '0px';

  useEffect(() => {
    document.documentElement.style.setProperty('--notif-bar-height', height);
    return () => { document.documentElement.style.setProperty('--notif-bar-height', '0px'); };
  }, [height]);

  return (
    <>
      {isVisible && (
        <div
          className="notification-bar"
          style={{
            backgroundColor: settings?.notification_bg_color || '#f59e0b',
            color: settings?.notification_text_color || '#000000',
            height,
            fontSize: `${parseInt(settings?.notification_font_size || '14', 10)}px`,
            fontWeight: settings?.notification_bold === 'true' ? 700 : 400,
          }}
        >
          {settings!.notification_text}
        </div>
      )}
      <div className="app-shell">
        <Sidebar />
        <main className="main-content">{children}</main>
      </div>
    </>
  );
}
