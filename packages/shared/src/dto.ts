import type { AdminRole, Role } from "./roles";

export interface AuthUserDTO {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  adminRole: AdminRole | null;
  twoFactorEnabled: boolean;
}

export interface RegisterRequestDTO {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
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
  code: string;
}

export interface TwoFactorSetupResponseDTO {
  secret: string;
  otpAuthUrl: string;
}
