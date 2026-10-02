import type { EnvironmentMachineKind } from "@t3tools/contracts";
import {
  CloudIcon,
  LaptopIcon,
  MonitorIcon,
  ServerIcon,
  HardDriveIcon,
  type LucideProps,
} from "~/icons";
import type { FunctionComponent } from "react";
import { LinuxIcon } from "./Icons";

const ICON_BY_KIND: Record<EnvironmentMachineKind, FunctionComponent<LucideProps>> = {
  server: ServerIcon,
  cloud: CloudIcon,
  linux: LinuxIcon,
  desktop: MonitorIcon,
  laptop: LaptopIcon,
  "mac-mini": HardDriveIcon,
  "mac-studio": ServerIcon,
};

export const ENVIRONMENT_MACHINE_KIND_LABELS: Record<EnvironmentMachineKind, string> = {
  server: "Server",
  cloud: "Cloud VM",
  linux: "Linux/WSL",
  desktop: "Desktop",
  laptop: "Laptop",
  "mac-mini": "Mini PC",
  "mac-studio": "Workstation",
};

export function environmentMachineIcon(
  kind: EnvironmentMachineKind,
): FunctionComponent<LucideProps> {
  return ICON_BY_KIND[kind];
}

export function EnvironmentMachineIcon({
  kind,
  ...props
}: LucideProps & { readonly kind: EnvironmentMachineKind }) {
  const Icon = ICON_BY_KIND[kind];
  return <Icon {...props} />;
}
