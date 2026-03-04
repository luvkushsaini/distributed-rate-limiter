module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/store/testRedis.js',
    ],
    coverageThreshold: {
        global: {
            branches: 40,
            functions: 35,
            lines: 50,
            statements: 50,
        },
    },
    testMatch: ['**/tests/**/*.test.js'],
    setupFilesAfterEnv: ['./tests/setup.js'],
    moduleNameMapper: {
        '^uuid$': '<rootDir>/tests/helpers/mockUuid.js',
    },
    verbose: true,
};
