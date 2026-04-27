import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings } from '../../../api/settings';

export default function NotificationBarSection() {
  const queryClient = useQueryClient();

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: fetchSettings,
    staleTime: Infinity,
  });

  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifText, setNotifText] = useState('');
  const [notifBgColor, setNotifBgColor] = useState('#f59e0b');
  const [notifTextColor, setNotifTextColor] = useState('#000000');
  const [notifHeight, setNotifHeight] = useState(40);
  const [notifFontSize, setNotifFontSize] = useState(14);
  const [notifBold, setNotifBold] = useState(false);

  useEffect(() => {
    if (!appSettings) return;
    setNotifEnabled(appSettings.notification_enabled === 'true');
    setNotifText(appSettings.notification_text ?? '');
    setNotifBgColor(appSettings.notification_bg_color ?? '#f59e0b');
    setNotifTextColor(appSettings.notification_text_color ?? '#000000');
    setNotifHeight(parseInt(appSettings.notification_height ?? '40', 10));
    setNotifFontSize(parseInt(appSettings.notification_font_size ?? '14', 10));
    setNotifBold(appSettings.notification_bold === 'true');
  }, [appSettings]);

  const notifMut = useMutation({
    mutationFn: () => updateSettings({
      notification_enabled: notifEnabled ? 'true' : 'false',
      notification_text: notifText,
      notification_bg_color: notifBgColor,
      notification_text_color: notifTextColor,
      notification_height: String(notifHeight),
      notification_font_size: String(notifFontSize),
      notification_bold: notifBold ? 'true' : 'false',
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-settings'] }),
  });

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>Notification Bar</h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Display a banner at the top of every page for all users.
      </p>

      <div className="form-group" style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={notifEnabled}
            onChange={e => setNotifEnabled(e.target.checked)}
            style={{ width: 'auto', margin: 0 }}
          />
          Enable notification bar
        </label>
      </div>

      <div className="form-group" style={{ marginBottom: '0.75rem', maxWidth: '480px' }}>
        <label>Message</label>
        <input
          type="text"
          value={notifText}
          onChange={e => setNotifText(e.target.value)}
          placeholder="Enter notification message..."
        />
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Background colour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input
              type="color"
              value={notifBgColor}
              onChange={e => setNotifBgColor(e.target.value)}
              style={{ width: '36px', height: '36px', padding: '2px', cursor: 'pointer', borderRadius: '4px' }}
            />
            <input
              type="text"
              value={notifBgColor}
              onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setNotifBgColor(e.target.value); }}
              style={{ width: '90px', fontFamily: 'monospace', fontSize: '0.85rem' }}
              maxLength={7}
            />
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Text colour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input
              type="color"
              value={notifTextColor}
              onChange={e => setNotifTextColor(e.target.value)}
              style={{ width: '36px', height: '36px', padding: '2px', cursor: 'pointer', borderRadius: '4px' }}
            />
            <input
              type="text"
              value={notifTextColor}
              onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setNotifTextColor(e.target.value); }}
              style={{ width: '90px', fontFamily: 'monospace', fontSize: '0.85rem' }}
              maxLength={7}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Height (px)</label>
          <input
            type="number"
            value={notifHeight}
            min={24}
            max={80}
            onChange={e => setNotifHeight(Math.max(24, Math.min(80, parseInt(e.target.value) || 40)))}
            style={{ width: '80px' }}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Font size (px)</label>
          <input
            type="number"
            value={notifFontSize}
            min={10}
            max={24}
            onChange={e => setNotifFontSize(Math.max(10, Math.min(24, parseInt(e.target.value) || 14)))}
            style={{ width: '80px' }}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ display: 'block', marginBottom: '0.4rem' }}>Style</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={notifBold}
              onChange={e => setNotifBold(e.target.checked)}
              style={{ width: 'auto', margin: 0 }}
            />
            Bold text
          </label>
        </div>
      </div>

      {notifText.trim() && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Preview</p>
          <div
            className="notification-bar"
            style={{
              position: 'static',
              backgroundColor: notifBgColor,
              color: notifTextColor,
              height: `${notifHeight}px`,
              fontSize: `${notifFontSize}px`,
              fontWeight: notifBold ? 700 : 400,
              borderRadius: '6px',
            }}
          >
            {notifText}
          </div>
        </div>
      )}

      <button
        className="btn btn-primary btn-sm"
        onClick={() => notifMut.mutate()}
        disabled={notifMut.isPending}
      >
        {notifMut.isPending ? 'Saving...' : 'Save Notification Settings'}
      </button>
      {notifMut.isSuccess && (
        <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--color-success, #16a34a)' }}>Saved.</span>
      )}
    </div>
  );
}
