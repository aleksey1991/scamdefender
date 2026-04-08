/**
 * Supabase integration module
 * Handles scam database queries and reports
 */

import type { Env, Result, ScamCheckResult, ScamSite } from './types.js';

/**
 * Check if a domain exists in the scam database
 */
export async function checkScamDatabase(
  env: Env,
  domain: string
): Promise<Result<ScamCheckResult>> {
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/scam_sites?domain=eq.${encodeURIComponent(domain)}&select=*`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Supabase query failed: ${response.status} ${response.statusText}`,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const data = (await response.json()) as ScamSite[];

    if (data.length === 0) {
      return {
        success: true,
        data: {
          found: false,
          domain,
        },
      };
    }

    const site = data[0];
    return {
      success: true,
      data: {
        found: true,
        domain: site.domain,
        riskLevel: site.risk_level,
        riskScore: site.risk_score,
        reportCount: site.report_count,
        confirmedScam: site.confirmed_scam,
      },
    };
  } catch (_error) {
    return {
      success: false,
      error: `Supabase error: ${_error instanceof Error ? _error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Report a scam domain to the database
 * Uses UPSERT pattern - inserts new or updates existing
 */
export async function reportScam(
  env: Env,
  domain: string,
  riskLevel: string,
  riskScore: number,
  verdict?: string,
  redFlags?: string[]
): Promise<Result<void>> {
  try {
    // First, check if domain exists
    const checkResult = await checkScamDatabase(env, domain);
    if (!checkResult.success) {
      return checkResult;
    }

    const exists = checkResult.data.found;
    const now = new Date().toISOString();

    if (exists) {
      // Update existing record - increment report_count and update last_seen_at
      const updateUrl = `${env.SUPABASE_URL}/rest/v1/scam_sites?domain=eq.${encodeURIComponent(domain)}`;
      const currentCount = checkResult.data.reportCount || 1;

      const updateData = {
        report_count: currentCount + 1,
        last_seen_at: now,
        // Update risk info if score is higher
        ...(riskScore > (checkResult.data.riskScore || 0) && {
          risk_level: riskLevel,
          risk_score: riskScore,
          ai_verdict: verdict || null,
          red_flags: redFlags || null,
        }),
      };

      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to update scam report: ${response.status}`,
        };
      }
    } else {
      // Insert new record
      const insertUrl = `${env.SUPABASE_URL}/rest/v1/scam_sites`;

      const insertData = {
        domain,
        risk_level: riskLevel,
        risk_score: riskScore,
        report_count: 1,
        ai_verdict: verdict || null,
        red_flags: redFlags || null,
        safe_browsing_flagged: false,
        first_seen_at: now,
        last_seen_at: now,
        confirmed_scam: false,
      };

      const response = await fetch(insertUrl, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(insertData),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to insert scam report: ${response.status}`,
        };
      }
    }

    return {
      success: true,
      data: undefined,
    };
  } catch (_error) {
    return {
      success: false,
      error: `Report error: ${_error instanceof Error ? _error.message : 'Unknown error'}`,
    };
  }
}
