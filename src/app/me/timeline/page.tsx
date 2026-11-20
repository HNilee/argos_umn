import { GanttTimeline } from '@/components/gantt-timeline';
import { requireMember } from '@/lib/auth';
import { getTimelineForMember } from '@/lib/queries';
import { todayInJakarta } from '@/lib/access';

export const metadata = { title: 'Timeline Saya - Member' };

export default async function MemberTimelinePage() {
  const user = await requireMember();
  // Strictly fetch only projects where this member is assigned
  const projects = await getTimelineForMember(user.memberId);
  const today = todayInJakarta();

  return (
    <div className="mx-auto max-w-7xl">
      <GanttTimeline
        projects={projects}
        isAdmin={false}
        todayDate={today}
      />
    </div>
  );
}
