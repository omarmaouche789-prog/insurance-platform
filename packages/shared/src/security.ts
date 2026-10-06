// 2FA, login history and password reset contracts.

export const BACKUP_CODE_COUNT = 10;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const LOGIN_METHODS = ["PASSWORD", "TOTP", "BACKUP_CODE", "PASSWORD_RESET"] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];

export const LOGIN_METHOD_LABELS: Record<LoginMethod, string> = {
  PASSWORD: "Password",
  TOTP: "Authenticator app",
  BACKUP_CODE: "Backup code",
  PASSWORD_RESET: "Password reset",
};

export interface TwoFactorStatusDTO {
  enabled: boolean;
  enabledAt: string | null;
  backupCodesRemaining: number;
  // False when an admin has turned off 2FA enrollment in System Settings.
  setupAvailable: boolean;
}

// Returned when setup starts. The secret is also shown as text for apps that
// can't scan a QR code.
export interface TwoFactorEnableResponseDTO {
  secret: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
}

export interface TwoFactorCodeRequestDTO {
  code: string;
}

export interface TwoFactorDisableRequestDTO {
  password: string;
  // A current authenticator code or an unused backup code.
  code: string;
}

// Plaintext backup codes are only ever returned here, once.
export interface BackupCodesResponseDTO {
  backupCodes: string[];
}

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export interface LoginHistoryEntryDTO {
  id: string;
  success: boolean;
  method: LoginMethod;
  failureReason: string | null;
  ipAddress: string | null;
  device: string | null;
  deviceType: DeviceType;
  createdAt: string;
}

export interface LoginHistoryResponseDTO {
  total: number;
  page: number;
  pageSize: number;
  entries: LoginHistoryEntryDTO[];
}

export interface PasswordResetValidateResponseDTO {
  purpose: "RESET" | "INVITE";
  firstName: string;
  // Masked, e.g. "u***@example.com".
  email: string;
}

export interface PasswordResetConfirmRequestDTO {
  token: string;
  password: string;
}

// Backup codes are 10 characters from an unambiguous alphabet, displayed as
// two groups of five. Normalizing lets users type them with or without the
// dash, in any case.
export function normalizeBackupCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function isTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
