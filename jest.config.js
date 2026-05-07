export default {
    testEnvironment: 'node',
    moduleNameMapper: {
        // Mock ioredis with ioredis-mock for all tests
        '^ioredis$': '<rootDir>/tests/__mocks__/ioredis.cjs',
    },
    transform: {},
    testMatch: ['**/tests/**/*.test.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testTimeout: 300000,
    forceExit: true,
    detectOpenHandles: true,
};
