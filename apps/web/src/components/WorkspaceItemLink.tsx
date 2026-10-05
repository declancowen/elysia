import type { ComponentProps } from "react";
import { useConversationRowClick } from "../hooks/useConversationRowClick";

/** Use the same delayed single click and new-tab double click as conversation rows. */
export function WorkspaceItemLink({
  onOpen,
  ...props
}: Omit<ComponentProps<"button">, "onClick" | "onDoubleClick"> & {
  onOpen: (newTab: boolean) => void;
}) {
  const click = useConversationRowClick(
    () => onOpen(false),
    () => onOpen(true),
  );
  return <button type="button" {...props} {...click} />;
}
