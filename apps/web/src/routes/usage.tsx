import { createFileRoute } from "@tanstack/react-router";

import { ElysiaUsagePage } from "../components/usage/ElysiaUsagePage";

export const Route = createFileRoute("/usage")({
  component: ElysiaUsagePage,
});
