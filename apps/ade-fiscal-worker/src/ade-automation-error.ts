export type AdeAutomationErrorCode =
  | 'ADE_DRY_RUN_DISABLED'
  | 'ADE_INTERNAL_AUTH_REQUIRED'
  | 'ADE_CONFIGURATION_INVALID'
  | 'ADE_SESSION_REQUIRED'
  | 'ADE_SESSION_INVALID'
  | 'ADE_BROWSER_UNAVAILABLE'
  | 'ADE_NAVIGATION_FAILED'
  | 'ADE_SELECTOR_PROFILE_INVALID'
  | 'ADE_MARKER_NOT_FOUND';

export type AdeAutomationErrorCategory =
  | 'CONFIGURATION'
  | 'AUTH_REQUIRED'
  | 'BROWSER'
  | 'NAVIGATION'
  | 'SELECTOR_MISMATCH';

export class AdeAutomationError extends Error {
  constructor(
    message: string,
    readonly code: AdeAutomationErrorCode,
    readonly category: AdeAutomationErrorCategory,
    readonly retrySafe: boolean,
  ) {
    super(message);
    this.name = 'AdeAutomationError';
  }
}
