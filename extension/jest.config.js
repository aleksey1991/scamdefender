module.exports = {
  testEnvironment: 'node',
  coverageDirectory: '../coverage/extension',
  collectCoverageFrom: [
    'utils/**/*.js',
    'background/**/*.js',
    'popup/**/*.js'
  ],
  testMatch: ['**/*.test.js']
};
