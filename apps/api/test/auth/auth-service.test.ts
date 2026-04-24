import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { AuthService, AuthServiceError } from '../../src/modules/auth/service.js';
import type { PublicUser, UserRecord } from '../../src/modules/auth/repository.js';

function buildActiveUser(passwordHash: string): UserRecord {
  const now = new Date();

  return {
    id: '4e4f3f37-0735-42d0-b9ac-f7a7c72f9ccb',
    email: 'alice@example.com',
    displayName: 'Alice',
    passwordHash,
    role: 'user',
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
}

describe('AuthService', () => {
  it('maps raced duplicate user inserts to USER_ALREADY_EXISTS', async () => {
    const repository = {
      findUserByEmail: async () => null,
      createUser: async () => {
        throw Object.assign(new Error('duplicate key value violates unique constraint'), {
          code: '23505'
        });
      }
    };
    const service = new AuthService(repository as never);

    await expect(
      service.createUser({
        email: 'alice@example.com',
        displayName: 'Alice',
        password: 'Alice123!Alice123!',
        role: 'user'
      })
    ).rejects.toMatchObject({
      code: 'USER_ALREADY_EXISTS'
    });
  });

  it('does not change the password if session invalidation fails', async () => {
    let user = buildActiveUser(await argon2.hash('Alice123!Alice123!'));
    const repository = {
      findActiveUserById: async () => user,
      changePasswordAndDeleteSessionsWithUserAuthLock: async () => {
        throw new Error('session delete failed');
      }
    };
    const service = new AuthService(repository as never);

    await expect(
      service.changePassword(user.id, 'Alice123!Alice123!', 'Alice456!Alice456!')
    ).rejects.toThrow('session delete failed');

    await expect(argon2.verify(user.passwordHash, 'Alice123!Alice123!')).resolves.toBe(true);
    await expect(argon2.verify(user.passwordHash, 'Alice456!Alice456!')).resolves.toBe(false);
  });

  it('prevents disabling the last active admin', async () => {
    const admin = {
      ...buildActiveUser(await argon2.hash('Admin123!Admin123!')),
      role: 'admin' as const
    };
    const repository = {
      findUserById: async () => admin,
      hasOtherActiveAdmin: async () => false,
      updateUserStatusAndDeleteSessions: async () => ({ kind: 'last_admin' }),
      updateUserStatus: async (): Promise<PublicUser> => {
        throw new Error('update should not run');
      }
    };
    const service = new AuthService(repository as never);

    await expect(
      service.updateUserStatus('4e4f3f37-0735-42d0-b9ac-f7a7c72f9ccb', 'disabled')
    ).rejects.toBeInstanceOf(AuthServiceError);
    await expect(
      service.updateUserStatus('4e4f3f37-0735-42d0-b9ac-f7a7c72f9ccb', 'disabled')
    ).rejects.toMatchObject({
      code: 'LAST_ADMIN'
    });
  });

  it('prevents concurrent disabling of the last two active admins', async () => {
    const passwordHash = await argon2.hash('Admin123!Admin123!');
    const admins = new Map<string, UserRecord>(
      ['admin-1', 'admin-2'].map((id) => [
        id,
        {
          ...buildActiveUser(passwordHash),
          id,
          email: `${id}@example.com`,
          displayName: id,
          role: 'admin' as const
        }
      ])
    );
    let hasOtherActiveAdminCalls = 0;
    let releaseChecks!: () => void;
    const bothChecksStarted = new Promise<void>((resolve) => {
      releaseChecks = resolve;
    });
    const repository = {
      findUserById: async (userId: string) => admins.get(userId) ?? null,
      hasOtherActiveAdmin: async (userId: string) => {
        hasOtherActiveAdminCalls += 1;

        if (hasOtherActiveAdminCalls === 2) {
          releaseChecks();
        }

        await bothChecksStarted;

        return [...admins.values()].some(
          (admin) => admin.id !== userId && admin.role === 'admin' && admin.status === 'active'
        );
      },
      updateUserStatusAndDeleteSessions: async (userId: string) => {
        const activeAdmins = [...admins.values()].filter(
          (admin) => admin.role === 'admin' && admin.status === 'active'
        );

        if (activeAdmins.length <= 1) {
          return { kind: 'last_admin' as const };
        }

        const user = admins.get(userId)!;
        const updated = {
          ...user,
          status: 'disabled' as const
        };
        admins.set(userId, updated);

        return {
          kind: 'updated' as const,
          user: updated
        };
      },
      updateUserStatus: async (userId: string, status: 'active' | 'disabled') => {
        const user = admins.get(userId);

        if (!user) {
          return null;
        }

        const updated = {
          ...user,
          status
        };
        admins.set(userId, updated);

        return updated;
      },
      deleteSessionsForUser: async () => undefined
    };
    const service = new AuthService(repository as never);

    const results = await Promise.allSettled([
      service.updateUserStatus('admin-1', 'disabled'),
      service.updateUserStatus('admin-2', 'disabled')
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: {
        code: 'LAST_ADMIN'
      }
    });
    expect([...admins.values()].filter((admin) => admin.status === 'active')).toHaveLength(1);
  });

  it('does not disable a user if session deletion fails', async () => {
    const user: UserRecord = {
      ...buildActiveUser(await argon2.hash('Alice123!Alice123!')),
      status: 'active'
    };
    const repository = {
      findUserById: async () => user,
      updateUserStatusAndDeleteSessions: async () => {
        throw new Error('session delete failed');
      },
      updateUserStatus: async (_userId: string, status: 'active' | 'disabled') => {
        user.status = status;
        return user;
      },
      deleteSessionsForUser: async () => {
        throw new Error('session delete failed');
      }
    };
    const service = new AuthService(repository as never);

    await expect(service.updateUserStatus(user.id, 'disabled')).rejects.toThrow(
      'session delete failed'
    );

    expect(user.status).toBe('active');
  });
});
