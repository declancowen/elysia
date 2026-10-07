import type { ComponentProps, MouseEvent } from "react";
import { useConversationRowClick } from "../../hooks/useConversationRowClick";

/** Card padding opens the item; controls and the keyboard-accessible title own their clicks. */
export function PagesPageItemRow({
  onOpen,
  ...props
}: Omit<ComponentProps<"div">, "onClick" | "onDoubleClick"> & {
  onOpen: (newTab: boolean) => void;
}) {
  const clicks = useConversationRowClick(
    () => onOpen(false),
    () => onOpen(true),
  );
  const isControl = (event: MouseEvent) =>
    event.target instanceof Element &&
    event.target.closest(
      'button, a, input, select, textarea, [role="button"], [role="checkbox"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
    );
  return (
    <div
      {...props}
      onClick={(event) => {
        if (!isControl(event)) clicks.onClick(event);
      }}
      onDoubleClick={(event) => {
        if (!isControl(event)) clicks.onDoubleClick(event);
      }}
    />
  );
}
