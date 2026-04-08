# Backend Testing Guide

## Quick Start

### Prerequisites
```bash
Node.js >= 18.0.0
npm >= 8.0.0
```

### Installation
```bash
cd backend
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:ci

# Run specific test file
npm test -- stripe-webhook.test.ts
npm test -- index.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests matching a pattern
npm test -- --testNamePattern="subscription.created"
```

## Test Files

### stripe-webhook.test.ts
Located: `/backend/test/stripe-webhook.test.ts`
- **Lines**: 817
- **Test Suites**: 1
- **Test Cases**: 29
- **Coverage**: handleStripeWebhook() function

**Test Structure:**
- Missing or invalid signature (3 tests)
- subscription.created event (3 tests)
- subscription.updated event (3 tests)
- subscription.deleted event (2 tests)
- Missing userId in metadata (3 tests)
- Unknown event types (2 tests)
- Error handling (2 tests)
- Edge cases (2 tests)
- Cache TTL verification (2 tests)

**Run Only:**
```bash
npm test -- stripe-webhook.test.ts
```

### index.test.ts
Located: `/backend/test/index.test.ts`
- **Lines**: 1,445
- **Test Suites**: 1
- **Test Cases**: 56
- **Coverage**: All HTTP endpoints and request handlers

**Test Structure:**
- GET /status (3 tests)
- POST /analyze (18 tests)
- GET /scam-check (6 tests)
- POST /report (9 tests)
- POST /webhook/stripe (2 tests)
- OPTIONS preflight (2 tests)
- 404 Not Found (4 tests)
- CORS headers (5 tests)
- Authentication parsing (3 tests)
- Rate limit boundaries (2 tests)

**Run Only:**
```bash
npm test -- index.test.ts
```

## Test Coverage

### Line Coverage Target
- **Global**: 80% minimum
- **Branches**: 80% minimum
- **Functions**: 80% minimum
- **Statements**: 80% minimum

See `jest.config.js` for configuration.

## Understanding Test Failures

### Common Issues

#### 1. Module Not Found
```
Cannot find module '../src/stripe-webhook.js'
```
**Solution**: Ensure you're in the `/backend` directory and have run `npm install`

#### 2. Type Errors
```
Type 'unknown' is not assignable to type 'Env'
```
**Solution**: This is expected during type checking. Tests should still run with `npm test`

#### 3. Timeout Errors
```
Timeout - Async callback was not invoked
```
**Solution**: Check that all async functions have `await` and use `async` keyword

### Running Type Check Separately
```bash
npm run typecheck
```

## Test Organization

### Mock Hierarchy

#### stripe-webhook.test.ts
```
- crypto.subtle (for HMAC signature verification)
  - importKey()
  - sign()
- KVNamespace (USER_STATUS)
  - put()
  - get()
```

#### index.test.ts
```
- auth.js
  - validateJWT()
  - getUserStatus()
- cache.js
  - getCachedAnalysis()
  - setCachedAnalysis()
  - getRateLimit()
  - incrementRateLimit()
- analyze.js
  - analyzeWithAI()
- supabase.js
  - checkScamDatabase()
  - reportScam()
- stripe-webhook.js
  - handleStripeWebhook()
```

### beforeEach() Hooks

Each test file has a `beforeEach()` hook that:
1. Creates fresh mock environment
2. Clears all mock call history
3. Resets mock return values

This ensures test isolation.

## Debugging Tests

### Enable Verbose Output
```bash
npm test -- --verbose
```

### Run Single Test
```bash
npm test -- --testNamePattern="exact test name"
```

### Example:
```bash
npm test -- --testNamePattern="returns 200 with status=ok and timestamp"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then open `chrome://inspect` in Chrome DevTools.

## Code Coverage Report

### Generate HTML Report
```bash
npm run test:ci
```

This generates:
- `coverage/` directory with HTML report
- `coverage/coverage-summary.json` with metrics

### View HTML Report
```bash
open coverage/lcov-report/index.html
```

## Mock Verification Examples

### Verify Function Called
```typescript
expect(mockAnalyzeWithAI).toHaveBeenCalled();
```

### Verify Called With Specific Args
```typescript
expect(mockAnalyzeWithAI).toHaveBeenCalledWith(
  mockEnv,
  'example.com',
  { safeBrowsingFlagged: true }
);
```

### Verify Called Exactly N Times
```typescript
expect(mockAnalyzeWithAI).toHaveBeenCalledTimes(1);
```

### Verify Not Called
```typescript
expect(mockAnalyzeWithAI).not.toHaveBeenCalled();
```

### Verify Call Order
```typescript
expect(mockValidateJWT).toHaveBeenCalledBefore(mockGetUserStatus);
```

## Common Test Scenarios

### Testing POST Endpoints
```typescript
const request = new Request('http://localhost/endpoint', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ /* body */ }),
});

const response = await handler.fetch(request, mockEnv as Env, mockContext);
expect(response.status).toBe(200);
const data = await response.json();
```

### Testing GET Endpoints with Query Params
```typescript
const request = new Request(
  'http://localhost/endpoint?param1=value1&param2=value2',
  { method: 'GET' }
);

const response = await handler.fetch(request, mockEnv as Env, mockContext);
```

### Testing Error Responses
```typescript
mockAnalyzeWithAI.mockResolvedValue({
  success: false,
  error: 'API timeout',
});

const response = await handler.fetch(request, mockEnv as Env, mockContext);
expect(response.status).toBe(500);
const data = await response.json();
expect(data.error).toContain('timeout');
```

### Testing Protected Endpoints
```typescript
// Missing auth
const request = new Request('http://localhost/analyze', {
  method: 'POST',
  body: JSON.stringify({ domain: 'test.com', signals: {} }),
});

const response = await handler.fetch(request, mockEnv as Env, mockContext);
expect(response.status).toBe(401);
```

## CI/CD Integration

### GitHub Actions
Tests are configured to run on all branches via:
- `npm run test:ci` in CI environment
- Coverage reports are generated
- Tests must pass for PRs

### Local Pre-commit Hook (Optional)
```bash
#!/bin/bash
npm test
if [ $? -ne 0 ]; then
  echo "Tests failed"
  exit 1
fi
```

## Troubleshooting

### Clear Cache
```bash
npm test -- --clearCache
```

### Update Snapshots (if using snapshot tests)
```bash
npm test -- -u
```

### Check Jest Config
```bash
npm test -- --showConfig
```

## Performance

### Test Execution Time
- Both test files typically execute in < 5 seconds
- No network calls or external I/O
- All I/O is mocked (instant)

### Optimization Tips
- Tests should run in parallel by default
- No global state between tests (beforeEach handles this)
- Mocks are reset after each test

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [ts-jest Documentation](https://kulshekhar.github.io/ts-jest/)
- [TypeScript Testing Guide](https://www.typescriptlang.org/docs/handbook/testing.html)

## Test Categories

### Unit Tests (stripe-webhook.test.ts)
- Isolated function testing
- Mock external dependencies
- Fast execution
- High code coverage

### Integration Tests (index.test.ts)
- Full request/response cycle
- Multiple module interaction
- Mock external services
- Endpoint coverage

## Checklist for Adding New Tests

- [ ] Use descriptive test names
- [ ] Group related tests in describe() blocks
- [ ] Mock all external dependencies
- [ ] Use beforeEach() for setup
- [ ] Verify both success and error paths
- [ ] Check boundary conditions
- [ ] Test with and without authentication
- [ ] Verify CORS headers
- [ ] Check error messages are clear
- [ ] Ensure test isolation (no interdependencies)

## Contributing to Tests

When adding new features:

1. **Write tests first** (TDD)
2. **Run existing tests** to ensure no regressions
3. **Add comprehensive coverage** for new code
4. **Document test purpose** in comments
5. **Use meaningful test names**
6. **Keep tests isolated** and independent
7. **Clean up mocks** in beforeEach()

## Questions?

Refer to:
- `TEST_COVERAGE_SUMMARY.md` - Detailed test inventory
- `TEST_EXAMPLES.md` - Code examples and patterns
- Test file comments - Inline documentation
