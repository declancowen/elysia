import { makeSecretProviderDefinitionRegistry } from "@elysiatools/secret-provider-core/shared/definition";
import * as OnePassword from "@elysiatools/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
