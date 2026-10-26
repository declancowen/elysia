import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_chat/settings/connections")({
  beforeLoad: () => {
    throw redirect({
      to: "/settings/general",
    });
  },
});
