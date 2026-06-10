import { createFileRoute } from "@tanstack/react-router";
import { LeadsView } from "@/components/leads-view";

export const Route = createFileRoute("/_app/my-leads")({
  head: () => ({ meta: [{ title: "My Leads — Husada CRM" }] }),
  component: () => <LeadsView mineOnly={true} />,
});
