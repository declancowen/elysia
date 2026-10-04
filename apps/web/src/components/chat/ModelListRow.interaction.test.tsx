// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
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
                model={model}
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
    const root = createRoot(host);
    try {
      await act(async () => root.render(<Picker />));
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
