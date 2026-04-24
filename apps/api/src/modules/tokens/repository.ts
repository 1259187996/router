import { and, desc, eq } from 'drizzle-orm';
import { apiTokens, logicalModels } from '../../db/schema/index.js';
import type { AppDb } from '../auth/repository.js';

export type ApiTokenRecord = typeof apiTokens.$inferSelect;

export type CreateTokenRecordInput = {
  userId: string;
  name: string;
  tokenHash: string;
  logicalModelId: string;
  budgetLimitUsd: string;
  expiresAt?: Date;
};

export class TokensRepository {
  constructor(private readonly db: AppDb) {}

  async findLogicalModelByIdAndUserId(logicalModelId: string, userId: string) {
    const [logicalModel] = await this.db
      .select()
      .from(logicalModels)
      .where(
        and(
          eq(logicalModels.id, logicalModelId),
          eq(logicalModels.userId, userId),
          eq(logicalModels.status, 'active')
        )
      )
      .limit(1);

    return logicalModel ?? null;
  }

  async findLogicalModelById(logicalModelId: string) {
    const [logicalModel] = await this.db
      .select()
      .from(logicalModels)
      .where(eq(logicalModels.id, logicalModelId))
      .limit(1);

    return logicalModel ?? null;
  }

  async createToken(input: CreateTokenRecordInput) {
    const [token] = await this.db
      .insert(apiTokens)
      .values({
        userId: input.userId,
        name: input.name,
        tokenHash: input.tokenHash,
        logicalModelId: input.logicalModelId,
        budgetLimitUsd: input.budgetLimitUsd,
        budgetUsedUsd: '0.00',
        expiresAt: input.expiresAt ?? null,
        status: 'active'
      })
      .returning();

    return token;
  }

  async listTokensByUserId(userId: string) {
    return this.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))
      .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));
  }

  async revokeTokenByIdAndUserId(tokenId: string, userId: string) {
    const [token] = await this.db
      .update(apiTokens)
      .set({
        status: 'revoked',
        updatedAt: new Date()
      })
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
      .returning();

    return token ?? null;
  }

  async findTokenByHash(tokenHash: string) {
    const [token] = await this.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, tokenHash))
      .limit(1);

    return token ?? null;
  }
}
