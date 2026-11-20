import { notFound } from 'next/navigation';
import { GanttTimeline } from '@/components/gantt-timeline';
import { requireCommittee } from '@/lib/auth';
import { getTimelineForAdmin } from '@/lib/queries';
import { todayInJakarta } from '@/lib/access';

export default async function CommitteeProjectTimelineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCommittee();
  const { id } = await params;
  const projects = await getTimelineForAdmin({ projectId: id });
  if (projects.length === 0) notFound();

  const project = projects[0];
  const today = todayInJakarta();

  return (
    <div className="mx-auto max-w-7xl">
      <GanttTimeline
        projects={[project]}
        isAdmin={true}
        todayDate={today}
        drilldownBaseUrl="/committee/timeline"
        initialSelectedProjectId={project.id}
      />
    </div>
  );
}
