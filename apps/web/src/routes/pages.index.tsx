import { createFileRoute } from "@tanstack/react-router";
import { PagesPage } from "../components/pages/PagesPage";
export const Route = createFileRoute("/pages/")({ component: PagesPage });
