import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(root, "../..");
const deploymentPath = resolve(workspaceRoot, "packages/contracts/deployments/sepolia.json");
const deployment = JSON.parse(readFileSync(deploymentPath, "utf8"));

if (deployment.chainId !== 11155111 || deployment.network !== "sepolia") {
  throw new Error("Expected the Sepolia deployment manifest");
}

const sources = {
  CourseMarket: deployment.deployments?.CourseMarket,
  CourseCertificate: deployment.deployments?.CourseCertificate,
};
for (const [name, source] of Object.entries(sources)) {
  if (!source?.address || !Number.isInteger(source.blockNumber) || source.blockNumber <= 0) {
    throw new Error(`${name} address/start block is missing from Sepolia manifest`);
  }
  copyFileSync(
    resolve(workspaceRoot, `packages/shared/src/abi/${name}.json`),
    resolve(root, `abis/${name}.json`),
  );
}

const networks = {
  sepolia: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, {
    address: source.address,
    startBlock: source.blockNumber,
  }])),
  anvil: {
    CourseMarket: { address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", startBlock: 0 },
    CourseCertificate: { address: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", startBlock: 0 },
  },
};
writeFileSync(resolve(root, "networks.json"), `${JSON.stringify(networks, null, 2)}\n`);

let manifest = readFileSync(resolve(root, "subgraph.yaml"), "utf8");
for (const [name, source] of Object.entries(sources)) {
  const marker = `    name: ${name}`;
  const start = manifest.indexOf(marker);
  if (start < 0) throw new Error(`${name} data source is missing from subgraph.yaml`);
  const next = manifest.indexOf("  - kind: ethereum", start + marker.length);
  const end = next < 0 ? manifest.length : next;
  const before = manifest.slice(0, start);
  const section = manifest.slice(start, end)
    .replace(/address: "0x[a-fA-F0-9]{40}"/, `address: "${source.address}"`)
    .replace(/startBlock: \d+/, `startBlock: ${source.blockNumber}`);
  manifest = before + section + manifest.slice(end);
}
writeFileSync(resolve(root, "subgraph.yaml"), manifest);
console.log("Synced Subgraph ABIs, Sepolia addresses, and deployment blocks from manifest");
