/**
 * Structured JSON Logger for Supabase Edge Functions
 *
 * Outputs JSON-formatted logs that are queryable in Supabase Logs Explorer.
 * Every log line includes requestId for tracing requests end-to-end.
 *
 * Usage:
 * ```typescript
 * import { createLogger } from '../_shared/logger.ts';
 *
 * const logger = createLogger({
 *   requestId: crypto.randomUUID(),
 *   functionName: 'process-gmail-notification'
 * });
 *
 * logger.info('Processing started', { historyId: '12345' });
 * logger.error('Failed to process', error, { messageId: 'abc' });
 *
 * // Create child logger with additional context
 * const msgLogger = logger.child({ messageId: 'msg-123', organizationId: 'org-456' });
 * msgLogger.info('Message processed');
 * ```
 */

export interface LogContext {
  requestId: string;
  functionName: string;
  organizationId?: string;
  intakeEventId?: string;
  messageId?: string;
  proposalId?: string;
  [key: string]: string | undefined;
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  child(context: Partial<LogContext>): Logger;
}

export function createLogger(context: LogContext): Logger {
  const formatLine = (message: string, data?: Record<string, unknown>) => {
    // Build prefix like [reqId:abc123][org:xyz][msg:123]
    const parts: string[] = [];

    if (context.requestId) parts.push(`req:${context.requestId.slice(0, 8)}`);
    if (context.organizationId) parts.push(`org:${context.organizationId.slice(0, 8)}`);
    if (context.intakeEventId) parts.push(`intake:${context.intakeEventId.slice(0, 8)}`);
    if (context.messageId) parts.push(`msg:${context.messageId.slice(0, 8)}`);
    if (context.proposalId) parts.push(`proposal:${context.proposalId.slice(0, 8)}`);

    const prefix = parts.length > 0 ? `[${parts.join('][')}] ` : '';

    // Format data as key=value pairs if present
    let suffix = '';
    if (data && Object.keys(data).length > 0) {
      const dataParts = Object.entries(data).map(([k, v]) => {
        if (typeof v === 'object') return `${k}=${JSON.stringify(v)}`;
        return `${k}=${v}`;
      });
      suffix = ` | ${dataParts.join(', ')}`;
    }

    return `${prefix}${message}${suffix}`;
  };

  return {
    info: (message, data) => console.info(formatLine(message, data)),
    warn: (message, data) => console.warn(formatLine(message, data)),
    error: (message, err, data) => {
      const errorData: Record<string, unknown> = { ...data };

      if (err !== undefined) {
        if (err instanceof Error) {
          errorData.errorName = err.name;
          errorData.errorMsg = err.message;
        } else {
          errorData.error = err;
        }
      }

      console.error(formatLine(message, errorData));
    },
    debug: (message, data) => console.debug(formatLine(message, data)),
    child: (newContext) => createLogger({ ...context, ...newContext } as LogContext)
  };
}
