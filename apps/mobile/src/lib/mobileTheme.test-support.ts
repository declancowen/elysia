import * as NodeFS from "node:fs";
import generatedVariables from "../../generated-uniwind-default-theme-variables.json";

import {
  MOBILE_THEME_VARIABLE_NAMES,
  type MobileThemeAppearance,
  type MobileThemeVariables,
} from "./mobileTheme";

export function readDefaultMobileThemeVariables(
  appearance: MobileThemeAppearance,
): MobileThemeVariables {
  const stylesheet = NodeFS.readFileSync(
    new URL("../../generated-uniwind-themes.css", import.meta.url),
    "utf8",
  );
  const variant = new RegExp(`@variant ${appearance} \\{([\\s\\S]*?)\\n    \\}`, "u").exec(
    stylesheet,
  )?.[1];
  if (variant === undefined) throw new Error(`Missing generated default ${appearance} theme.`);
  const canonical: Record<string, string> = generatedVariables[appearance];

  return Object.fromEntries(
    Array.from(variant.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/gu), ([, name, value]) => {
      const color = (value ?? "").trim();
      // CSS formatting changes hex case; preserve the native spelling only for equal colours.
      return [
        name,
        name && color.startsWith("#") && color.toLowerCase() === canonical[name]?.toLowerCase()
          ? canonical[name]
          : color,
      ];
    }).filter(([name]) =>
      MOBILE_THEME_VARIABLE_NAMES.includes(name as (typeof MOBILE_THEME_VARIABLE_NAMES)[number]),
    ),
  ) as MobileThemeVariables;
}
