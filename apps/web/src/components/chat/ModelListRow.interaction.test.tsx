vi.mock("vite-plus/test/browser", () => ({
  page: { elementLocator: () => ({}) },
  utils: { getElementLocatorSelectors: () => ({}) },
}));
import { render as renderUi } from "../../../test/render";
import { act } from "../../../test/act";
// @vitest-environment jsdom
import { useState } from "react";

import { expect, it, vi } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId } from "@elysiatools/contracts";
import { Combobox, ComboboxList, ComboboxPopup, ComboboxTrigger } from "../ui/combobox";
import { ModelListRow } from "./ModelListRow";
it.each([null, "Start a new chat to use this model"])(
  "toggles a model favorite without selecting it or closing the picker, disabled=%s",
  async (disabledReason) => {
    const selected = vi.fn();
    const model = { slug: "deepseek", name: "DeepSeek" };
    function Picker() {
      const [favorite, setFavorite] = useState(false);
      return (
        <Combobox items={["claudeAgent:deepseek"]} defaultOpen onValueChange={selected}>
          <ComboboxTrigger>Models</ComboboxTrigger>
          <ComboboxPopup>
            <ComboboxList>
              <ModelListRow
                index={0}
                slug={model.slug}
                name={model.name}
                instanceId={ProviderInstanceId.make("claudeAgent")}
                driverKind={ProviderDriverKind.make("claudeAgent")}
                providerDisplayName="Elysia"
                showProvider={false}
                isSelected={false}
                disabledReason={disabledReason}
                isFavorite={favorite}
                onToggleFavorite={() => setFavorite((value) => !value)}
              />
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>
      );
    }
    const host = document.createElement("div");
    document.body.append(host);
    await using root = await renderUi(null, { container: host, router: false });
    try {
      await act(async () => root.rerender(<Picker />));
      const star = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Add to favorites"]',
      );
      expect(star).not.toBeNull();
      await act(async () => star!.click());
      expect(document.querySelector('button[aria-label="Remove from favorites"]')).not.toBeNull();
      expect(document.querySelector('[role="listbox"]')).not.toBeNull();
      expect(selected).not.toHaveBeenCalled();
      await act(async () =>
        document
          .querySelector<HTMLButtonElement>('button[aria-label="Remove from favorites"]')!
          .click(),
      );
      expect(document.querySelector('button[aria-label="Add to favorites"]')).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
