import {
  runAtomCommand,
  squashAtomCommandFailure,
} from "@elysiatools/client-runtime/state/runtime";
import { CONNECTIONS_ENABLED, type EnvironmentId } from "@elysiatools/contracts";

import {
  ensureClientSettingsHydrated,
  getClientSettings,
  persistClientSettingsUpdate,
} from "../hooks/useSettings";
import { resolveDefaultProviderModelSelection } from "../providerInstances";
import { readProjects } from "../state/entities";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { allEnvironmentProjectSnapshotsReadyAtom } from "../state/shell";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { projectEnvironment } from "../state/projects";
import { primaryServerProvidersAtom, primaryServerSettingsAtom } from "../state/server";

// The gate and wizard can finish together. Keep successful creation across
// completion retries, even before its live project snapshot arrives.
const starterAgentCreation = new Map<EnvironmentId, Promise<void>>();

/** Finishes first-run setup after its starter agent is available. */
export async function completeOnboarding(): Promise<void> {
  await ensureClientSettingsHydrated();
  const environmentId = appAtomRegistry.get(primaryEnvironmentIdAtom);
  const providers = appAtomRegistry.get(primaryServerProvidersAtom);
  const settings = appAtomRegistry.get(primaryServerSettingsAtom);
  const projectsReady = appAtomRegistry.get(allEnvironmentProjectSnapshotsReadyAtom);
  if (!CONNECTIONS_ENABLED && getClientSettings().onboardingCompletedAt === null) {
    if (!environmentId || !projectsReady) throw new Error("The workspace is still loading.");
    if (
      !readProjects().some(
        (project) => project.environmentId === environmentId && project.agentProfile !== undefined,
      )
    ) {
      let creation = starterAgentCreation.get(environmentId);
      if (!creation) {
        creation = (async () => {
          const model = resolveDefaultProviderModelSelection(
            providers,
            settings.defaultModelSelection,
          );
          if (!model) throw new Error("Choose an available Elysia model to finish setup.");
          const result = await runAtomCommand(
            appAtomRegistry,
            projectEnvironment.createAgent,
            {
              environmentId,
              input: {
                name: "Your First Agent",
                agentProfile: {
                  title: "General assistant",
                  instructions:
                    "Help me with everyday questions, planning, writing, and project tasks. Keep replies clear and concise. Ask for clarification when needed, and take practical steps to complete requests.",
                  avatar: { preset: "square", color: "#28B4FF" },
                  notificationsEnabled: true,
                  archived: false,
                },
                defaultModelSelection: model,
                enableAgentBrowserAccess: settings.enableAgentBrowserAccess,
              },
            },
            { reportFailure: false },
          );
          if (result._tag === "Failure") throw squashAtomCommandFailure(result);
        })();
        starterAgentCreation.set(environmentId, creation);
        void creation.catch(() => {
          if (starterAgentCreation.get(environmentId) === creation) {
            starterAgentCreation.delete(environmentId);
          }
        });
      }
      await creation;
    }
  }
  const onboardingCompletedAt = new Date().toISOString();
  await persistClientSettingsUpdate((current) => ({ ...current, onboardingCompletedAt }));
}
