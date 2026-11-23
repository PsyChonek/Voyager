// Single structured logger. Quiet by default in production builds.
type Level = 'debug' | 'info' | 'warn' | 'error';
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold: Level =
  (import.meta.env.PUBLIC_LOG_LEVEL as Level) || (import.meta.env.DEV ? 'debug' : 'warn');

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  if (order[level] < order[threshold]) return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => emit('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit('error', msg, data),
};
