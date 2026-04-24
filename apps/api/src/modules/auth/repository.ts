import { and, eq, gt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as dbSchema from '../../db/schema/index.js';
import { userSessions, users } from '../../db/schema/index.js';

export type AppDb = NodePgDatabase<typeof dbSchema>;
export type UserRecord = typeof users.$inferSelect;
export type PublicUser = Omit<UserRecord, 'passwordHash'>;
export type UserRole = PublicUser['role'];
export type UserStatus = PublicUser['status'];

export type CreateUserRecord = {
  email: string;
  displayName: string;
  passwordHash: string;
  role: UserRole;
};

export type UpdateUserStatusResult =
  | {
      kind: 'updated';
      user: PublicUser;
    }
  | {
      kind: 'not_found';
    }
  | {
      kind: 'last_admin';
    };

export type CreateLockedSessionInput = {
  sessionTokenHash: string;
  expiresAt: Date;
};

export type CreateLockedSessionResult =
  | {
      kind: 'authenticated';
      user: PublicUser;
      expiresAt: Date;
    }
  | {
      kind: 'invalid';
    };

export type ChangePasswordResult =
  | {
      kind: 'updated';
    }
  | {
      kind: 'invalid';
    };

function toPublicUser(user: UserRecord): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export class AuthRepository {
  constructor(private readonly db: AppDb) {}

  async findUserByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async findUserById(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ?? null;
  }

  async findActiveUserByEmail(email: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.status, 'active')))
      .limit(1);

    return user ?? null;
  }

  async findActiveUserById(userId: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .limit(1);

    return user ?? null;
  }

  async createUser(input: CreateUserRecord) {
    const [user] = await this.db
      .insert(users)
      .values({
        ...input,
        status: 'active'
      })
      .returning();

    return toPublicUser(user);
  }

  async updateUserPasswordHash(userId: string, passwordHash: string) {
    await this.db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async changePasswordAndDeleteSessions(userId: string, passwordHash: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      await tx.delete(userSessions).where(eq(userSessions.userId, userId));
    });
  }

  async changePasswordAndDeleteSessionsWithUserAuthLock(
    userId: string,
    passwordHash: string,
    verifyCurrentPassword: (user: UserRecord) => Promise<boolean>
  ): Promise<ChangePasswordResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${this.buildUserAuthLockKey(userId)}))`);

      const [user] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.status, 'active')))
        .limit(1);

      if (!user || !(await verifyCurrentPassword(user))) {
        return { kind: 'invalid' };
      }

      await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      await tx.delete(userSessions).where(eq(userSessions.userId, userId));

      return { kind: 'updated' };
    });
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    const [user] = await this.db
      .update(users)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    return user ? toPublicUser(user) : null;
  }

  async updateUserStatusAndDeleteSessions(
    userId: string,
    status: UserStatus
  ): Promise<UpdateUserStatusResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${this.buildUserAuthLockKey(userId)}))`);

      const [existingUser] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);

      if (!existingUser) {
        return { kind: 'not_found' };
      }

      if (status === 'disabled' && existingUser.role === 'admin' && existingUser.status === 'active') {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('router_auth_admin_status'))`);

        const activeAdmins = await tx
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.role, 'admin'), eq(users.status, 'active')))
          .limit(2);

        if (activeAdmins.length <= 1) {
          return { kind: 'last_admin' };
        }
      }

      const [updatedUser] = await tx
        .update(users)
        .set({
          status,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId))
        .returning();

      if (status === 'disabled') {
        await tx.delete(userSessions).where(eq(userSessions.userId, userId));
      }

      return {
        kind: 'updated',
        user: toPublicUser(updatedUser)
      };
    });
  }

  async createSession(userId: string, sessionTokenHash: string, expiresAt: Date) {
    await this.db.insert(userSessions).values({
      userId,
      sessionTokenHash,
      expiresAt
    });
  }

  async createSessionWithUserAuthLock(
    userId: string,
    buildSession: (user: UserRecord) => Promise<CreateLockedSessionInput | null>
  ): Promise<CreateLockedSessionResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${this.buildUserAuthLockKey(userId)}))`);

      const [user] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.status, 'active')))
        .limit(1);

      if (!user) {
        return { kind: 'invalid' };
      }

      const session = await buildSession(user);

      if (!session) {
        return { kind: 'invalid' };
      }

      await tx.insert(userSessions).values({
        userId,
        sessionTokenHash: session.sessionTokenHash,
        expiresAt: session.expiresAt
      });

      return {
        kind: 'authenticated',
        user: toPublicUser(user),
        expiresAt: session.expiresAt
      };
    });
  }

  async findActiveSessionByTokenHash(sessionTokenHash: string, now: Date) {
    const [row] = await this.db
      .select({
        session: userSessions,
        user: users
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(
        and(
          eq(userSessions.sessionTokenHash, sessionTokenHash),
          gt(userSessions.expiresAt, now),
          eq(users.status, 'active')
        )
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      session: row.session,
      user: toPublicUser(row.user)
    };
  }

  async deleteSessionByTokenHash(sessionTokenHash: string) {
    await this.db.delete(userSessions).where(eq(userSessions.sessionTokenHash, sessionTokenHash));
  }

  async deleteSessionsForUser(userId: string) {
    await this.db.delete(userSessions).where(eq(userSessions.userId, userId));
  }

  private buildUserAuthLockKey(userId: string) {
    return `router_auth_user:${userId}`;
  }
}
