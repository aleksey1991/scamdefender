export default {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'utils/**/*.js',
    'content/**/*.js',
    '!utils/**/*.test.js',
    '!content/**/*.test.js'
  ],
  testMatch: ['**/*.test.js'],
  transform: {},
  coverageReporters: ['json-summary', 'text', 'lcov'],
  injectGlobals: true
};
