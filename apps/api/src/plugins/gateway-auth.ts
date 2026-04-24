import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuthServiceError } from '../modules/auth/service.js';
import type { GatewayTokenContext } from '../modules/tokens/service.js';
import { TokenService, TokenServiceError } from '../modules/tokens/service.js';

function parseBearerTokenHeader(authorization: string | undefined) {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const rawToken = match[1].trim();

  return rawToken.length > 0 ? rawToken : null;
}

declare module 'fastify' {
  interface FastifyInstance {
    requireGatewayToken: (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    gatewayToken: GatewayTokenContext | null;
  }
}

export async function registerGatewayAuthPlugin(
  fastify: FastifyInstance,
  tokenService: TokenService
) {
  fastify.decorateRequest('gatewayToken', null);

  fastify.decorate('requireGatewayToken', async (request: FastifyRequest) => {
    const rawToken = parseBearerTokenHeader(request.headers.authorization);

    if (!rawToken) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }

    try {
      request.gatewayToken = await tokenService.requireActiveGatewayToken(rawToken);
    } catch (error) {
      if (error instanceof TokenServiceError && error.code === 'UNAUTHORIZED_GATEWAY_TOKEN') {
        throw new AuthServiceError('INVALID_CREDENTIALS');
      }

      throw error;
    }
  });
}
