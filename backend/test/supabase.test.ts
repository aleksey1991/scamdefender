import { checkScamDatabase, reportScam } from '../src/supabase.js';
import type { Env, _ScamCheckResult, ScamSite } from '../src/types.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('checkScamDatabase', () => {
  const mockEnv: Env = {
    SCAM_CACHE: {} as KVNamespace,
    USER_STATUS: {} as KVNamespace,
    RATE_LIMIT: {} as KVNamespace,
    GEMINI_API_KEY: 'test-api-key',
    SUPABASE_JWT_SECRET: 'test-secret',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-role-key-12345',
    STRIPE_WEBHOOK_SECRET: 'test-webhook',
    GIFTED_PRO_EMAILS: 'test@example.com',
    ENVIRONMENT: 'test',
  };

  const testDomain = 'suspicious-domain.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Domain found in database', () => {
    it('should return Success with found=true and scam details', async () => {
      const mockScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'high',
        risk_score: 85,
        report_count: 12,
        ai_verdict: 'Confirmed phishing site',
        red_flags: ['no physical address', 'suspicious pricing'],
        domain_age_days: 15,
        trustpilot_rating: null,
        safe_browsing_flagged: true,
        first_seen_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-10T12:30:00Z',
        confirmed_scam: true,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([mockScamSite]),
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.found).toBe(true);
        expect(result.data.domain).toBe(testDomain);
        expect(result.data.riskLevel).toBe('high');
        expect(result.data.riskScore).toBe(85);
        expect(result.data.reportCount).toBe(12);
        expect(result.data.confirmedScam).toBe(true);
      }
    });

    it('should extract correct data from first result when multiple exist', async () => {
      const mockScamSites: ScamSite[] = [
        {
          id: '1',
          domain: testDomain,
          risk_level: 'critical',
          risk_score: 95,
          report_count: 50,
          ai_verdict: 'Confirmed malware',
          red_flags: ['malware', 'phishing'],
          domain_age_days: 2,
          trustpilot_rating: null,
          safe_browsing_flagged: true,
          first_seen_at: '2024-01-08T00:00:00Z',
          last_seen_at: '2024-01-10T12:30:00Z',
          confirmed_scam: true,
        },
        {
          id: '2',
          domain: 'other-domain.com',
          risk_level: 'medium',
          risk_score: 60,
          report_count: 5,
          ai_verdict: null,
          red_flags: null,
          domain_age_days: 30,
          trustpilot_rating: 3.5,
          safe_browsing_flagged: false,
          first_seen_at: '2023-12-01T00:00:00Z',
          last_seen_at: '2024-01-09T00:00:00Z',
          confirmed_scam: false,
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce(mockScamSites),
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.riskLevel).toBe('critical');
        expect(result.data.riskScore).toBe(95);
      }
    });
  });

  describe('Domain not found in database', () => {
    it('should return Success with found=false when no results', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.found).toBe(false);
        expect(result.data.domain).toBe(testDomain);
      }
    });

    it('should only include domain field when not found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.found).toBe(false);
        expect(result.data.riskLevel).toBeUndefined();
        expect(result.data.riskScore).toBeUndefined();
      }
    });
  });

  describe('API error handling', () => {
    it('should return Failure when Supabase returns non-200 status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('401');
        expect(result.error).toContain('Unauthorized');
      }
    });

    it('should return Failure on 403 Forbidden', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('403');
        expect(result.error).toContain('Forbidden');
      }
    });

    it('should return Failure on 404 Not Found', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('404');
      }
    });

    it('should return Failure on 500 Server Error', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('500');
      }
    });
  });

  describe('Network error handling', () => {
    it('should return Failure on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Supabase error');
        expect(result.error).toContain('Network error');
      }
    });

    it('should return Failure on connection refused', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('ECONNREFUSED: Connection refused')
      );

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Supabase error');
      }
    });
  });

  describe('Request construction', () => {
    it('should construct correct API URL with encoded domain', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      await checkScamDatabase(mockEnv, testDomain);

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('https://test.supabase.co/rest/v1/scam_sites');
      expect(callUrl).toContain('domain=eq.');
      expect(callUrl).toContain(encodeURIComponent(testDomain));
    });

    it('should encode special characters in domain', async () => {
      const specialDomain = 'test@domain.com?id=123&key=value';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      await checkScamDatabase(mockEnv, specialDomain);

      const callUrl = (global.fetch as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain(encodeURIComponent(specialDomain));
      expect(callUrl).not.toContain('?id=123');
      expect(callUrl).not.toContain('&key=value');
    });

    it('should use GET method', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      await checkScamDatabase(mockEnv, testDomain);

      const options = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(options.method).toBe('GET');
    });

    it('should include correct headers', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      await checkScamDatabase(mockEnv, testDomain);

      const options = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(options.headers.apikey).toBe('test-role-key-12345');
      expect(options.headers.Authorization).toBe(
        'Bearer test-role-key-12345'
      );
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('Response parsing', () => {
    it('should parse null fields correctly', async () => {
      const mockScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'medium',
        risk_score: 50,
        report_count: 1,
        ai_verdict: null,
        red_flags: null,
        domain_age_days: null,
        trustpilot_rating: null,
        safe_browsing_flagged: false,
        first_seen_at: '2024-01-10T00:00:00Z',
        last_seen_at: '2024-01-10T00:00:00Z',
        confirmed_scam: false,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([mockScamSite]),
      });

      const result = await checkScamDatabase(mockEnv, testDomain);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.found).toBe(true);
        expect(result.data.domain).toBe(testDomain);
      }
    });
  });
});

describe('reportScam', () => {
  const mockEnv: Env = {
    SCAM_CACHE: {} as KVNamespace,
    USER_STATUS: {} as KVNamespace,
    RATE_LIMIT: {} as KVNamespace,
    GEMINI_API_KEY: 'test-api-key',
    SUPABASE_JWT_SECRET: 'test-secret',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-role-key-12345',
    STRIPE_WEBHOOK_SECRET: 'test-webhook',
    GIFTED_PRO_EMAILS: 'test@example.com',
    ENVIRONMENT: 'test',
  };

  const testDomain = 'malicious-domain.com';
  const riskLevel = 'high';
  const riskScore = 85;
  const verdict = 'Suspected phishing attempt';
  const redFlags = ['no physical address', 'suspicious payment methods'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Insert new domain', () => {
    it('should insert new domain with report_count=1', async () => {
      // Mock checkScamDatabase - domain not found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST insert
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce({}),
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore,
        verdict,
        redFlags
      );

      expect(result.success).toBe(true);

      // Verify POST was called (second fetch call)
      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(postCall[0]).toContain('/rest/v1/scam_sites');
      expect(postCall[1].method).toBe('POST');

      const insertBody = JSON.parse(postCall[1].body);
      expect(insertBody.domain).toBe(testDomain);
      expect(insertBody.risk_level).toBe(riskLevel);
      expect(insertBody.risk_score).toBe(riskScore);
      expect(insertBody.report_count).toBe(1);
      expect(insertBody.ai_verdict).toBe(verdict);
      expect(insertBody.red_flags).toEqual(redFlags);
      expect(insertBody.safe_browsing_flagged).toBe(false);
      expect(insertBody.confirmed_scam).toBe(false);
      expect(insertBody.first_seen_at).toBeDefined();
      expect(insertBody.last_seen_at).toBeDefined();
    });

    it('should set first_seen_at and last_seen_at to current time', async () => {
      const beforeTime = new Date().toISOString();

      // Mock checkScamDatabase - domain not found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST insert
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, riskLevel, riskScore, verdict);

      const afterTime = new Date().toISOString();
      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);

      expect(insertBody.first_seen_at).toBeGreaterThanOrEqual(beforeTime);
      expect(insertBody.first_seen_at).toBeLessThanOrEqual(afterTime);
      expect(insertBody.last_seen_at).toBeGreaterThanOrEqual(beforeTime);
      expect(insertBody.last_seen_at).toBeLessThanOrEqual(afterTime);
    });

    it('should set null values for optional fields when not provided', async () => {
      // Mock checkScamDatabase - domain not found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST insert
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, riskLevel, riskScore);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);

      expect(insertBody.ai_verdict).toBeNull();
      expect(insertBody.red_flags).toBeNull();
    });
  });

  describe('Update existing domain', () => {
    it('should increment report_count for existing domain', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'medium',
        risk_score: 60,
        report_count: 5,
        ai_verdict: 'Initial verdict',
        red_flags: ['flag1'],
        domain_age_days: 30,
        trustpilot_rating: null,
        safe_browsing_flagged: false,
        first_seen_at: '2023-12-01T00:00:00Z',
        last_seen_at: '2024-01-01T00:00:00Z',
        confirmed_scam: false,
      };

      // Mock checkScamDatabase - domain found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH update
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        'low',
        40,
        'New verdict'
      );

      expect(result.success).toBe(true);

      // Verify PATCH was called (second fetch call)
      const patchCall = (global.fetch as jest.Mock).mock.calls[1];
      expect(patchCall[0]).toContain('/rest/v1/scam_sites');
      expect(patchCall[1].method).toBe('PATCH');

      const updateBody = JSON.parse(patchCall[1].body);
      expect(updateBody.report_count).toBe(6); // 5 + 1
    });

    it('should not update risk data when new score is lower', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'high',
        risk_score: 85,
        report_count: 10,
        ai_verdict: 'High risk detected',
        red_flags: ['serious flag'],
        domain_age_days: 5,
        trustpilot_rating: null,
        safe_browsing_flagged: true,
        first_seen_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-05T00:00:00Z',
        confirmed_scam: true,
      };

      // Mock checkScamDatabase - domain found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH update
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, 'low', 20, 'Lower risk verdict');

      const patchCall = (global.fetch as jest.Mock).mock.calls[1];
      const updateBody = JSON.parse(patchCall[1].body);

      // Should only have report_count and last_seen_at, no risk_level/score updates
      expect(updateBody.report_count).toBe(11);
      expect(updateBody.last_seen_at).toBeDefined();
      expect(updateBody.risk_level).toBeUndefined();
      expect(updateBody.risk_score).toBeUndefined();
      expect(updateBody.ai_verdict).toBeUndefined();
      expect(updateBody.red_flags).toBeUndefined();
    });

    it('should update risk data when new score is higher', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'medium',
        risk_score: 50,
        report_count: 3,
        ai_verdict: 'Initial verdict',
        red_flags: ['initial flag'],
        domain_age_days: 20,
        trustpilot_rating: null,
        safe_browsing_flagged: false,
        first_seen_at: '2024-01-05T00:00:00Z',
        last_seen_at: '2024-01-08T00:00:00Z',
        confirmed_scam: false,
      };

      // Mock checkScamDatabase - domain found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH update
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const newVerdict = 'More dangerous than initially thought';
      const newFlags = ['new flag 1', 'new flag 2', 'new flag 3'];

      await reportScam(
        mockEnv,
        testDomain,
        'critical',
        95,
        newVerdict,
        newFlags
      );

      const patchCall = (global.fetch as jest.Mock).mock.calls[1];
      const updateBody = JSON.parse(patchCall[1].body);

      expect(updateBody.report_count).toBe(4);
      expect(updateBody.risk_level).toBe('critical');
      expect(updateBody.risk_score).toBe(95);
      expect(updateBody.ai_verdict).toBe(newVerdict);
      expect(updateBody.red_flags).toEqual(newFlags);
      expect(updateBody.last_seen_at).toBeDefined();
    });

    it('should update when new score equals existing score', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'high',
        risk_score: 85,
        report_count: 5,
        ai_verdict: 'Original verdict',
        red_flags: ['flag'],
        domain_age_days: 10,
        trustpilot_rating: null,
        safe_browsing_flagged: true,
        first_seen_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-05T00:00:00Z',
        confirmed_scam: true,
      };

      // Mock checkScamDatabase - domain found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH update
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, 'high', 85, 'Same score');

      const patchCall = (global.fetch as jest.Mock).mock.calls[1];
      const updateBody = JSON.parse(patchCall[1].body);

      // score is equal (not greater), so risk data should not update
      expect(updateBody.report_count).toBe(6);
      expect(updateBody.risk_level).toBeUndefined();
      expect(updateBody.risk_score).toBeUndefined();
    });

    it('should handle report_count when it is 0 (edge case)', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'medium',
        risk_score: 50,
        report_count: 0,
        ai_verdict: null,
        red_flags: null,
        domain_age_days: null,
        trustpilot_rating: null,
        safe_browsing_flagged: false,
        first_seen_at: '2024-01-01T00:00:00Z',
        last_seen_at: '2024-01-01T00:00:00Z',
        confirmed_scam: false,
      };

      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, riskLevel, riskScore);

      const patchCall = (global.fetch as jest.Mock).mock.calls[1];
      const updateBody = JSON.parse(patchCall[1].body);

      expect(updateBody.report_count).toBe(1);
    });
  });

  describe('HTTP error handling', () => {
    it('should return Failure when initial check fails', async () => {
      // Mock checkScamDatabase error
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Supabase');
      }
    });

    it('should return Failure when insert fails', async () => {
      // Mock checkScamDatabase - domain not found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST insert failure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to insert');
        expect(result.error).toContain('409');
      }
    });

    it('should return Failure when update fails', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'low',
        risk_score: 20,
        report_count: 1,
        ai_verdict: null,
        red_flags: null,
        domain_age_days: null,
        trustpilot_rating: null,
        safe_browsing_flagged: false,
        first_seen_at: '2024-01-10T00:00:00Z',
        last_seen_at: '2024-01-10T00:00:00Z',
        confirmed_scam: false,
      };

      // Mock checkScamDatabase - domain found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH update failure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to update');
        expect(result.error).toContain('403');
      }
    });
  });

  describe('Request headers and content type', () => {
    it('should use correct headers for POST insert', async () => {
      // Mock checkScamDatabase - domain not found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST insert
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, riskLevel, riskScore);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const headers = postCall[1].headers;

      expect(headers.apikey).toBe('test-role-key-12345');
      expect(headers.Authorization).toBe('Bearer test-role-key-12345');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Prefer).toBe('return=minimal');
    });

    it('should use correct headers for PATCH update', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'low',
        risk_score: 20,
        report_count: 1,
        ai_verdict: null,
        red_flags: null,
        domain_age_days: null,
        trustpilot_rating: null,
        safe_browsing_flagged: false,
        first_seen_at: '2024-01-10T00:00:00Z',
        last_seen_at: '2024-01-10T00:00:00Z',
        confirmed_scam: false,
      };

      // Mock checkScamDatabase - domain found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH update
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, riskLevel, riskScore);

      const patchCall = (global.fetch as jest.Mock).mock.calls[1];
      const headers = patchCall[1].headers;

      expect(headers.apikey).toBe('test-role-key-12345');
      expect(headers.Authorization).toBe('Bearer test-role-key-12345');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Prefer).toBe('return=minimal');
    });
  });

  describe('URL construction', () => {
    it('should construct correct URL for INSERT', async () => {
      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, riskLevel, riskScore);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const url = postCall[0];

      expect(url).toBe('https://test.supabase.co/rest/v1/scam_sites');
    });

    it('should construct correct URL for PATCH with domain encoding', async () => {
      const existingScamSite: ScamSite = {
        id: '123',
        domain: testDomain,
        risk_level: 'low',
        risk_score: 20,
        report_count: 1,
        ai_verdict: null,
        red_flags: null,
        domain_age_days: null,
        trustpilot_rating: null,
        safe_browsing_flagged: false,
        first_seen_at: '2024-01-10T00:00:00Z',
        last_seen_at: '2024-01-10T00:00:00Z',
        confirmed_scam: false,
      };

      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([existingScamSite]),
      });

      // Mock PATCH
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      await reportScam(mockEnv, testDomain, riskLevel, riskScore);

      const patchCall = (global.fetch as jest.Mock).mock.calls[1];
      const url = patchCall[0];

      expect(url).toContain('https://test.supabase.co/rest/v1/scam_sites');
      expect(url).toContain(`domain=eq.${encodeURIComponent(testDomain)}`);
    });
  });

  describe('Network error handling', () => {
    it('should return Failure on network error during check', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Report error');
      }
    });

    it('should return Failure on network error during insert', async () => {
      // Mock checkScamDatabase - domain not found
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST network error
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Connection refused')
      );

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Report error');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle domain with special characters', async () => {
      const specialDomain = 'test-domain@special.co.uk';

      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(
        mockEnv,
        specialDomain,
        riskLevel,
        riskScore
      );

      expect(result.success).toBe(true);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);
      expect(insertBody.domain).toBe(specialDomain);
    });

    it('should handle very high risk score', async () => {
      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(mockEnv, testDomain, 'critical', 100);

      expect(result.success).toBe(true);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);
      expect(insertBody.risk_score).toBe(100);
    });

    it('should handle very low risk score', async () => {
      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(mockEnv, testDomain, 'low', 0);

      expect(result.success).toBe(true);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);
      expect(insertBody.risk_score).toBe(0);
    });

    it('should handle empty redFlags array', async () => {
      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore,
        verdict,
        []
      );

      expect(result.success).toBe(true);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);
      expect(insertBody.red_flags).toEqual([]);
    });

    it('should handle very long verdict text', async () => {
      const longVerdict = 'This is suspicious. '.repeat(100);

      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore,
        longVerdict
      );

      expect(result.success).toBe(true);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);
      expect(insertBody.ai_verdict).toBe(longVerdict);
    });

    it('should handle many redFlags', async () => {
      const manyFlags = Array.from({ length: 50 }, (_, i) => `Flag ${i + 1}`);

      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore,
        verdict,
        manyFlags
      );

      expect(result.success).toBe(true);

      const postCall = (global.fetch as jest.Mock).mock.calls[1];
      const insertBody = JSON.parse(postCall[1].body);
      expect(insertBody.red_flags).toHaveLength(50);
    });

    it('should return undefined data on success', async () => {
      // Mock checkScamDatabase
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValueOnce([]),
      });

      // Mock POST
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await reportScam(
        mockEnv,
        testDomain,
        riskLevel,
        riskScore
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
    });
  });
});
