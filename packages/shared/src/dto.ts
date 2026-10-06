import type { AdminRole, Role } from "./roles";

import type { Locale } from "./locale";

export interface AuthUserDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  adminRole: AdminRole | null;
  twoFactorEnabled: boolean;
  // Saved UI language; the web app switches to it on sign-in.
  locale: Locale;
}

export interface RegisterRequestDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  // The language the visitor was browsing in, saved as their preference.
  locale?: Locale;
}

export interface LoginRequestDTO {
  email: string;
  password: string;
}

export interface LoginResponseDTO {
  status: "ok";
  accessToken: string;
  user: AuthUserDTO;
}

export interface LoginChallengeResponseDTO {
  status: "2fa_required";
  challengeToken: string;
}

export interface TwoFactorVerifyRequestDTO {
  challengeToken: string;
  // A 6-digit authenticator code, or a backup code (XXXXX-XXXXX).
  code: string;
}

export interface TwoFactorSetupResponseDTO {
  secret: string;
  otpAuthUrl: string;
}
