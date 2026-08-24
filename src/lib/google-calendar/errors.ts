export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryable = false,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

export class GoogleApiError extends GoogleCalendarError {
  constructor(
    message: string,
    readonly googleStatus: number,
    details?: unknown,
  ) {
    const retryable =
      googleStatus === 408 ||
      googleStatus === 429 ||
      googleStatus >= 500;
    super(message, "google_api_error", googleStatus, retryable, details);
    this.name = "GoogleApiError";
  }
}

export function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1_000);
  }

  return "Erro desconhecido ao sincronizar com o Google Agenda.";
}
