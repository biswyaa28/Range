import React, { useEffect, useState } from 'react';
import {
  INTEGRATION_SCOPE_COPY,
  type IntegrationId,
} from '@/domain/integrations';
import { useIntegrations } from '@/integrations/useIntegrations';
import {
  connectIntegration,
  disconnectIntegration,
  integrationsAvailable,
  updateIntegrationSettings,
} from '@/integrations/controller';
import { Button } from '@/ui/Button';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/Toast';
import { Haptics } from '@/engines/haptics';
import './IntegrationsSettings.css';

const LABELS: Record<IntegrationId, { title: string; detail: string }> = {
  gmail: {
    title: 'Gmail digest',
    detail: 'Recent inbox mail, local deadline extraction, one-tap add to tasks or deadlines.',
  },
  classroom: {
    title: 'Google Classroom',
    detail: 'Courses, coursework due dates, submission state and announcements from the last 14 days.',
  },
};

export const IntegrationsSettings: React.FC = () => {
  const toast = useToast();
  const state = useIntegrations();
  const available = integrationsAvailable();
  const [busy, setBusy] = useState<IntegrationId | null>(null);
  const [senders, setSenders] = useState(state.settings.senderFilters.join(', '));
  const [labels, setLabels] = useState(state.settings.labelFilters.join(', '));

  useEffect(() => {
    setSenders(state.settings.senderFilters.join(', '));
  }, [state.settings.senderFilters]);

  useEffect(() => {
    setLabels(state.settings.labelFilters.join(', '));
  }, [state.settings.labelFilters]);

  const toggle = async (id: IntegrationId, enabled: boolean): Promise<void> => {
    if (!available) {
      toast.showToast('Google integrations are not available in the browser build.');
      return;
    }
    if (!enabled) {
      if (
        !window.confirm(
          `Disconnect ${LABELS[id].title} and delete its cached data from this device?`,
        )
      ) {
        return;
      }
      setBusy(id);
      try {
        await disconnectIntegration(id);
        Haptics.warning();
        toast.showToast('Disconnected and deleted local data');
      } catch {
        toast.showToast('Could not disconnect. Try again.');
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy(id);
    try {
      await connectIntegration(id);
      Haptics.success();
      toast.showToast('Google connected');
    } catch (error) {
      Haptics.error();
      toast.showToast(error instanceof Error ? error.message : 'Could not connect Google.');
    } finally {
      setBusy(null);
    }
  };

  const commitFilters = (): void => {
    updateIntegrationSettings({
      senderFilters: senders.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean),
    });
    updateIntegrationSettings({
      labelFilters: labels.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean),
    });
  };

  const status =
    !available
      ? 'Not available in the browser build'
      : state.auth.state === 'connected'
        ? 'Connected'
        : state.auth.state === 'reconnect'
          ? 'Reconnect required'
          : 'Not connected';

  return (
    <div className="integrations-settings" data-integrations>
      <div className="integrations-status">
        <span className={`chip${state.auth.state === 'connected' ? ' solid' : ''}`}>
          {status}
        </span>
        <p>
          Google Testing-mode refresh tokens expire after 7 days. Reconnect when access
          ends; cached data stays readable until then.
        </p>
      </div>

      {state.auth.state === 'reconnect' ? (
        <div className="integrations-reconnect" role="alert">
          <p>{state.auth.lastError ?? 'Google access expired.'}</p>
          <Button
            onClick={() =>
              void toggle(state.settings.classroom ? 'classroom' : 'gmail', true)
            }
          >
            Reconnect Google
          </Button>
        </div>
      ) : null}

      {(Object.keys(LABELS) as IntegrationId[]).map((id) => {
        const enabled = state.settings[id];
        return (
          <div className="integration-card" key={id} data-integration={id}>
            <div className="integration-card-head">
              <div>
                <h3>{LABELS[id].title}</h3>
                <p>{LABELS[id].detail}</p>
              </div>
              <Switch
                checked={enabled}
                disabled={!available || busy !== null}
                aria-label={`Enable ${LABELS[id].title}`}
                onChange={(checked) => void toggle(id, checked)}
              />
            </div>
            <p className="integration-scope">{INTEGRATION_SCOPE_COPY[id]}</p>
            {enabled ? (
              <div className="integration-actions">
                <span className="hint">
                  {state.auth.scopes.length > 0
                    ? `${state.auth.scopes.length} read-only scope${state.auth.scopes.length === 1 ? '' : 's'} granted`
                    : 'Scopes granted'}
                </span>
                <Button
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void toggle(id, false)}
                >
                  Disconnect and delete data
                </Button>
              </div>
            ) : null}
            {id === 'classroom' ? (
              <div className="integration-option">
                <div>
                  <strong>Due-date reminders</strong>
                  <p>Reuse local notifications for Classroom items. Off by default.</p>
                </div>
                <Switch
                  checked={state.settings.classroomNotifications}
                  disabled={!enabled}
                  aria-label="Classroom due-date reminders"
                  onChange={(checked) =>
                    updateIntegrationSettings({ classroomNotifications: checked })
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="integration-card">
        <div className="integration-option">
          <div>
            <strong>Let AI read integration data</strong>
            <p>
              Off by default. Sends only sender, subject and snippet of selected emails to
              your AI provider. Never full bodies.
            </p>
          </div>
          <Switch
            checked={state.settings.aiRead}
            disabled={!state.settings.gmail}
            aria-label="Let AI read integration data"
            onChange={(checked) => updateIntegrationSettings({ aiRead: checked })}
          />
        </div>
        <div className="integration-option">
          <div>
            <strong>Include integration data in backups</strong>
            <p>Off by default. Adds the on-device Gmail/Classroom cache to exported backups.</p>
          </div>
          <Switch
            checked={state.settings.includeInBackup}
            aria-label="Include integration data in backups"
            onChange={(checked) => updateIntegrationSettings({ includeInBackup: checked })}
          />
        </div>
      </div>

      <div className="integration-card">
        <h3>University filters</h3>
        <p className="hint">
          Leave blank to read the whole inbox digest. Comma-separated domains, senders or
          labels.
        </p>
        <label className="integration-field">
          <span>Sender domains or addresses</span>
          <input
            value={senders}
            placeholder="itm.edu, placements@university.edu"
            onChange={(event) => setSenders(event.target.value)}
            onBlur={commitFilters}
          />
        </label>
        <label className="integration-field">
          <span>Gmail labels</span>
          <input
            value={labels}
            placeholder="university, placements"
            onChange={(event) => setLabels(event.target.value)}
            onBlur={commitFilters}
          />
        </label>
      </div>

      <p className="hint integration-privacy">
        Gmail and Classroom caches stay on this device, are never written to Firestore or
        synced, and are deleted when you disconnect. Gmail is read-only: no send, mark or
        delete. In-app submission is not possible with the Classroom API.
      </p>
    </div>
  );
};
