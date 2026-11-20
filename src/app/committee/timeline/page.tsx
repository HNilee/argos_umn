import { GanttTimeline } from '@/components/gantt-timeline';
import { requireCommittee } from '@/lib/auth';
import { getTimelineForAdmin } from '@/lib/queries';
import { todayInJakarta } from '@/lib/access';

export const metadata = { title: 'Timeline - Admin' };

export default async function CommitteeTimelinePage() {
  await requireCommittee();
  const projects = await getTimelineForAdmin();
  const today = todayInJakarta();

  return (
    <div className="mx-auto max-w-7xl">
      <GanttTimeline
        projects={projects}
        isAdmin={true}
        todayDate={today}
        drilldownBaseUrl="/committee/timeline"
      />
    </div>
  );
}
