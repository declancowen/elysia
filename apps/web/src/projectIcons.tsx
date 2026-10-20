import { HugeiconsIcon } from "@hugeicons/react";
import { use, Suspense, type ComponentType, type ComponentProps } from "react";
import { hugeiconAssets, hugeiconNames } from "./hugeiconNames";

export const iconNames = hugeiconNames;
export type IconName = string;

type DynamicIconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon"> & {
  name: IconName;
  fallback?: ComponentType;
};

const icons = new Map<string, Promise<ComponentProps<typeof HugeiconsIcon>["icon"]>>();

function loadIconAsset(name: string) {
  let pending = icons.get(name);
  if (!pending) {
    pending = import("@hugeicons/core-free-icons/loader").then(({ loadIcon }) =>
      loadIcon(hugeiconAssets[name] ?? "Folder01Icon"),
    );
    icons.set(name, pending);
  }
  return pending;
}

function LoadedIcon({ name, fallback: Fallback, ...props }: DynamicIconProps) {
  const icon = use(loadIconAsset(name));
  return !hugeiconAssets[name] && Fallback ? (
    <Fallback />
  ) : (
    <HugeiconsIcon {...props} strokeWidth={2} icon={icon} />
  );
}

export function DynamicIcon(props: DynamicIconProps) {
  const Fallback = props.fallback;
  return (
    <Suspense fallback={Fallback ? <Fallback /> : null}>
      <LoadedIcon {...props} />
    </Suspense>
  );
}
