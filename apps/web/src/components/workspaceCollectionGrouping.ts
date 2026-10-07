import { create } from "zustand";
import type {
  CollectionView,
  CollectionProperty,
  CollectionCardSize,
} from "./WorkspaceCollectionView";
import type { TaskGrouping } from "./tasks/taskViews";

// Collections and their navigation previews use the same session grouping preferences.
export const useWorkspaceCollectionGrouping = create<{
  tasks: TaskGrouping;
  taskSubgroups: TaskGrouping;
  pages: "project" | "type" | "none";
  pageSubgroups: "project" | "type" | "none";
  pageView: CollectionView;
  pageCardSize: CollectionCardSize;
  pageProperties: CollectionProperty[];
  pageSort: "updated" | "created" | "title";
  pageGroupDescending: boolean;
  pageHideEmpty: boolean;
}>(() => ({
  tasks: "status",
  taskSubgroups: "none",
  pages: "project",
  pageSubgroups: "none",
  pageView: "list",
  pageCardSize: "medium",
  pageProperties: ["project"],
  pageSort: "updated",
  pageGroupDescending: false,
  pageHideEmpty: true,
}));
