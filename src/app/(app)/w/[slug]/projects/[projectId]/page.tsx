import { redirect } from "next/navigation";

/** `/projects/:id` has no view of its own — send people to the board. */
export default async function ProjectIndexPage({
  params,
}: {
  params: Promise<{ slug: string; projectId: string }>;
}) {
  const { slug, projectId } = await params;
  redirect(`/w/${slug}/projects/${projectId}/board`);
}
