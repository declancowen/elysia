import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";

// Utility destinations do not replace the last conversation used by Home.
// Legacy `/projects/<key>` links redirect into settings and count too.
export function isSidebarUtilityPage(pathname: string) {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/tasks" ||
    pathname === "/pages" ||
    pathname.startsWith("/pages/") ||
    pathname === "/projects" ||
    pathname === "/agents" ||
    pathname.startsWith("/projects/") ||
    pathname === "/usage" ||
    pathname === "/pull-requests"
  );
}

let mainAppHref: string | null = null;

// Mount once in the app shell. Records the latest main app URL so Back can
// return there no matter how many utility pages were visited since.
export function MainAppLocationTracker() {
  const href = useLocation({
    select: (location) => (isSidebarUtilityPage(location.pathname) ? null : location.href),
  });
  useEffect(() => {
    if (href !== null) mainAppHref = href;
  }, [href]);
  return null;
}

// Leaves a utility page for the last main app URL, or the thread list when
// the app was opened directly on a utility page.
export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return useCallback(() => navigate({ href: mainAppHref ?? "/" }), [navigate]);
}
