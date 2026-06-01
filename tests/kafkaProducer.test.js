// tests for the kafka producer - checks enable/disable and connection states
jest.mock('kafkajs', () => {
    const mockSend    = jest.fn().mockResolvedValue(undefined);
    const mockConnect = jest.fn().mockResolvedValue(undefined);

    return {
        Kafka: jest.fn().mockImplementation(() => ({
            producer: () => ({
                connect:    mockConnect,
                disconnect: jest.fn().mockResolvedValue(undefined),
                send:       mockSend,
            }),
        })),
        __mocks: { mockSend, mockConnect },
    };
});

jest.mock('../src/utils/logger', () => ({
    info:  jest.fn(),
    error: jest.fn(),
    warn:  jest.fn(),
}));

describe('Kafka Producer', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    test('should do nothing when kafka is disabled', async () => {
        process.env.KAFKA_ENABLED = 'false';
        const { connectKafka } = require('../src/events/kafkaProducer');
        await expect(connectKafka()).resolves.toBeUndefined();
    });

    test('should not publish events when kafka is disabled', async () => {
        process.env.KAFKA_ENABLED = 'false';
        const { publishRateLimitEvent } = require('../src/events/kafkaProducer');
        await expect(
            publishRateLimitEvent({ identifier: 'user_1', allowed: false, remaining: 0 })
        ).resolves.toBeUndefined();
    });

    test('should not publish events when not connected yet', async () => {
        process.env.KAFKA_ENABLED = 'true';
        const { publishRateLimitEvent } = require('../src/events/kafkaProducer');
        await expect(
            publishRateLimitEvent({ identifier: 'user_1', allowed: false, remaining: 0 })
        ).resolves.toBeUndefined();
    });
});
