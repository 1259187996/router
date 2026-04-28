import { and, desc, eq } from 'drizzle-orm';
import { apiTokens, logicalModels } from '../../db/schema/index.js';
import type { AppDb } from '../auth/repository.js';
import type { UpdateTokenInput } from './schema.js';

export type ApiTokenRecord = typeof apiTokens.$inferSelect;

export type CreateTokenRecordInput = {
  userId: string;
  name: string;
  tokenHash: string;
  tokenEncrypted: string;
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
        tokenEncrypted: input.tokenEncrypted,
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

  async findTokenByIdAndUserId(tokenId: string, userId: string) {
    const [token] = await this.db
      .select()
      .from(apiTokens)
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
      .limit(1);

    return token ?? null;
  }

  async updateTokenByIdAndUserId(tokenId: string, userId: string, input: UpdateTokenInput) {
    const updateValues: Partial<typeof apiTokens.$inferInsert> = {
      updatedAt: new Date()
    };

    if (input.name !== undefined) {
      updateValues.name = input.name;
    }

    if (input.logicalModelId !== undefined) {
      updateValues.logicalModelId = input.logicalModelId;
    }

    if (input.budgetLimitUsd !== undefined) {
      updateValues.budgetLimitUsd = input.budgetLimitUsd;
    }

    if (input.expiresAt !== undefined) {
      updateValues.expiresAt = input.expiresAt;
    }

    if (input.status !== undefined) {
      updateValues.status = input.status;
    }

    const [token] = await this.db
      .update(apiTokens)
      .set(updateValues)
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
      .returning();

    return token ?? null;
  }

  async deleteTokenByIdAndUserId(tokenId: string, userId: string) {
    const [token] = await this.db
      .delete(apiTokens)
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
