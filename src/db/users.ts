import crypto from 'crypto';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';
import { hashPassword, verifyPassword } from '../lib/authCrypto.ts';

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function sanitizeUser(row: typeof users.$inferSelect) {
  const { passwordHash: _ph, ...safe } = row;
  return safe;
}

export async function getUserByUid(uid: string) {
  const [row] = await db.select().from(users).where(eq(users.uid, uid));
  return row ? sanitizeUser(row) : null;
}

export async function signupWithCredentials(input: {
  username: string;
  email: string;
  password: string;
}) {
  const username = String(input.username || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');

  if (username.length < 2) {
    throw new AuthError('Username must be at least 2 characters.', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('Please enter a valid Email ID.', 400);
  }
  if (password.length < 6) {
    throw new AuthError('Password must be at least 6 characters.', 400);
  }

  const [existingEmail] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);

  if (existingEmail && existingEmail.passwordHash) {
    throw new AuthError('An account with this Email ID already exists. Duplicate Email ID is not allowed.', 409);
  }

  const [existingUsername] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`);

  if (existingUsername && existingUsername.id !== existingEmail?.id) {
    throw new AuthError('This Username is already taken. Please choose another username.', 409);
  }

  const passwordedUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.passwordHash));
  const isFirstAccount = passwordedUsers.length === 0;

  const pwHash = hashPassword(password);
  const role = isFirstAccount ? 'Admin' : 'Accountant';
  const perms = isFirstAccount
    ? {
        menus: {
          dashboard: 'edit' as const,
          vendors: 'edit' as const,
          orders: 'edit' as const,
          vouchers: 'edit' as const,
          bills: 'edit' as const,
          inventory: 'edit' as const,
          gst: 'edit' as const,
          accounts: 'edit' as const,
          backup: 'edit' as const,
          setup: 'edit' as const,
        },
        options: { delete: true, export: true },
      }
    : {
        menus: {
          dashboard: 'view' as const,
          vendors: 'edit' as const,
          orders: 'edit' as const,
          vouchers: 'edit' as const,
          bills: 'edit' as const,
          inventory: 'edit' as const,
          gst: 'view' as const,
          accounts: 'view' as const,
          backup: 'view' as const,
          setup: 'none' as const,
        },
        options: { delete: false, export: true },
      };

  // Claim legacy passwordless record matching the same email if present
  if (existingEmail && !existingEmail.passwordHash) {
    const [updated] = await db
      .update(users)
      .set({
        username,
        name: username,
        email,
        passwordHash: pwHash,
        role: isFirstAccount ? 'Admin' : existingEmail.role,
        active: true,
        perms,
        lastLogin: new Date(),
      })
      .where(eq(users.id, existingEmail.id))
      .returning();
    return sanitizeUser(updated);
  }

  const uid = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const [inserted] = await db
    .insert(users)
    .values({
      uid,
      username,
      email,
      name: username,
      passwordHash: pwHash,
      role,
      active: true,
      perms,
      lastLogin: new Date(),
    })
    .returning();

  return sanitizeUser(inserted);
}

export async function loginWithCredentials(input: {
  username: string;
  email: string;
  password: string;
}) {
  const username = String(input.username || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');

  if (!username || !email || !password) {
    throw new AuthError('Username, Email ID, and Password are required.', 400);
  }

  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);

  if (!row || !row.passwordHash) {
    throw new AuthError('Invalid username, email ID, or password.', 401);
  }

  const storedUsername = String(row.username || row.name || '').trim().toLowerCase();
  if (storedUsername !== username.toLowerCase()) {
    throw new AuthError('Invalid username, email ID, or password.', 401);
  }

  if (!verifyPassword(password, row.passwordHash)) {
    throw new AuthError('Invalid username, email ID, or password.', 401);
  }

  if (!row.active) {
    throw new AuthError('Account is disabled. Contact the Administrator.', 403);
  }

  const [updated] = await db
    .update(users)
    .set({ lastLogin: new Date() })
    .where(eq(users.id, row.id))
    .returning();

  return sanitizeUser(updated);
}

export async function listUsers() {
  try {
    const rows = await db.select().from(users);
    return rows.map(sanitizeUser);
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load users.', { cause: error });
  }
}

export async function updateUserPermissions(
  id: number,
  data: {
    name?: string;
    role?: string;
    active?: boolean;
    perms?: {
      menus: Record<string, 'none' | 'view' | 'edit'>;
      options: { delete: boolean; export: boolean };
    };
    companyIds?: number[] | null;
  }
) {
  try {
    const [updated] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updated ? sanitizeUser(updated) : null;
  } catch (error) {
    console.error('Failed to update user permissions:', error);
    throw new Error('Failed to update user permissions.', { cause: error });
  }
}

export async function resetUserPassword(id: number, newPassword: string) {
  if (String(newPassword || '').length < 6) {
    throw new AuthError('New password must be at least 6 characters.', 400);
  }
  const [updated] = await db
    .update(users)
    .set({ passwordHash: hashPassword(newPassword) })
    .where(eq(users.id, id))
    .returning();
  return updated ? sanitizeUser(updated) : null;
}
