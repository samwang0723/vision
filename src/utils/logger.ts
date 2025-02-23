import winston from 'winston';
import { LogLevel } from '@slack/bolt';
import config from '@config/index';

interface CustomLogger extends winston.Logger {
  getLevel(): LogLevel;
  setLevel(level: LogLevel): void;
  setName(name: string): void;
}

const logger: CustomLogger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
}) as CustomLogger;

// Add getLevel and setLevel methods to make it compatible with Slack Bolt
logger.getLevel = (): LogLevel => logger.level as LogLevel;
logger.setLevel = (level: LogLevel): void => {
  logger.level = level;
  logger.transports.forEach(transport => {
    transport.level = level;
  });
};

// Add setName method to satisfy Logger interface
logger.setName = (name: string): void => {
  logger.defaultMeta = { ...logger.defaultMeta, name };
};

export default logger;
