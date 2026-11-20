import { NotificationsView } from '@/components/notifications-view';
import { requireMember } from '@/lib/auth';
import { getNotifications } from '@/lib/queries';

export const metadata = { title: 'Notifikasi Saya - Member' };

export default async function MemberNotificationsPage() {
  const user = await requireMember();
  const rawNotifications = await getNotifications(user.accountId, 50);

  const notifications = rawNotifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <NotificationsView initialNotifications={notifications} />
    </div>
  );
}
