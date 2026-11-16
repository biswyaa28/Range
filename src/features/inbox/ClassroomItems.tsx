import React from 'react';
import { classroomPlanItems } from '@/domain/integrations';
import { fmtShort } from '@/domain/dates';
import { useIntegrations } from '@/integrations/useIntegrations';
import { openExternal } from '@/platform/openExternal';
import { Icon } from '@/ui/Icon';
import './ClassroomItems.css';

export const ClassroomItems: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const integration = useIntegrations();
  const items = classroomPlanItems(integration.classroom);
  if (!integration.settings.classroom || items.length === 0) return null;

  return (
    <section className={`panel classroom-panel${compact ? ' compact' : ''}`} aria-labelledby="classroom-items-title">
      <div className="panel-head">
        <h2 id="classroom-items-title">Classroom</h2>
        <span className="chip solid">Read-only</span>
        <span className="spacer" />
        <span className="hint">From Google Classroom. Never synced as your own records.</span>
      </div>
      <div className="classroom-items">
        {items.slice(0, compact ? 4 : 100).map((item) => (
          <article className="classroom-item" key={item.id}>
            <div className="classroom-item-main">
              <div className="classroom-item-title">{item.title}</div>
              <div className="dl-tags">
                <span className="chip solid">Classroom</span>
                <span className="chip">{item.course || 'Course'}</span>
                {item.exam ? <span className="chip red">Exam</span> : null}
                <span className="chip mono">{fmtShort(item.due)}</span>
                <span className="chip">{item.state === 'turned-in' ? 'Turned in' : item.state}</span>
              </div>
            </div>
            <button
              type="button"
              className="ibtn"
              aria-label={`Open ${item.title} in Classroom`}
              disabled={!item.alternateLink}
              onClick={() => void openExternal(item.alternateLink)}
            >
              <Icon name="eye" />
            </button>
          </article>
        ))}
      </div>
      <p className="classroom-submit-note">
        Submitting coursework is not possible with the Classroom API. Open Classroom to turn work in.
      </p>
    </section>
  );
};
