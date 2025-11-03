import { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

import { EncryptedSurveyABI } from "@/abi/EncryptedSurveyABI";
import { FhevmInstance } from "@/fhevm/fhevmTypes";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";

export type SurveyOptionState = {
  index: number;
  label: string;
  encryptedTotal: string;
  decryptedTotal?: bigint;
  decrypting?: boolean;
  error?: string;
};

export type UseEncryptedSurveyParams = {
  instance: FhevmInstance | undefined;
  storage: GenericStringStorage;
  ethersSigner: ethers.Signer | undefined;
  ethersProvider: ethers.ContractRunner | undefined;
  contractAddress: `0x${string}` | undefined;
  account: `0x${string}` | undefined;
};

export type UseEncryptedSurveyReturn = {
  contractAddress?: `0x${string}`;
  question: string;
  options: SurveyOptionState[];
  isConfigured: boolean;
  isFinalized: boolean;
  isOwner: boolean;
  hasVoted: boolean;
  isSubmitting: boolean;
  statusMessage: string;
  configureSurvey: (question: string, options: string[]) => Promise<void>;
  submitVote: (optionIndex: number, weight: number) => Promise<void>;
  finalizeSurvey: () => Promise<void>;
  allowResultFor: (grantee: `0x${string}`, optionIndex: number) => Promise<void>;
  decryptOption: (optionIndex: number) => Promise<void>;
};

const ZERO_HANDLE = ethers.ZeroHash;

const normalizeHandle = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") {
    return ethers.hexlify(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    try {
      const text = (value as { toString(): string }).toString();
      if (text.startsWith("0x")) {
        return text;
      }
      return ethers.hexlify(BigInt(text));
    } catch {
      return String(value);
    }
  }
  try {
    return ethers.hexlify(value as ethers.BytesLike);
  } catch {
    return ZERO_HANDLE;
  }
};

export function useEncryptedSurvey({
  instance,
  storage,
  ethersSigner,
  ethersProvider,
  contractAddress,
  account,
}: UseEncryptedSurveyParams): UseEncryptedSurveyReturn {
  const [question, setQuestion] = useState<string>("");
  const [owner, setOwner] = useState<`0x${string}` | undefined>(undefined);
  const [options, setOptions] = useState<SurveyOptionState[]>([]);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [isFinalized, setIsFinalized] = useState<boolean>(false);
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const readContract = useMemo(() => {
    if (!contractAddress || !ethersProvider) {
      return undefined;
    }
    return new ethers.Contract(contractAddress, EncryptedSurveyABI.abi, ethersProvider);
  }, [contractAddress, ethersProvider]);

  const writeContract = useMemo(() => {
    if (!contractAddress || !ethersSigner) {
      return undefined;
    }
    return new ethers.Contract(contractAddress, EncryptedSurveyABI.abi, ethersSigner);
  }, [contractAddress, ethersSigner]);

  const refreshSurvey = useCallback(async () => {
    if (!readContract) {
      setQuestion("");
      setOwner(undefined);
      setOptions([]);
      setIsConfigured(false);
      setIsFinalized(false);
      setHasVoted(false);
      return;
    }

    try {
      const [questionValue, configuredValue, finalizedValue, ownerValue] = await Promise.all([
        readContract.surveyQuestion(),
        readContract.isConfigured(),
        readContract.isFinalized(),
        readContract.owner(),
      ]);

      setQuestion(questionValue as string);
      setIsConfigured(Boolean(configuredValue));
      setIsFinalized(Boolean(finalizedValue));
      setOwner(ownerValue as `0x${string}`);

      if (account) {
        try {
          const voted = await readContract.hasVoted(account);
          setHasVoted(Boolean(voted));
        } catch {
          setHasVoted(false);
        }
      } else {
        setHasVoted(false);
      }

      if (!configuredValue) {
        setOptions([]);
        return;
      }

      try {
        const labels: string[] = await readContract.getOptionLabels();
        const optionStates: SurveyOptionState[] = await Promise.all(
          labels.map(async (label: string, index: number) => {
            const encrypted = await readContract.getEncryptedTotal(index);
            return {
              index,
              label,
              encryptedTotal: normalizeHandle(encrypted),
            };
          }),
        );
        setOptions(optionStates);
      } catch (error) {
        setStatusMessage((error as Error).message);
      }
    } catch (error) {
      setStatusMessage((error as Error).message);
    }
  }, [readContract, account]);

  useEffect(() => {
    void refreshSurvey();
  }, [refreshSurvey]);

  const isOwner = useMemo(() => {
    if (!owner || !account) {
      return false;
    }
    return owner.toLowerCase() === account.toLowerCase();
  }, [owner, account]);

  const configureSurvey = useCallback(
    async (questionText: string, optionLabels: string[]) => {
      if (!writeContract) {
        throw new Error("Please connect your wallet on the correct network.");
      }
      if (optionLabels.length < 2) {
        throw new Error("Please provide at least two options.");
      }

      setIsSubmitting(true);
      setStatusMessage("Configuring survey...");
      try {
        const tx = await writeContract.configureSurvey(questionText, optionLabels);
        await tx.wait();
        setStatusMessage("Survey configured successfully.");
        await refreshSurvey();
      } catch (error) {
        setStatusMessage((error as Error).message ?? "Unable to configure survey.");
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [writeContract, refreshSurvey],
  );

  const submitVote = useCallback(
    async (optionIndex: number, weight: number) => {
      if (!writeContract) {
        throw new Error("Please connect your wallet on the correct network.");
      }
      if (!instance) {
        throw new Error("FHE instance not ready yet.");
      }
      if (!contractAddress || !account) {
        throw new Error("Missing contract or account information.");
      }
      if (weight <= 0) {
        throw new Error("Vote weight must be greater than zero.");
      }

      setIsSubmitting(true);
      setStatusMessage("Encrypting vote...");
      try {
        const input = instance.createEncryptedInput(contractAddress, account);
        input.add32(weight);
        const encryptedVote = await input.encrypt();

        setStatusMessage("Submitting vote...");
        const tx = await writeContract.submitVote(optionIndex, encryptedVote.handles[0], encryptedVote.inputProof);
        await tx.wait();
        setStatusMessage("Vote submitted successfully.");
        await refreshSurvey();
      } catch (error) {
        setStatusMessage((error as Error).message ?? "Vote failed.");
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [writeContract, instance, contractAddress, account, refreshSurvey],
  );

  const finalizeSurvey = useCallback(async () => {
    if (!writeContract) {
      throw new Error("Please connect your wallet on the correct network.");
    }

    setIsSubmitting(true);
    setStatusMessage("Finalizing survey...");
    try {
      const tx = await writeContract.finalizeSurvey();
      await tx.wait();
      setStatusMessage("Survey finalized.");
      await refreshSurvey();
    } catch (error) {
      setStatusMessage((error as Error).message ?? "Unable to finalize survey.");
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [writeContract, refreshSurvey]);

  const allowResultFor = useCallback(
    async (grantee: `0x${string}`, optionIndex: number) => {
      if (!writeContract) {
        throw new Error("Please connect your wallet on the correct network.");
      }
      if (!ethers.isAddress(grantee)) {
        throw new Error("Invalid grantee address.");
      }

      setIsSubmitting(true);
      setStatusMessage("Granting decryption rights...");
      try {
        const tx = await writeContract.allowResultFor(grantee, optionIndex);
        await tx.wait();
        setStatusMessage("Decryption access granted.");
      } catch (error) {
        setStatusMessage((error as Error).message ?? "Unable to grant access.");
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [writeContract],
  );

  const decryptOption = useCallback(
    async (optionIndex: number) => {
      if (!instance) {
        throw new Error("FHE instance not ready yet.");
      }
      if (!contractAddress) {
        throw new Error("Contract not available.");
      }
      if (!ethersSigner) {
        throw new Error("Please connect your wallet to decrypt results.");
      }

      setOptions((prev) =>
        prev.map((option) =>
          option.index === optionIndex
            ? {
                ...option,
                decrypting: true,
                error: undefined,
              }
            : option,
        ),
      );

      const option = options.find((item) => item.index === optionIndex);
      const handle = option?.encryptedTotal ?? ZERO_HANDLE;

      if (!option || handle === ZERO_HANDLE) {
        setOptions((prev) =>
          prev.map((item) =>
            item.index === optionIndex
              ? {
                  ...item,
                  decrypting: false,
                  decryptedTotal: 0n,
                }
              : item,
          ),
        );
        return;
      }

      try {
        const signature = await FhevmDecryptionSignature.loadOrSign(instance, [contractAddress], ethersSigner, storage);
        if (!signature) {
          throw new Error("Unable to generate FHE decryption signature.");
        }

        const decrypted = await instance.userDecrypt(
          [{ handle, contractAddress }],
          signature.privateKey,
          signature.publicKey,
          signature.signature,
          signature.contractAddresses,
          signature.userAddress,
          signature.startTimestamp,
          signature.durationDays,
        );

        const clearValue = decrypted[handle];
        const bigintValue = clearValue !== undefined ? BigInt(clearValue) : 0n;

        setOptions((prev) =>
          prev.map((item) =>
            item.index === optionIndex
              ? {
                  ...item,
                  decryptedTotal: bigintValue,
                  decrypting: false,
                  error: undefined,
                }
              : item,
          ),
        );
      } catch (error) {
        setOptions((prev) =>
          prev.map((item) =>
            item.index === optionIndex
              ? {
                  ...item,
                  decrypting: false,
                  error: (error as Error).message,
                }
              : item,
          ),
        );
        throw error;
      }
    },
    [instance, contractAddress, ethersSigner, storage, options],
  );

  return {
    contractAddress,
    question,
    options,
    isConfigured,
    isFinalized,
    isOwner,
    hasVoted,
    isSubmitting,
    statusMessage,
    configureSurvey,
    submitVote,
    finalizeSurvey,
    allowResultFor,
    decryptOption,
  };
}
