import { createFileRoute } from "@tanstack/react-router";
import { InboxView } from "./_app.inbox";

export const Route = createFileRoute("/_app/my-inbox")({
  head: () => ({ meta: [{ title: "My Inbox — Husada CRM" }] }),
  component: () => <InboxView mineOnly={true} />,
});
