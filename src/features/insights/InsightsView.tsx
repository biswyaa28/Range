import React, { useMemo, useState } from 'react';
import type { AppRoute } from '@/hooks';
import { useStore } from '@/store';
import type { InsightChartItem, InsightRange } from '@/domain/insights';
import { buildBarChart, buildInsightSummary } from '@/domain/insights';
import { todayISO } from '@/domain/dates';
import { health, platformName } from '@/platform';
import type { HealthDataSummary } from '@/platform';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { Segmented } from '@/ui/Segmented';
import { Sparkline } from '@/ui/Sparkline';
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

interface HealthStatProps {
  metric: 'steps' | 'sleep' | 'active';
  label: string;
  value: string;
  sub: string;
  chip?: string;
  spark?: number[];
  live?: boolean;
}

const HealthStat: React.FC<HealthStatProps> = ({
  metric,
  label,
  value,
  sub,
  chip,
  spark,
  live = false,
}) => (
  <article
    className={`stat-card insights-health-card${live ? ' is-live' : ''}`}
    data-health={metric}
  >
    <div className="stat-label">
      {label}
      {chip ? <span className="chip">{chip}</span> : null}
    </div>
    <div className="stat-big">{value}</div>
    {spark ? (
      <Sparkline data={spark} width={220} height={44} className="insight-health-spark" />
    ) : null}
    <div className="stat-sub">{sub}</div>
  </article>
);

function formatHours(hours?: number): string {
  if (hours === undefined) return '—';
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatNumber(value?: number): string {
  return value === undefined ? '—' : value.toLocaleString();
}

type HealthUiState =
  | 'idle'
  | 'checking'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface InsightsViewProps {
  onNavigate?: (route: AppRoute) => void;
}

export const InsightsView: React.FC<InsightsViewProps> = ({ onNavigate }) => {
  const state = useStore();
  const [range, setRange] = useState<InsightRange>('week');

  const summary = useMemo(() => buildInsightSummary(state, range), [state, range]);

  const healthSupported = platformName === 'android';
  const [healthState, setHealthState] = useState<HealthUiState>('idle');
  const [healthData, setHealthData] = useState<HealthDataSummary | null>(null);

  const loadHealth = async () => {
    setHealthState('checking');
    try {
      const access = await health.requestAccess();
      if (access === 'unavailable') {
        setHealthState('unavailable');
        return;
      }
      if (access === 'denied') {
        setHealthState('denied');
        return;
      }

      setHealthState('loading');
      const data = await health.getSummary(todayISO());
      setHealthData(data);
      setHealthState(data ? 'ready' : 'empty');
    } catch {
      setHealthState('error');
    }
  };

  const handleHealth = () => {
    if (!healthSupported) return;

    if (healthState === 'denied') {
      void health
        .openSettings()
        .then(() => setHealthState('idle'))
        .catch(() => setHealthState('error'));
      return;
    }

    void loadHealth();
  };

  const healthChip = !healthSupported
    ? 'Sample'
    : healthState === 'ready'
      ? 'Health Connect'
      : healthState === 'denied'
        ? 'No access'
        : healthState === 'unavailable'
          ? 'Unavailable'
          : healthState === 'error'
            ? 'Error'
            : 'Not connected';

  const healthHint = !healthSupported
    ? 'Steps, sleep and active calories from a tracker. The sparklines below are sample values until a provider is connected.'
    : healthState === 'ready'
      ? "Today's steps and active calories, plus last night's sleep. Read-only from Health Connect; nothing leaves this device."
      : healthState === 'empty'
        ? 'No health data yet. Check that Health Connect has data and that access is granted.'
        : healthState === 'denied'
          ? "Access wasn't granted. Open Health Connect to allow steps, sleep and active calories."
          : healthState === 'unavailable'
            ? "Health Connect isn't available on this device. Install Health Connect from the Play Store."
            : healthState === 'error'
              ? "Couldn't read Health Connect. Try again."
              : healthState === 'checking' || healthState === 'loading'
                ? 'Waiting for Health Connect…'
                : 'Read-only access to steps, sleep and active calories. Data stays on this device.';

  const healthAction = !healthSupported
    ? 'Preview (coming soon)'
    : healthState === 'checking'
      ? 'Connecting…'
      : healthState === 'loading'
        ? 'Reading…'
        : healthState === 'denied'
          ? 'Open Health Connect'
          : healthState === 'unavailable'
            ? 'Unavailable'
            : healthState === 'error'
              ? 'Try again'
              : healthState === 'ready' || healthState === 'empty'
                ? 'Refresh'
                : 'Connect Health Connect';

  const healthActionDisabled =
    !healthSupported ||
    healthState === 'checking' ||
    healthState === 'loading' ||
    healthState === 'unavailable';

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
              Health <span className="chip">{healthChip}</span>
            </h2>
            <p className="hint" role="status" aria-live="polite">
              {healthHint}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={healthActionDisabled}
            data-action="health-connect"
            onClick={handleHealth}
          >
            <Icon name="heart" size={16} />
            {healthAction}
          </Button>
        </div>

        <div className="insights-health-grid">
          {healthSupported ? (
            <>
              <HealthStat
                metric="steps"
                label="Steps"
                value={formatNumber(healthData?.steps)}
                sub={healthState === 'ready' ? 'Today' : 'No data yet'}
                chip={healthState === 'ready' ? 'Live' : undefined}
                live={healthState === 'ready'}
              />
              <HealthStat
                metric="sleep"
                label="Sleep"
                value={formatHours(healthData?.sleepHours)}
                sub={healthState === 'ready' ? 'Last night' : 'No data yet'}
                chip={healthState === 'ready' ? 'Live' : undefined}
                live={healthState === 'ready'}
              />
              <HealthStat
                metric="active"
                label="Active calories"
                value={
                  healthData?.activeCalories === undefined
                    ? '—'
                    : `${healthData.activeCalories.toLocaleString()} kcal`
                }
                sub={healthState === 'ready' ? 'Today' : 'No data yet'}
                chip={healthState === 'ready' ? 'Live' : undefined}
                live={healthState === 'ready'}
              />
            </>
          ) : (
            <>
              <HealthStat
                metric="steps"
                label="Steps"
                value="7.2k"
                sub="Last 7 days · sample data"
                chip="Sample"
                spark={SAMPLE_STEPS}
              />
              <HealthStat
                metric="sleep"
                label="Sleep"
                value="7h 0m"
                sub="Last 7 nights · sample data"
                chip="Sample"
                spark={SAMPLE_SLEEP}
              />
              <HealthStat
                metric="active"
                label="Active minutes"
                value="42"
                sub="Last 7 days · sample data"
                chip="Sample"
                spark={SAMPLE_ACTIVE}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
};
