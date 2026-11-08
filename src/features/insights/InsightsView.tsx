import React, { useEffect, useMemo, useState } from 'react';
import type { AppRoute } from '@/hooks';
import { useStore } from '@/store';
import type { InsightChartItem, InsightRange } from '@/domain/insights';
import { buildBarChart, buildInsightSummary } from '@/domain/insights';
import { health } from '@/platform';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { Segmented } from '@/ui/Segmented';
import { Sparkline } from '@/ui/Sparkline';
import { useToast } from '@/ui/Toast';
import './InsightsView.css';

const SAMPLE_STEPS = [4.2, 6.1, 5.3, 7.8, 6.9, 8.4, 7.2];
const SAMPLE_SLEEP = [6.5, 7.1, 6.8, 7.4, 6.2, 7.6, 7.0];
const SAMPLE_ACTIVE = [32, 44, 28, 51, 39, 57, 42];

interface BarChartProps {
  items: InsightChartItem[];
  ariaLabel: string;
  goal?: number;
  goalLabel?: string;
}

const BarChart: React.FC<BarChartProps> = ({ items, ariaLabel, goal, goalLabel }) => {
  const model = buildBarChart(items, { goal, goalLabel });
  const peak = Math.max(0, ...items.map((item) => item.value));

  return (
    <svg
      className="chart insight-chart"
      viewBox={`0 0 ${model.width} ${model.height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {model.ticks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={model.padLeft}
            y1={tick.y}
            x2={model.width - model.padRight}
            y2={tick.y}
            style={{ stroke: 'var(--border)' }}
            strokeWidth={tick.value === 0 ? 1.5 : 1}
            strokeDasharray={tick.value > 0 ? '3 6' : undefined}
            opacity={tick.value > 0 ? 0.7 : 1}
          />
          <text
            x={model.padLeft - 7}
            y={tick.y + 4}
            textAnchor="end"
            fontSize={10.5}
            style={{ fill: 'var(--text-2)' }}
          >
            {tick.label}
          </text>
        </g>
      ))}

      {model.goalY !== null && (
        <g>
          <line
            x1={model.padLeft}
            y1={model.goalY}
            x2={model.width - model.padRight}
            y2={model.goalY}
            style={{ stroke: 'var(--accent-text)' }}
            strokeWidth={1.4}
            strokeDasharray="6 4"
          />
          <text
            x={model.width - model.padRight}
            y={model.goalY - 6}
            textAnchor="end"
            fontSize={10}
            style={{ fill: 'var(--accent-text)' }}
          >
            {model.goalLabel}
          </text>
        </g>
      )}

      {model.bars.map((bar) => (
        <g key={`${bar.index}-${bar.label}`}>
          <rect
            className="cbar"
            style={
              {
                '--i': bar.index,
                fill: 'var(--chart-bar)',
                opacity: bar.value > 0 ? 1 : 0.35,
              } as React.CSSProperties
            }
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={Math.max(bar.height, 3)}
            rx={4}
          >
            {bar.value > 0 ? <title>{`${bar.label}: ${bar.value}`}</title> : null}
          </rect>
          {bar.value > 0 &&
          (items.length <= 10 || bar.index % model.labelEvery === 0 || bar.value === peak) ? (
            <text
              x={bar.x + bar.width / 2}
              y={bar.y - 6}
              textAnchor="middle"
              fontSize={10}
              style={{ fill: 'var(--text)' }}
            >
              {bar.value}
            </text>
          ) : null}
          {bar.index % model.labelEvery === 0 ? (
            <text
              x={bar.x + bar.width / 2}
              y={model.height - 18}
              textAnchor="middle"
              fontSize={9.5}
              style={{ fill: 'var(--text-2)' }}
            >
              {bar.label}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
};

export interface InsightsViewProps {
  onNavigate?: (route: AppRoute) => void;
}

export const InsightsView: React.FC<InsightsViewProps> = ({ onNavigate }) => {
  const state = useStore();
  const toast = useToast();
  const [range, setRange] = useState<InsightRange>('week');
  const [healthAvailable, setHealthAvailable] = useState(false);

  const summary = useMemo(() => buildInsightSummary(state, range), [state, range]);

  useEffect(() => {
    let mounted = true;
    health
      .isAvailable()
      .then((available) => {
        if (mounted) setHealthAvailable(available);
      })
      .catch(() => {
        if (mounted) setHealthAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const navigate = (route: AppRoute) => {
    if (onNavigate) {
      onNavigate(route);
      return;
    }
    window.location.hash = `#${route}`;
  };

  const rate = summary.completionRate;
  const tasksAverage = (summary.tasksDone / Math.max(1, summary.activeDays)).toFixed(1);
  const focusAverage = Math.round(summary.focusMinutes / Math.max(1, summary.activeDays));

  const taskItems: InsightChartItem[] = summary.days.map((day) => ({
    label: day.label,
    value: day.tasksDone,
  }));
  const focusItems: InsightChartItem[] = summary.days.map((day) => ({
    label: day.label,
    value: day.focusMinutes,
  }));

  return (
    <div className="view-content insights-view">
      <div className="view-head">
        <h1>Insights</h1>
        <div className="rule" />
      </div>

      <div className="insights-toolbar">
        <Segmented<InsightRange>
          value={range}
          onChange={setRange}
          options={[
            { value: 'week', label: 'This week' },
            { value: '30d', label: 'Last 30 days' },
          ]}
          aria-label="Insights range"
        />
        <span className="hint insights-toolbar-note">
          {summary.activeDays} active day{summary.activeDays === 1 ? '' : 's'} in this range
        </span>
      </div>

      <div className="stats-cards">
        <article className="stat-card" data-stat="completion">
          <div className="stat-label">Block completion</div>
          <div className="stat-big">{rate === null ? '—' : `${rate}%`}</div>
          <div className="mini-bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${((rate ?? 0) / 100).toFixed(3)})` }} />
          </div>
          <div className="stat-sub">
            {summary.blocksTotal
              ? `${summary.blocksDone} of ${summary.blocksTotal} blocks`
              : 'No blocks scheduled'}
          </div>
        </article>

        <article className="stat-card" data-stat="tasks">
          <div className="stat-label">
            <Icon name="check" size={14} />
            Tasks done
          </div>
          <div className="stat-big">{summary.tasksDone}</div>
          <div className="stat-sub">Avg {tasksAverage} / active day</div>
        </article>

        <article className="stat-card" data-stat="streak">
          <div className="stat-label">
            <Icon name="bolt" size={14} />
            Current streak
          </div>
          <div className="stat-big">{summary.streak}</div>
          <Sparkline
            data={summary.streakSpark}
            width={150}
            height={32}
            className="insight-streak-spark"
            strokeWidth={2}
          />
          <div className="stat-sub">Days with ≥80% blocks done</div>
        </article>

        <article className="stat-card" data-stat="focus">
          <div className="stat-label">
            <Icon name="timer" size={14} />
            Focus time
          </div>
          <div className="stat-big">{summary.focusMinutes}</div>
          <div className="stat-sub">Minutes · avg {focusAverage} / active day</div>
        </article>
      </div>

      {!summary.hasActivity && (
        <Card className="insights-empty">
          <EmptyState
            icon="chart"
            title="No activity in this range yet"
            description="Check a block off, finish a task, or run a focus session. Everything here is built from your real history — nothing is invented."
            action={
              <div className="insights-empty-actions">
                <Button variant="primary" onClick={() => navigate('plan')}>
                  Open plan
                </Button>
                <Button variant="secondary" onClick={() => navigate('tasks')}>
                  Add a task
                </Button>
              </div>
            }
          />
        </Card>
      )}

      <Card className="chart-card insights-chart-card">
        <div className="insights-chart-head">
          <h2>Tasks done per day</h2>
          <span className="chip">Σ {summary.tasksDone}</span>
        </div>
        <BarChart
          items={taskItems}
          ariaLabel={`Tasks done per day bar chart, ${range === 'week' ? 'this week' : 'last 30 days'}`}
        />
      </Card>

      <Card className="chart-card insights-chart-card">
        <div className="insights-chart-head">
          <h2>Focus minutes per day</h2>
          <span className="chip">Σ {summary.focusMinutes} min</span>
        </div>
        <BarChart
          items={focusItems}
          goal={summary.goalMinutes}
          goalLabel={`Daily goal ${summary.goalMinutes} min`}
          ariaLabel={`Focus minutes per day bar chart, ${range === 'week' ? 'this week' : 'last 30 days'}`}
        />
      </Card>

      <section className="insights-health" aria-labelledby="insights-health-title">
        <div className="insights-health-head">
          <div>
            <h2 id="insights-health-title">
              Health <span className="chip">Sample</span>
            </h2>
            <p className="hint">
              Steps, sleep and active minutes from a tracker. The sparklines below are sample
              values until a provider is connected.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              toast.showToast(
                healthAvailable
                  ? 'Health data is connected'
                  : 'Health sync lands in the Android app. No data leaves this device.',
              )
            }
            data-action="health-connect"
          >
            <Icon name="heart" size={16} />
            {healthAvailable ? 'Health connected' : 'Connect on Android'}
          </Button>
        </div>

        <div className="insights-health-grid">
          <article className="stat-card insights-health-card" data-health="steps">
            <div className="stat-label">
              Steps
              <span className="chip">Sample</span>
            </div>
            <div className="stat-big">7.2k</div>
            <Sparkline data={SAMPLE_STEPS} width={220} height={44} className="insight-health-spark" />
            <div className="stat-sub">Last 7 days · sample data</div>
          </article>

          <article className="stat-card insights-health-card" data-health="sleep">
            <div className="stat-label">
              Sleep
              <span className="chip">Sample</span>
            </div>
            <div className="stat-big">7h 0m</div>
            <Sparkline data={SAMPLE_SLEEP} width={220} height={44} className="insight-health-spark" />
            <div className="stat-sub">Last 7 nights · sample data</div>
          </article>

          <article className="stat-card insights-health-card" data-health="active">
            <div className="stat-label">
              Active minutes
              <span className="chip">Sample</span>
            </div>
            <div className="stat-big">42</div>
            <Sparkline data={SAMPLE_ACTIVE} width={220} height={44} className="insight-health-spark" />
            <div className="stat-sub">Last 7 days · sample data</div>
          </article>
        </div>
      </section>
    </div>
  );
};
