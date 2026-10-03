import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectsPage } from "../components/ProjectsPage";

export const Route = createFileRoute("/projects")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ProjectsPage,
});
