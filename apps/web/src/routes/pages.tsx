import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
export const Route = createFileRoute("/pages")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    )
      throw redirect({ to: "/pair", replace: true });
  },
  validateSearch: (search: Record<string, unknown>): { create?: "page" | "folder" } =>
    search.create === "page" || search.create === "folder" ? { create: search.create } : {},
  component: Outlet,
});
