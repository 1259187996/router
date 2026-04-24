import { createHash, randomBytes } from 'node:crypto';
import type { CreateTokenInput } from './schema.js';
import type { ApiTokenRecord } from './repository.js';
import { TokensRepository } from './repository.js';

export type BudgetStatus = 'available' | 'exhausted';

export type PublicTokenResponse = Omit<ApiTokenRecord, 'tokenHash'> & {
  budgetStatus: BudgetStatus;
  rawToken?: string;
};

export type GatewayTokenContext = Omit<ApiTokenRecord, 'tokenHash'> & {
  budgetStatus: BudgetStatus;
  logicalModelAlias: string;
};

export class TokenServiceError extends Error {
  constructor(
    readonly code: 'LOGICAL_MODEL_NOT_FOUND' | 'TOKEN_NOT_FOUND' | 'UNAUTHORIZED_GATEWAY_TOKEN'
  ) {
    super(code);
  }
}

function hashToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

function getBudgetStatus(
  token: Pick<ApiTokenRecord, 'budgetLimitUsd' | 'budgetUsedUsd' | 'status'>
): BudgetStatus {
  if (token.status === 'exhausted') {
    return 'exhausted';
  }

  return Number(token.budgetUsedUsd) >= Number(token.budgetLimitUsd) ? 'exhausted' : 'available';
}

function toPublicTokenResponse(token: ApiTokenRecord): PublicTokenResponse {
  const { tokenHash: _tokenHash, ...publicToken } = token;
  return {
    ...publicToken,
    budgetStatus: getBudgetStatus(token)
  };
}

function toGatewayTokenContext(
  token: ApiTokenRecord,
  logicalModelAlias: string
): GatewayTokenContext {
  const { tokenHash: _tokenHash, ...gatewayToken } = token;
  return {
    ...gatewayToken,
    budgetStatus: getBudgetStatus(token),
    logicalModelAlias
  };
}

export class TokenService {
  constructor(private readonly repository: TokensRepository) {}

  async createToken(userId: string, input: CreateTokenInput) {
    const logicalModel = await this.repository.findLogicalModelByIdAndUserId(
      input.logicalModelId,
      userId
    );

    if (!logicalModel) {
      throw new TokenServiceError('LOGICAL_MODEL_NOT_FOUND');
    }

    const rawToken = `rt_${randomBytes(24).toString('hex')}`;
    const token = await this.repository.createToken({
      userId,
      name: input.name,
      tokenHash: hashToken(rawToken),
      logicalModelId: input.logicalModelId,
      budgetLimitUsd: input.budgetLimitUsd,
      expiresAt: input.expiresAt
    });

    return {
      ...toPublicTokenResponse(token),
      rawToken
    };
  }

  async listTokens(userId: string) {
    const tokens = await this.repository.listTokensByUserId(userId);
    return tokens.map((token) => toPublicTokenResponse(token));
  }

  async revokeToken(userId: string, tokenId: string) {
    const token = await this.repository.revokeTokenByIdAndUserId(tokenId, userId);

    if (!token) {
      throw new TokenServiceError('TOKEN_NOT_FOUND');
    }
  }

  async requireActiveGatewayToken(rawToken: string) {
    const token = await this.repository.findTokenByHash(hashToken(rawToken));

    if (!token || token.status !== 'active') {
      throw new TokenServiceError('UNAUTHORIZED_GATEWAY_TOKEN');
    }

    if (token.expiresAt && token.expiresAt.getTime() <= Date.now()) {
      throw new TokenServiceError('UNAUTHORIZED_GATEWAY_TOKEN');
    }

    if (getBudgetStatus(token) === 'exhausted') {
      throw new TokenServiceError('UNAUTHORIZED_GATEWAY_TOKEN');
    }

    const logicalModel = await this.repository.findLogicalModelById(token.logicalModelId);

    if (!logicalModel || logicalModel.status !== 'active' || logicalModel.userId !== token.userId) {
      throw new TokenServiceError('UNAUTHORIZED_GATEWAY_TOKEN');
    }

    return toGatewayTokenContext(token, logicalModel.alias);
  }
}
