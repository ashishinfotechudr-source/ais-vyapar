import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, name?: string) {
  try {
    const existing = await db.select().from(users).where(eq(users.uid, uid));
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({ email, lastLogin: new Date(), ...(name ? { name } : {}) })
        .where(eq(users.uid, uid))
        .returning();
      return updated[0];
    }

    const allUsers = await db.select().from(users);
    const isFirstUser = allUsers.length === 0;

    const inserted = await db
      .insert(users)
      .values({
        uid,
        email,
        name: name || email.split('@')[0],
        role: isFirstUser ? 'Admin' : 'Admin',
        active: true,
        lastLogin: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email, lastLogin: new Date() },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function listUsers() {
  try {
    return await db.select().from(users);
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
    const updated = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updated[0] || null;
  } catch (error) {
    console.error('Failed to update user permissions:', error);
    throw new Error('Failed to update user permissions.', { cause: error });
  }
}
