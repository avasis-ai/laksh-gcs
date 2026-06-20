// Shared types for the Reactor platform integration.
// These mirror the documented Reactor REST + SDK shapes.

export type ReactorStatus = "disconnected" | "connecting" | "waiting" | "ready";

export interface TokenResponse {
  jwt: string;
  /** Unix seconds when the JWT expires. */
  expires_at: number;
}

export interface PricingRate {
  amount_per_sec: number;
  unit: string;
  denomination: string;
}

export interface PricingModel {
  id: string;
  name: string;
  rate: PricingRate;
}

export interface PricingSettings {
  credits_per_dollar: number;
  purchase: { min_dollars: number; max_dollars: number };
  auto_topup?: { min_dollars: number };
  max_account_credits?: number;
}

export interface PricingResponse {
  settings: PricingSettings;
  models: PricingModel[];
}

export interface ReactorErrorBody {
  error: string;
  status?: number;
}

/** A normalized failure surfaced from API routes to the client. */
export interface ApiError {
  error: string;
  code: string;
}
