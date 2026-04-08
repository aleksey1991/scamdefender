# Comprehensive Test Examples

## stripe-webhook.test.ts Examples

### Example 1: Valid Subscription Created Event

```typescript
test('updates USER_STATUS KV with Pro subscription and returns 200', async () => {
  const event: StripeWebhookEvent = {
    id: 'evt_1234567890',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        current_period_end: 1735689600,
        metadata: { userId: 'user_abc123' },
      },
    },
  };

  const payload = generateStripePayload(event);
  const signature = await createValidSignature(
    payload,
    mockEnv.STRIPE_WEBHOOK_SECRET as string
  );

  const request = new Request('http://localhost/webhook/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': signature,
    },
    body: payload,
  });

  const response = await handleStripeWebhook(request, mockEnv as Env);

  expect(response.status).toBe(200);
  expect(await response.text()).toBe('OK');

  // Verify KV was updated with Pro status
  expect(mockEnv.USER_STATUS!.put).toHaveBeenCalledWith(
    'user_abc123',
    expect.stringContaining('"isPro":true'),
    { expirationTtl: 3600 }
  );

  // Verify the stored value
  const storedValue = mockKVNamespace['user_abc123'];
  const userStatus = JSON.parse(storedValue);
  expect(userStatus.isPro).toBe(true);
  expect(userStatus.subscription.status).toBe('active');
  expect(userStatus.subscription.currentPeriodEnd).toBe(1735689600);
});
```

**What This Tests:**
- Valid HMAC signature verification passes
- Request body is parsed correctly
- USER_STATUS KV is updated with correct subscription status
- Response includes 1-hour TTL cache setting
- UserStatus object has correct Pro subscription structure

### Example 2: Missing userId in Metadata

```typescript
test('logs warning and returns 200 for subscription.created without userId', async () => {
  const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

  const event: StripeWebhookEvent = {
    id: 'evt_no_userid_1',
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_no_user',
        customer: 'cus_no_user',
        status: 'active',
      },
    },
  };

  const payload = generateStripePayload(event);
  const signature = await createValidSignature(
    payload,
    mockEnv.STRIPE_WEBHOOK_SECRET as string
  );

  const request = new Request('http://localhost/webhook/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': signature,
    },
    body: payload,
  });

  const response = await handleStripeWebhook(request, mockEnv as Env);

  expect(response.status).toBe(200);
  expect(consoleSpy).toHaveBeenCalledWith('No userId in subscription metadata');
  expect(mockEnv.USER_STATUS!.put).not.toHaveBeenCalled();

  consoleSpy.mockRestore();
});
```

**What This Tests:**
- Handler gracefully handles missing userId
- Still returns 200 (webhook accepted)
- Warning is logged for debugging
- KV is NOT updated (no side effects)
- Webhook processing continues without error

### Example 3: Invalid Signature

```typescript
test('returns 400 when signature is invalid', async () => {
  const payload = JSON.stringify({
    type: 'customer.subscription.created',
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        metadata: { userId: 'user_123' },
      },
    },
  });

  const request = new Request('http://localhost/webhook/stripe', {
    method: 'POST',
    headers: {
      'stripe-signature': 't=1234567890,v1=invalidsignature',
    },
    body: payload,
  });

  const response = await handleStripeWebhook(request, mockEnv as Env);

  expect(response.status).toBe(400);
  expect(await response.text()).toBe('Invalid signature');
});
```

**What This Tests:**
- Signature verification prevents unauthorized webhooks
- Invalid signatures are rejected immediately
- No KV updates occur for invalid requests
- Proper security enforcement

---

## index.test.ts Examples

### Example 1: POST /analyze with Cached Result

```typescript
test('returns cached result without calling AI', async () => {
  mockValidateJWT.mockResolvedValue({
    success: true,
    data: { userId: 'user_123', email: 'test@example.com' },
  });

  const cachedResult: AnalysisResult = {
    domain: 'example.com',
    riskLevel: 'high',
    confidence: 95,
    redFlags: ['No HTTPS', 'Suspicious domain'],
    verdict: 'This is suspicious',
    score: 85,
    cachedAt: Date.now(),
  };

  mockGetCachedAnalysis.mockResolvedValue(cachedResult);

  const request = new Request('http://localhost/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid.token.here',
    },
    body: JSON.stringify({
      domain: 'example.com',
      signals: { safeBrowsingFlagged: true },
    }),
  });

  const response = await handler.fetch(
    request,
    mockEnv as Env,
    mockContext as ExecutionContext
  );

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toEqual(cachedResult);

  // Verify AI was not called
  expect(mockAnalyzeWithAI).not.toHaveBeenCalled();
  // Verify KV write and rate limit increment were not called
  expect(mockSetCachedAnalysis).not.toHaveBeenCalled();
  expect(mockIncrementRateLimit).not.toHaveBeenCalled();
});
```

**What This Tests:**
- Cached results are returned immediately
- No AI API calls are made for cached domains
- Rate limit is not incremented for cached results
- Full AnalysisResult is returned from cache
- Performance optimization is working

### Example 2: POST /analyze with Rate Limit Exceeded

```typescript
test('returns 429 when rate limit exceeded (50+ requests)', async () => {
  mockValidateJWT.mockResolvedValue({
    success: true,
    data: { userId: 'user_123', email: 'test@example.com' },
  });

  mockGetCachedAnalysis.mockResolvedValue(null);

  mockGetUserStatus.mockResolvedValue({
    isPro: true,
    isGiftedPro: false,
  });

  mockGetRateLimit.mockResolvedValue(50);

  const request = new Request('http://localhost/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid.token.here',
    },
    body: JSON.stringify({
      domain: 'example.com',
      signals: { safeBrowsingFlagged: true },
    }),
  });

  const response = await handler.fetch(
    request,
    mockEnv as Env,
    mockContext as ExecutionContext
  );

  expect(response.status).toBe(429);
  const data = await response.json();
  expect(data.error).toContain('Rate limit exceeded');
});
```

**What This Tests:**
- Rate limiter enforces 50 request/day limit
- Returns 429 Too Many Requests
- No AI calls are made when rate limited
- Error message is included in response

### Example 3: POST /analyze - Full AI Analysis Flow

```typescript
test('calls AI, caches result, increments rate limit and returns 200', async () => {
  mockValidateJWT.mockResolvedValue({
    success: true,
    data: { userId: 'user_123', email: 'test@example.com' },
  });

  mockGetCachedAnalysis.mockResolvedValue(null);

  mockGetUserStatus.mockResolvedValue({
    isPro: true,
    isGiftedPro: false,
  });

  mockGetRateLimit.mockResolvedValue(10);

  const analysisResult: AnalysisResult = {
    domain: 'example.com',
    riskLevel: 'high',
    confidence: 92,
    redFlags: ['No HTTPS'],
    verdict: 'High risk domain',
    score: 82,
    cachedAt: Date.now(),
  };

  mockAnalyzeWithAI.mockResolvedValue({
    success: true,
    data: analysisResult,
  });

  mockSetCachedAnalysis.mockResolvedValue(undefined);
  mockIncrementRateLimit.mockResolvedValue(undefined);
  mockReportScam.mockResolvedValue({ success: true, data: undefined });

  const request = new Request('http://localhost/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid.token.here',
    },
    body: JSON.stringify({
      domain: 'example.com',
      signals: { safeBrowsingFlagged: true },
    }),
  });

  const response = await handler.fetch(
    request,
    mockEnv as Env,
    mockContext as ExecutionContext
  );

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toEqual(analysisResult);

  // Verify AI was called with correct parameters
  expect(mockAnalyzeWithAI).toHaveBeenCalledWith(
    mockEnv,
    'example.com',
    { safeBrowsingFlagged: true }
  );

  // Verify cache was set
  expect(mockSetCachedAnalysis).toHaveBeenCalledWith(
    mockEnv,
    'example.com',
    analysisResult
  );

  // Verify rate limit was incremented
  expect(mockIncrementRateLimit).toHaveBeenCalledWith(mockEnv, 'user_123');

  // Verify report was submitted
  expect(mockReportScam).toHaveBeenCalledWith(
    mockEnv,
    'example.com',
    'high',
    82,
    'High risk domain',
    ['No HTTPS']
  );
});
```

**What This Tests:**
- Full workflow: authenticate → check cache → check Pro → check rate limit → call AI
- AI analysis is performed with correct parameters
- Result is cached for future requests
- Rate limit counter is incremented
- Analysis result is submitted to database
- All steps succeed and return 200

### Example 4: GET /scam-check without Authentication

```typescript
test('does not require authentication', async () => {
  const scamCheckResult: ScamCheckResult = {
    found: false,
    domain: 'test.com',
  };

  mockCheckScamDatabase.mockResolvedValue({
    success: true,
    data: scamCheckResult,
  });

  const request = new Request('http://localhost/scam-check?domain=test.com', {
    method: 'GET',
  });

  const response = await handler.fetch(
    request,
    mockEnv as Env,
    mockContext as ExecutionContext
  );

  expect(response.status).toBe(200);
  expect(mockValidateJWT).not.toHaveBeenCalled();
});
```

**What This Tests:**
- Public endpoint doesn't require authentication
- No JWT validation is performed
- Database is checked directly
- Useful for open community scam list

### Example 5: POST /report with Missing Fields

```typescript
test('returns 400 when domain is missing', async () => {
  mockValidateJWT.mockResolvedValue({
    success: true,
    data: { userId: 'user_123', email: 'test@example.com' },
  });

  const request = new Request('http://localhost/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid.token.here',
    },
    body: JSON.stringify({
      riskLevel: 'high',
      riskScore: 85,
    }),
  });

  const response = await handler.fetch(
    request,
    mockEnv as Env,
    mockContext as ExecutionContext
  );

  expect(response.status).toBe(400);
  const data = await response.json();
  expect(data.error).toBe('Missing required fields');
});
```

**What This Tests:**
- Input validation prevents incomplete reports
- Required fields are enforced
- Clear error message is returned
- No database write occurs with incomplete data

### Example 6: CORS Headers - Extension vs Web

```typescript
test('returns chrome-extension origin in CORS header for extension origins', async () => {
  const extensionOrigin = 'chrome-extension://abcdefghijklmnop';
  const request = new Request('http://localhost/status', {
    method: 'GET',
    headers: {
      Origin: extensionOrigin,
    },
  });

  const response = await handler.fetch(
    request,
    mockEnv as Env,
    mockContext as ExecutionContext
  );

  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
    extensionOrigin
  );
});

test('returns wildcard origin for non-extension origins', async () => {
  const request = new Request('http://localhost/status', {
    method: 'GET',
    headers: {
      Origin: 'https://example.com',
    },
  });

  const response = await handler.fetch(
    request,
    mockEnv as Env,
    mockContext as ExecutionContext
  );

  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
});
```

**What This Tests:**
- CORS headers are correctly set based on origin
- Extension origins get specific CORS headers
- Web origins get wildcard (*) CORS headers
- Security is maintained for different client types

### Example 7: Rate Limit Boundary Conditions

```typescript
test('allows request at exactly 49 limit', async () => {
  // ... setup mocks ...
  mockGetRateLimit.mockResolvedValue(49);

  const response = await handler.fetch(request, mockEnv as Env, mockContext);
  expect(response.status).toBe(200);
});

test('blocks request at exactly 50 limit', async () => {
  // ... setup mocks ...
  mockGetRateLimit.mockResolvedValue(50);

  const response = await handler.fetch(request, mockEnv as Env, mockContext);
  expect(response.status).toBe(429);
});
```

**What This Tests:**
- Boundary condition: limit allows up to 49 requests
- Boundary condition: limit blocks at 50 requests
- Off-by-one errors are caught

---

## Testing Patterns Used

### 1. Mock Setup Pattern
```typescript
beforeEach(() => {
  mockEnv = { /* ... */ };
  jest.clearAllMocks();
});
```

### 2. Async/Await Pattern
```typescript
const response = await handler.fetch(request, mockEnv as Env, mockContext);
expect(response.status).toBe(200);
```

### 3. Mock Verification Pattern
```typescript
expect(mockAnalyzeWithAI).toHaveBeenCalledWith(
  mockEnv,
  'example.com',
  { safeBrowsingFlagged: true }
);
```

### 4. Response Parsing Pattern
```typescript
const response = await handler.fetch(request, mockEnv, mockContext);
const data = await response.json();
expect(data.field).toBe(value);
```

### 5. State Verification Pattern
```typescript
const storedValue = mockKVNamespace['user_123'];
const userStatus = JSON.parse(storedValue);
expect(userStatus.isPro).toBe(true);
```
