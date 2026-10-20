#!/usr/bin/env node
process.stderr.write(
  "Elysia does not publish packages under the legacy npm identities. Use https://github.com/declancowen/elysia/releases/latest\n",
);
process.exitCode = 1;
