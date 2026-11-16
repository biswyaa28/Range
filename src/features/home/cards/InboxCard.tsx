import React from 'react';
import type { BentoCardSize } from '@/domain/types';
import { classroomPlanItems } from '@/domain/integrations';
import { fmtShort } from '@/domain/dates';
import { useIntegrations } from '@/integrations/useIntegrations';
import { integrationsAvailable } from '@/integrations/controller';
import { Icon } from '@/ui/Icon';
import { useHome } from '../HomeContext';

export const InboxCard: React.FC<{ size: BentoCardSize }> = ({ size }) => {
  const { actions } = useHome();
  const integration = useIntegrations();
  const classroom = classroomPlanItems(integration.classroom);
  const gmail = integration.gmail?.digest ?? [];
  const count = classroom.length + gmail.length;
  const available = integrationsAvailable();
  const connected = integration.settings.gmail || integration.settings.classroom;

  if (!available || !connected) {
    return (
      <>
        <h3>Inbox</h3>
        <div className="es">
          <Icon name="flag" />
          <p>{available ? 'Connect Gmail or Classroom in Settings.' : 'Available in the Android and Mac builds.'}</p>
          <button type="button" onClick={() => actions.navigate(available ? 'settings' : 'inbox')}>
            {available ? 'Open integrations' : 'Open inbox'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <h3>Inbox</h3>
      <div className="sub">{count} recent · on device</div>

      {classroom.slice(0, size === 'S' ? 1 : 2).map((item) => (
        <div className="dlrow" key={item.id}>
          <div className="dlhead">
            <span>
              {item.exam ? 'Exam · ' : 'Classroom · '}
              {item.title}
            </span>
            <em>{fmtShort(item.due)}</em>
          </div>
        </div>
      ))}
      {size !== 'S' && gmail.slice(0, 1).map((item) => (
        <div className="dlrow" key={item.id}>
          <div className="dlhead">
            <span>Gmail · {item.subject}</span>
            <em>{item.dueDate ? fmtShort(item.dueDate) : 'Task'}</em>
          </div>
        </div>
      ))}
      <button type="button" className="pbtn" onClick={() => actions.navigate('inbox')}>
        Open inbox
      </button>
    </>
  );
};
