import { createFileRoute } from "@tanstack/react-router";
import { PageDetailPage } from "../components/pages/PageDetailPage";
export const Route = createFileRoute("/pages/$pageId")({ component: PageRoute });
function PageRoute() {
  const { pageId } = Route.useParams();
  return <PageDetailPage pageId={pageId} />;
}
