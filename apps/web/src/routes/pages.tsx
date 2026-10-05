import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/pages")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    )
      throw redirect({ to: "/pair", replace: true });
  },
  component: Outlet,
});
