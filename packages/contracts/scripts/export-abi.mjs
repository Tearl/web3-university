import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const contractRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharedAbiRoot = resolve(contractRoot, "../shared/src/abi");
const contracts = [
  "YDToken",
  "CourseMarket",
  "CourseCertificate",
  "CompletionOracle",
  "MockUSDC",
  "TestnetSwapGateway",
];

await mkdir(sharedAbiRoot, { recursive: true });

for (const contract of contracts) {
  const source = resolve(contractRoot, `artifacts/src_${contract}_sol_${contract}.abi`);
  const target = resolve(sharedAbiRoot, `${contract}.json`);
  const abi = JSON.parse(await readFile(source, "utf8"));
  await writeFile(target, `${JSON.stringify(abi, null, 2)}\n`);
}

console.log(`Exported ${contracts.join(", ")} ABIs to packages/shared/src/abi`);
