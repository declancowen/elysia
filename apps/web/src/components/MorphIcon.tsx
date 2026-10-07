import type { LucideIcon, LucideProps } from "~/icons";

/** Keeps upstream stateful controls on Elysia's icon artwork. */
export function MorphIcon({ icon: Icon, ...props }: LucideProps & { icon: LucideIcon }) {
  return <Icon {...props} />;
}
