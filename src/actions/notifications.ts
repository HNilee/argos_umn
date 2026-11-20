'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { requireAccount } from '@/lib/auth';
import type { ActionResult } from './types';

const uuid = z.string().uuid();

export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const user = await requireAccount();
  const parsed = uuid.safeParse(notificationId);
  if (!parsed.success) return { error: 'common.invalid' };

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, parsed.data), eq(notifications.recipientAccountId, user.accountId)));

  revalidatePath('/committee');
  revalidatePath('/me');
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await requireAccount();

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.recipientAccountId, user.accountId), eq(notifications.isRead, false)));

  revalidatePath('/committee');
  revalidatePath('/me');
  return { ok: true };
}

export async function createNotification(
  recipientAccountId: string,
  type: 'timeline_request' | 'timeline_decision' | 'general',
  title: string,
  body: string,
  link?: string | null,
) {
  await db.insert(notifications).values({
    recipientAccountId,
    type,
    title,
    body,
    link: link || null,
    isRead: false,
  });
}
