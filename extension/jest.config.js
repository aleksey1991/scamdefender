export default {
  testEnvironment: 'node',
  coverageDirectory: '../coverage/extension',
  collectCoverageFrom: [
    'utils/**/*.js',
    '!utils/**/*.test.js'
  ],
  testMatch: ['**/*.test.js'],
  transform: {}
};
