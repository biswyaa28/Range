# Engines

## Purpose
Houses headless computational engines such as audio synthesis (noise generator), pomodoro timer tickers, spring solvers, and search scoring.

## Rules
- Pure algorithmic logic decoupled from React components.
- State machines and pure services exposed via clean callable APIs.
- `llm/` owns provider transport and retry policy behind `LLMProvider`; it never reads
  Settings, secure storage, or React state.

