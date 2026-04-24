import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { CreateUserInput, UserStatusInput } from './schema.js';
import type {
  AuthRepository,
  ChangePasswordResult,
  PublicUser,
  UpdateUserStatusResult
} from './repository.js';

const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export type AuthServiceErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'USER_ALREADY_EXISTS'
  | 'USER_NOT_FOUND'
  | 'LAST_ADMIN';

export class AuthServiceError extends Error {
  constructor(readonly code: AuthServiceErrorCode) {
    super(code);
  }
}

function hashSessionToken(rawToken: string) {
  return createHash('sha256').update(rawToken).digest('hex');
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async login(email: string, password: string) {
    const user = await this.repository.findActiveUserByEmail(email);

    if (!user) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }

    const rawToken = randomBytes(24).toString('hex');
    const sessionTokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + sessionTtlMs);
    const result = await this.repository.createSessionWithUserAuthLock(user.id, async (lockedUser) => {
      if (!(await argon2.verify(lockedUser.passwordHash, password))) {
        return null;
      }

      return {
        sessionTokenHash,
        expiresAt
      };
    });

    if (result.kind === 'invalid') {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }

    return {
      rawToken,
      expiresAt: result.expiresAt,
      user: result.user
    };
  }

  async authenticateSession(rawToken: string) {
    const sessionTokenHash = hashSessionToken(rawToken);
    const session = await this.repository.findActiveSessionByTokenHash(sessionTokenHash, new Date());

    if (!session) {
      return null;
    }

    return {
      ...session,
      sessionTokenHash
    };
  }

  async logout(rawToken: string) {
    await this.repository.deleteSessionByTokenHash(hashSessionToken(rawToken));
  }

  async createUser(input: CreateUserInput) {
    const existing = await this.repository.findUserByEmail(input.email);

    if (existing) {
      throw new AuthServiceError('USER_ALREADY_EXISTS');
    }

    const passwordHash = await argon2.hash(input.password);

    try {
      return await this.repository.createUser({
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        role: input.role
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthServiceError('USER_ALREADY_EXISTS');
      }

      throw error;
    }
  }

  async updateUserStatus(userId: string, status: UserStatusInput) {
    const result = await this.repository.updateUserStatusAndDeleteSessions(userId, status);

    this.throwIfStatusUpdateFailed(result);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const passwordHash = await argon2.hash(newPassword);
    const result = await this.repository.changePasswordAndDeleteSessionsWithUserAuthLock(
      userId,
      passwordHash,
      (user) => argon2.verify(user.passwordHash, currentPassword)
    );

    this.throwIfChangePasswordFailed(result);
  }

  private throwIfStatusUpdateFailed(result: UpdateUserStatusResult) {
    if (result.kind === 'not_found') {
      throw new AuthServiceError('USER_NOT_FOUND');
    }

    if (result.kind === 'last_admin') {
      throw new AuthServiceError('LAST_ADMIN');
    }
  }

  private throwIfChangePasswordFailed(result: ChangePasswordResult) {
    if (result.kind === 'invalid') {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }
  }
}

export type { PublicUser };
