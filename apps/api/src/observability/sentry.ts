import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import * as Sentry from "@sentry/node";

/** Starts Sentry when SENTRY_DSN is set. Call once, before the Nest app is created. Returns whether it is active. */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: env.COGNA_ENV?.trim() || env.NODE_ENV || "development",
    release: env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    // Students are minors: Sentry v11 collects user info, cookies, headers, bodies, DB data and
    // local variables by default. Turn all of it off; an error report needs the stack, not the student.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
  });
  return true;
}

/**
 * Nest handles exceptions itself, so Express error middleware never sees them. Report
 * unexpected errors (non-HTTP or 5xx) here, then defer to Nest's normal response handling.
 * 4xx (validation, auth, not found) are expected behaviour and are not reported.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (!(exception instanceof HttpException) || exception.getStatus() >= 500) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }
}
