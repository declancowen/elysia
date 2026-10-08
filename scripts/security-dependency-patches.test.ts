// @effect-diagnostics nodeBuiltinImport:off - exercise installed CommonJS dependencies in Node.
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";
import { it } from "vite-plus/test";

const cwd = NodeURL.fileURLToPath(new URL("..", import.meta.url));
const run = (script: string) =>
  NodeChildProcess.execFileSync(
    process.execPath,
    [
      "-e",
      String.raw`
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const dependency = createRequire(process.cwd() + '/node_modules/.pnpm/node_modules/package.json');
` + script,
    ],
    { cwd, timeout: 5_000 },
  );

it("decodes valid links and bounded malformed URI input through the CommonJS API", () => {
  run(String.raw`
const decode = dependency('decode-uri-component');
assert.equal(decode('a+b%20%C3%A5'), 'a b å');
assert.equal(decode('%E0%A4%A'), '%E0%A4%A');
assert.equal(decode('%FF%41'.repeat(10_000)), '%FFA'.repeat(10_000));
`);
});

it("rejects excessive brace and parenthesis nesting while preserving ordinary globs", () => {
  run(String.raw`
const braces = dependency('braces');
assert.deepEqual(braces.expand('src/{web,server}/{a,b}.ts'), [
  'src/web/a.ts', 'src/web/b.ts', 'src/server/a.ts', 'src/server/b.ts',
]);
for (const operation of [braces.compile, braces.expand, braces.stringify]) {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    assert.throws(() => operation(open.repeat(2_000) + 'a,b' + close.repeat(2_000)), SyntaxError);
  }
}
`);
});

it("accepts valid RSA signatures and rejects nested DigestAlgorithm padding", () => {
  run(String.raw`
const forge = dependency('node-forge');
const keys = forge.pki.rsa.generateKeyPair({ bits: 1024 });
const md = forge.md.sha256.create().update('security regression');
const digest = md.digest().getBytes();
assert.equal(keys.publicKey.verify(digest, keys.privateKey.sign(md)), true);
const { asn1 } = forge;
const node = (type, constructed, value) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
for (const parameters of [[], [node(asn1.Type.NULL, false, '')]]) {
  const algorithm = [node(asn1.Type.OID, false, asn1.oidToDer(forge.oids.sha256).getBytes()), ...parameters];
  const valid = node(asn1.Type.SEQUENCE, true, [node(asn1.Type.SEQUENCE, true, algorithm), node(asn1.Type.OCTETSTRING, false, digest)]);
  assert.equal(keys.publicKey.verify(digest, keys.privateKey.sign(asn1.toDer(valid).getBytes(), null)), true);
  valid.value[0].value.push(node(asn1.Type.NULL, false, ''), node(asn1.Type.NULL, false, ''));
  assert.throws(() => keys.publicKey.verify(digest, keys.privateKey.sign(asn1.toDer(valid).getBytes(), null)), /DigestInfo/);
}
`);
});
