export default {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'utils/**/*.js',
    'content/**/*.js',
    'options/**/*.js',
    '!utils/**/*.test.js',
    '!content/**/*.test.js',
    '!options/**/*.test.js'
  ],
  testMatch: ['**/*.test.js'],
  transform: {},
  coverageReporters: ['json-summary', 'text', 'lcov'],
  injectGlobals: true
};
