module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/store/testRedis.js',
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
    testMatch: ['**/tests/**/*.test.js'],
    setupFilesAfterFramework: ['./tests/setup.js'],
    verbose: true,
};
