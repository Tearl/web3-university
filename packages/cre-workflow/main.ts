import { cre, getNetwork, Runner } from "@chainlink/cre-sdk";
import { keccak256, toHex } from "viem";
import { onCompletionRequested } from "./workflow";

export type WorkflowConfig = {
  apiBaseUrl: string;
  evms: Array<{
    completionOracleAddress: string;
    chainSelectorName: string;
    gasLimit: string;
  }>;
};

const COMPLETION_REQUESTED_SIGNATURE = "CompletionRequested(uint256,address,uint256)";

const initWorkflow = (config: WorkflowConfig) => {
  const evmConfig = config.evms[0];
  if (!evmConfig) throw new Error("Missing EVM workflow config");

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown CRE network: ${evmConfig.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [evmConfig.completionOracleAddress],
        topics: [{ values: [keccak256(toHex(COMPLETION_REQUESTED_SIGNATURE))] }],
        confidence: "CONFIDENCE_LEVEL_FINALIZED",
      }),
      onCompletionRequested,
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<WorkflowConfig>();
  await runner.run(initWorkflow);
}

void main();
