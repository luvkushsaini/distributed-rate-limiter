const { Kafka } = require('kafkajs');
const logger = require('../utils/logger');

const BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const TOPIC   = process.env.KAFKA_TOPIC     || 'rate-limit-events';
const CLIENT  = process.env.KAFKA_CLIENT_ID || 'rate-limiter-service';

// lets us turn kafka off for local dev / tests
const KAFKA_ENABLED = process.env.KAFKA_ENABLED === 'true';

const kafka = new Kafka({
    clientId: CLIENT,
    brokers: BROKERS,
    retry: { retries: 3 },
});

const producer = kafka.producer();
let connected = false;

// connect to kafka when the server starts
const connectKafka = async () => {
    if (!KAFKA_ENABLED) {
        logger.info('Kafka is disabled (KAFKA_ENABLED=false) — skipping connection');
        return;
    }

    try {
        await producer.connect();
        connected = true;
        logger.info('Kafka producer connected', { brokers: BROKERS, topic: TOPIC });
    } catch (err) {
        // don't crash the server if kafka isn't running
        logger.warn('Kafka connection failed — events will not be published', {
            error: err.message,
        });
    }
};

// only publish when blocked, allowed requests are too noisy
const publishRateLimitEvent = async (eventData) => {
    if (!KAFKA_ENABLED || !connected) return;

    try {
        await producer.send({
            topic: TOPIC,
            messages: [
                {
                    key: eventData.identifier,
                    value: JSON.stringify({
                        ...eventData,
                        timestamp: Date.now(),
                    }),
                },
            ],
        });

        logger.info('Rate limit event published to Kafka', {
            identifier: eventData.identifier,
            allowed: eventData.allowed,
        });
    } catch (err) {
        logger.error('Failed to publish Kafka event', { error: err.message });
    }
};

// clean disconnect on shutdown
const disconnectKafka = async () => {
    if (connected) {
        await producer.disconnect();
        logger.info('Kafka producer disconnected');
    }
};

module.exports = { connectKafka, publishRateLimitEvent, disconnectKafka };
