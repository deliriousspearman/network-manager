import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings } from '../../../api/settings';

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern (US)' },
  { value: 'America/Chicago', label: 'Central (US)' },
  { value: 'America/Denver', label: 'Mountain (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific (US)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Tokyo', label: 'Japan (JST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Perth', label: 'Perth (AWST)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (ACST/ACDT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' },
];

export default function TimezoneSection() {
  const queryClient = useQueryClient();
  const [timezone, setTimezone] = useState('UTC');

  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: fetchSettings,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (appSettings?.timezone) setTimezone(appSettings.timezone);
  }, [appSettings?.timezone]);

  const settingsMut = useMutation({
    mutationFn: (tz: string) => updateSettings({ timezone: tz }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['app-settings'] }),
  });

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', margin: '0 0 1rem' }}>App Settings</h3>
      <div className="form-group" style={{ maxWidth: '320px', marginBottom: '1rem' }}>
        <label>Timezone</label>
        <select value={timezone} onChange={e => setTimezone(e.target.value)}>
          {TIMEZONES.map(tz => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
          Used for all timestamp displays (command outputs, etc.)
        </p>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => settingsMut.mutate(timezone)}
        disabled={settingsMut.isPending}
      >
        {settingsMut.isPending ? 'Saving...' : 'Save Settings'}
      </button>
      {settingsMut.isSuccess && (
        <span style={{ marginLeft: '0.75rem', fontSize: '0.85rem', color: 'var(--color-success, #16a34a)' }}>Saved.</span>
      )}
    </div>
  );
}
