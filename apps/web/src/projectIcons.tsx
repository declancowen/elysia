import { HugeiconsIcon } from "@hugeicons/react";
import { lazy, Suspense, type ComponentType, type ComponentProps } from "react";
import { hugeiconAssets, hugeiconNames } from "./hugeiconNames";

export const iconNames = hugeiconNames;
export type IconName = string;

type DynamicIconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon"> & {
  name: IconName;
  fallback?: ComponentType;
};

const components = new Map<string, ReturnType<typeof createIcon>>();

function createIcon(name: string) {
  return lazy(async () => {
    const { loadIcon } = await import("@hugeicons/core-free-icons/loader");
    const asset = hugeiconAssets[name];
    const icon = await loadIcon(asset ?? "Folder01Icon");
    return {
      default: ({ name: _name, fallback: Fallback, ...props }: DynamicIconProps) =>
        !asset && Fallback ? (
          <Fallback />
        ) : (
          <HugeiconsIcon {...props} strokeWidth={2} icon={icon} />
        ),
    };
  });
}

export function DynamicIcon(props: DynamicIconProps) {
  let Icon = components.get(props.name);
  if (!Icon) {
    Icon = createIcon(props.name);
    components.set(props.name, Icon);
  }
  const Fallback = props.fallback;
  return (
    <Suspense fallback={Fallback ? <Fallback /> : null}>
      <Icon {...props} />
    </Suspense>
  );
}
