export interface ReleaseInfo {
  available: boolean;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  version: string;
  notes: string;
  uploadedAt: string | null;
  downloadCount: number;
}

export interface AuthStatus {
  envConfigured: boolean;
  claimed: boolean;
  authenticated: boolean;
}
