import { LogsRepository } from './repository.js';

export class LogsServiceError extends Error {
  constructor(readonly code: 'LOG_NOT_FOUND') {
    super(code);
  }
}

export class LogsService {
  constructor(private readonly repository: LogsRepository) {}

  async listLogs(userId: string) {
    return this.repository.listLogsByUserId(userId);
  }

  async getLogDetail(userId: string, logId: string) {
    const detail = await this.repository.findLogDetailByIdAndUserId(userId, logId);

    if (!detail) {
      throw new LogsServiceError('LOG_NOT_FOUND');
    }

    return detail;
  }
}
