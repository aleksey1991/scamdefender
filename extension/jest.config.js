export default {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'utils/**/*.js',
    '!utils/**/*.test.js'
  ],
  testMatch: ['**/*.test.js'],
  transform: {},
  coverageReporters: ['json-summary', 'text', 'lcov'],
  injectGlobals: true
};
