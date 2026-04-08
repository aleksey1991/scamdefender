/**
 * ScamDefender Backend - Main Router
 * Cloudflare Workers entry point
 */

import type { Env, AnalyzeRequest, ReportRequest } from './types.js';
import { validateJWT, getUserStatus } from './auth.js';
import {
  getCachedAnalysis,
  setCachedAnalysis,
  getRateLimit,
  incrementRateLimit,
} from './cache.js';
import { analyzeWithAI } from './analyze.js';
import { checkScamDatabase, reportScam } from './supabase.js';
import { handleStripeWebhook } from './stripe-webhook.js';

/**
 * CORS headers for chrome extension origins
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin =
    origin && origin.startsWith('chrome-extension://')
      ? origin
      : '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle OPTIONS preflight requests
 */
function handleOptions(request: Request): Response {
  const origin = request.headers.get('Origin');
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

/**
 * Create JSON response with CORS headers
 */
function jsonResponse(
  data: unknown,
  status: number,
  origin: string | null
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(origin),
    },
  });
}

/**
 * Extract and validate JWT from Authorization header
 */
async function authenticate(
  request: Request,
  env: Env
): Promise<{ userId: string; email: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const result = await validateJWT(token, env.SUPABASE_JWT_SECRET);

  if (!result.success) {
    return null;
  }

  return result.data;
}

/**
 * GET /status - Health check endpoint
 */
function handleStatus(request: Request): Response {
  const origin = request.headers.get('Origin');
  return jsonResponse(
    {
      status: 'ok',
      timestamp: Date.now(),
    },
    200,
    origin
  );
}

/**
 * POST /analyze - AI analysis endpoint (requires Pro subscription)
 */
async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Authenticate
    const auth = await authenticate(request, env);
    if (!auth) {
      return jsonResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // Parse request body
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const body = (await request.json()) as AnalyzeRequest;
    if (!body.domain || !body.signals) {
      return jsonResponse({ error: 'Missing domain or signals' }, 400, origin);
    }

    const { domain, signals } = body;

    // Check cache first
    const cached = await getCachedAnalysis(env, domain);
    if (cached) {
      return jsonResponse(cached, 200, origin);
    }

    // Check user status (Pro or gifted)
    const userStatus = await getUserStatus(env, auth.userId, auth.email);
    if (!userStatus.isPro) {
      return jsonResponse(
        { error: 'Pro subscription required' },
        403,
        origin
      );
    }

    // Check rate limit (50 requests/day)
    const rateLimit = await getRateLimit(env, auth.userId);
    if (rateLimit >= 50) {
      return jsonResponse(
        { error: 'Rate limit exceeded (50 requests/day)' },
        429,
        origin
      );
    }

    // Perform AI analysis
    const analysisResult = await analyzeWithAI(env, domain, signals);
    if (!analysisResult.success) {
      return jsonResponse({ error: analysisResult.error }, 500, origin);
    }

    // Cache result
    await setCachedAnalysis(env, domain, analysisResult.data);

    // Increment rate limit
    await incrementRateLimit(env, auth.userId);

    // Store in Supabase
    await reportScam(
      env,
      domain,
      analysisResult.data.riskLevel,
      analysisResult.data.score,
      analysisResult.data.verdict,
      analysisResult.data.redFlags
    );

    return jsonResponse(analysisResult.data, 200, origin);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Analysis failed',
      },
      500,
      origin
    );
  }
}

/**
 * GET /scam-check?domain= - Check community scam database (no auth required)
 */
async function handleScamCheck(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    const url = new URL(request.url);
    const domain = url.searchParams.get('domain');

    if (!domain) {
      return jsonResponse({ error: 'Missing domain parameter' }, 400, origin);
    }

    const result = await checkScamDatabase(env, domain);
    if (!result.success) {
      return jsonResponse({ error: result.error }, 500, origin);
    }

    return jsonResponse(result.data, 200, origin);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Check failed',
      },
      500,
      origin
    );
  }
}

/**
 * POST /report - Report a scam domain (requires auth)
 */
async function handleReport(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  try {
    // Authenticate
    const auth = await authenticate(request, env);
    if (!auth) {
      return jsonResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // Parse request body
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const body = (await request.json()) as ReportRequest;
    if (!body.domain || !body.riskLevel || body.riskScore === undefined) {
      return jsonResponse(
        { error: 'Missing required fields' },
        400,
        origin
      );
    }

    // Submit report
    const result = await reportScam(
      env,
      body.domain,
      body.riskLevel,
      body.riskScore,
      body.verdict,
      body.redFlags
    );

    if (!result.success) {
      return jsonResponse({ error: result.error }, 500, origin);
    }

    return jsonResponse({ success: true }, 200, origin);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Report failed',
      },
      500,
      origin
    );
  }
}

/**
 * Main request handler
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle OPTIONS preflight
    if (method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Route requests
    if (path === '/status' && method === 'GET') {
      return handleStatus(request);
    }

    if (path === '/analyze' && method === 'POST') {
      return handleAnalyze(request, env);
    }

    if (path === '/scam-check' && method === 'GET') {
      return handleScamCheck(request, env);
    }

    if (path === '/report' && method === 'POST') {
      return handleReport(request, env);
    }

    if (path === '/webhook/stripe' && method === 'POST') {
      return handleStripeWebhook(request, env);
    }

    // 404 Not Found
    const origin = request.headers.get('Origin');
    return jsonResponse({ error: 'Not found' }, 404, origin);
  },
};
