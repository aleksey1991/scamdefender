/**
 * Core TypeScript types for ScamDefender Backend
 *
 * Uses Result<T> pattern for type-safe error handling (no throwing)
 */

// Result pattern for error handling
export type Success<T> = { success: true; data: T };
export type Failure = { success: false; error: string };
export type Result<T> = Success<T> | Failure;

/**
 * AI analysis result for a domain
 */
export interface AnalysisResult {
  domain: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  redFlags: string[];
  verdict: string;
  score: number;
  cachedAt: number;
}

/**
 * Scam database check result
 */
export interface ScamCheckResult {
  found: boolean;
  domain: string;
  riskLevel?: string;
  riskScore?: number;
  reportCount?: number;
  confirmedScam?: boolean;
}

/**
 * User subscription status
 */
export interface UserStatus {
  isPro: boolean;
  isGiftedPro: boolean;
  subscription?: {
    status: string;
    currentPeriodEnd: number;
  };
}

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // KV Namespaces
  SCAM_CACHE: KVNamespace;
  USER_STATUS: KVNamespace;
  RATE_LIMIT: KVNamespace;

  // Secrets
  GEMINI_API_KEY: string;
  SUPABASE_JWT_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;

  // Environment variables
  GIFTED_PRO_EMAILS: string;
  ENVIRONMENT: string;
}

/**
 * JWT payload structure (Supabase JWT)
 */
export interface JWTPayload {
  sub: string;  // userId
  email: string;
  exp: number;  // expiration timestamp
  iat?: number;
  aud?: string;
  role?: string;
}

/**
 * Request body for /analyze endpoint
 */
export interface AnalyzeRequest {
  domain: string;
  signals: {
    domainAgeDays?: number;
    safeBrowsingFlagged?: boolean;
    trustpilot?: {
      found: boolean;
      rating: number | null;
      reviewCount: number | null;
    };
    contentScan?: {
      noPhysicalAddress?: boolean;
      noPhoneNumber?: boolean;
      suspiciousReturnPolicy?: boolean;
      suspiciousLuxuryPricing?: boolean;
    };
  };
}

/**
 * Request body for /report endpoint
 */
export interface ReportRequest {
  domain: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  verdict?: string;
  redFlags?: string[];
}

/**
 * Stripe webhook event
 */
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      customer: string;
      status?: string;
      current_period_end?: number;
      metadata?: {
        userId?: string;
      };
    };
  };
}

/**
 * Supabase scam_sites table row
 */
export interface ScamSite {
  id: string;
  domain: string;
  risk_level: string;
  risk_score: number;
  report_count: number;
  ai_verdict: string | null;
  red_flags: string[] | null;
  domain_age_days: number | null;
  trustpilot_rating: number | null;
  safe_browsing_flagged: boolean;
  first_seen_at: string;
  last_seen_at: string;
  confirmed_scam: boolean;
}

/**
 * Helper type guards
 */
export function isSuccess<T>(result: Result<T>): result is Success<T> {
  return result.success === true;
}

export function isFailure<T>(result: Result<T>): result is Failure {
  return result.success === false;
}
