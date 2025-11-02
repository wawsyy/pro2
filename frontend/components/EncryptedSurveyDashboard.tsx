"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient } from "wagmi";
import type { WalletClient } from "viem";
import { ethers } from "ethers";

import { EncryptedSurveyAddresses } from "@/abi/EncryptedSurveyAddresses";
import { useFhevm } from "@/fhevm/useFhevm";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { useEncryptedSurvey } from "@/hooks/useEncryptedSurvey";

const initialMockChains = { 31337: "http://localhost:8545" } as const;

function getExternalProvider(walletClient: WalletClient) {
  const transport = (walletClient.transport as unknown as { value?: unknown })?.value;
  if (transport && typeof transport === "object") {
    return transport;
  }
  if (typeof window !== "undefined") {
    return (window as unknown as { ethereum?: unknown }).ethereum;
  }
  return undefined;
}

async function walletClientToEthers(walletClient: WalletClient) {
  const external = getExternalProvider(walletClient);
  if (!external || typeof (external as { request?: unknown }).request !== "function") {
    throw new Error("Unsupported wallet transport");
  }

  const provider = new ethers.BrowserProvider(external as ethers.Eip1193Provider, walletClient.chain?.id);
  const addresses = await walletClient.getAddresses();
  const address = addresses[0];
  if (!address) {
    throw new Error("Unable to determine wallet address");
  }

  const signer = await provider.getSigner(address);
  return { provider, signer };
}

export function EncryptedSurveyDashboard() {
  const { storage } = useInMemoryStorage();
  const { address, chain, isConnected } = useAccount();
  const chainId = chain?.id;
  const { data: walletClient } = useWalletClient();

  const [ethersSigner, setEthersSigner] = useState<ethers.Signer | undefined>();
  const [ethersProvider, setEthersProvider] = useState<ethers.ContractRunner | undefined>();
  const [providerReady, setProviderReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function syncSigner() {
      if (!walletClient) {
        setEthersSigner(undefined);
        setEthersProvider(undefined);
        setProviderReady(false);
        return;
      }

      try {
        const { provider, signer } = await walletClientToEthers(walletClient);
        if (cancelled) return;
        setEthersSigner(signer);
        setEthersProvider(provider);
        setProviderReady(true);
      } catch {
        if (cancelled) return;
        setEthersSigner(undefined);
        setEthersProvider(undefined);
        setProviderReady(false);
      }
    }

    void syncSigner();

    return () => {
      cancelled = true;
    };
  }, [walletClient]);

  const eip1193Provider = useMemo(() => {
    if (!walletClient) return undefined;
    type RequestArgs = Parameters<typeof walletClient.request>[0];
    return {
      request: (args: RequestArgs) => walletClient.request(args),
    };
  }, [walletClient]);

  const {
    instance: fhevmInstance,
    status: fhevmStatus,
    error: fhevmError,
  } = useFhevm({
    provider: eip1193Provider,
    chainId,
    initialMockChains,
    enabled: Boolean(eip1193Provider),
  });

  const contractAddress = useMemo(() => {
    if (!chainId) return undefined;
    const entry = EncryptedSurveyAddresses[chainId.toString() as keyof typeof EncryptedSurveyAddresses];
    if (!entry || entry.address === "0x0000000000000000000000000000000000000000") {
      return undefined;
    }
    return entry.address as `0x${string}`;
  }, [chainId]);

  const survey = useEncryptedSurvey({
    instance: fhevmInstance,
    storage,
    ethersSigner,
    ethersProvider,
    contractAddress,
    account: address as `0x${string}` | undefined,
  });

  const [questionDraft, setQuestionDraft] = useState<string>("How satisfied are you with remote work?");
  const [optionDraft, setOptionDraft] = useState<string>("Very satisfied\nNeutral\nNot satisfied");
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [voteWeight, setVoteWeight] = useState<string>("1");
  const [granteeAddress, setGranteeAddress] = useState<string>("");
  const [grantOptionIndex, setGrantOptionIndex] = useState<number>(0);

  useEffect(() => {
    if (!survey.isConfigured) {
      setSelectedOption(null);
    }
  }, [survey.isConfigured]);

  const optionLines = useMemo(
    () =>
      optionDraft
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [optionDraft],
  );

  const showContractWarning = Boolean(chainId && !contractAddress);

  const canVote =
    isConnected &&
    survey.isConfigured &&
    !survey.hasVoted &&
    !survey.isFinalized &&
    typeof selectedOption === "number" &&
    voteWeight.trim().length > 0 &&
    !survey.isSubmitting;

  const formattedStatus = survey.statusMessage ||
    (fhevmStatus === "loading" ? "Preparing FHE runtime..." : "");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image
              src="/encrypted-survey-logo.svg"
              alt="Encrypted Survey Voting logo"
              width={56}
              height={56}
              className="h-14 w-14"
              priority
            />
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Encrypted Survey Voting</h1>
              <p className="text-sm text-slate-600">
                Privacy-first feedback collection with fully homomorphic encryption.
              </p>
            </div>
          </div>
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
            Network: {chain?.name ?? "Not connected"}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
            FHE status: {fhevmStatus}
          </span>
          {fhevmError && <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-600">{fhevmError.message}</span>}
        </div>
      </header>

      {showContractWarning && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
          <p>
            No deployed contract detected for the current network (chain ID {chainId}). Deploy the
            smart contract or switch to a supported network.
          </p>
        </div>
      )}

      {!isConnected && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-600 shadow-sm">
          <p>Use the RainbowKit button in the header to connect your wallet.</p>
        </div>
      )}

      {isConnected && !providerReady && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-600 shadow-sm">
          <p>Preparing wallet connection...</p>
        </div>
      )}

      {isConnected && providerReady && (
        <>
          <section className="grid gap-6 md:grid-cols-2">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Survey Overview</h2>
              <p className="mt-2 text-sm text-slate-600">
                {survey.isConfigured
                  ? survey.question
                  : "No survey configured yet. Owners can define the question and voting options."}
              </p>
              <dl className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between">
                  <dt>Status</dt>
                  <dd className="font-medium text-slate-900">
                    {survey.isConfigured ? (survey.isFinalized ? "Finalized" : "Active") : "Pending setup"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Your vote</dt>
                  <dd className="font-medium text-slate-900">
                    {survey.hasVoted ? "Submitted" : "Not yet"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt>Contract address</dt>
                  <dd className="font-mono text-xs text-slate-500">
                    {survey.contractAddress ?? "-"}
                  </dd>
                </div>
              </dl>
            </article>

            {survey.isOwner && !survey.isConfigured && (
              <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Configure Survey</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Define a survey question and options. Options are separated by new lines.
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await survey.configureSurvey(questionDraft.trim(), optionLines);
                  }}
                >
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Survey question
                    </label>
                    <input
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      value={questionDraft}
                      onChange={(event) => setQuestionDraft(event.target.value)}
                      placeholder="What should we ask participants?"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Options (one per line)
                    </label>
                    <textarea
                      className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus-ring-indigo-100"
                      value={optionDraft}
                      onChange={(event) => setOptionDraft(event.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={optionLines.length < 2 || survey.isSubmitting || !questionDraft.trim()}
                    className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    {survey.isSubmitting ? "Saving..." : "Publish survey"}
                  </button>
                </form>
              </article>
            )}

            {survey.isOwner && survey.isConfigured && (
              <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Owner Controls</h2>
                <div className="mt-4 space-y-4 text-sm text-slate-600">
                  <button
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={survey.isFinalized || survey.isSubmitting}
                    onClick={async () => {
                      await survey.finalizeSurvey();
                    }}
                  >
                    {survey.isFinalized ? "Survey finalized" : survey.isSubmitting ? "Finalising..." : "Finalize survey"}
                  </button>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-semibold text-slate-800">Grant result access</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Allow a collaborator to decrypt the total for a specific option.
                    </p>
                    <div className="mt-3 space-y-2">
                      <input
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-700 focus:border-indigo-300 focus:outline-none"
                        placeholder="0x..."
                        value={granteeAddress}
                        onChange={(event) => setGranteeAddress(event.target.value)}
                      />
                      <select
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-indigo-300 focus:outline-none"
                        value={grantOptionIndex}
                        onChange={(event) => setGrantOptionIndex(Number(event.target.value))}
                      >
                        {survey.options.map((option) => (
                          <option key={option.index} value={option.index}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="w-full rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={!ethers.isAddress(granteeAddress) || survey.isSubmitting}
                        onClick={async () => {
                          await survey.allowResultFor(granteeAddress as `0x${string}`, grantOptionIndex);
                        }}
                      >
                        {survey.isSubmitting ? "Granting..." : "Grant access"}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            )}

            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Cast Your Vote</h2>
              {survey.isConfigured ? (
                <form
                  className="mt-4 space-y-3 text-sm text-slate-600"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (typeof selectedOption === "number") {
                      await survey.submitVote(selectedOption, Number(voteWeight || "1"));
                    }
                  }}
                >
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Select one option
                    </legend>
                    {survey.options.map((option) => (
                      <label key={option.index} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="survey-option"
                            value={option.index}
                            checked={selectedOption === option.index}
                            onChange={() => setSelectedOption(option.index)}
                            disabled={survey.hasVoted || survey.isFinalized}
                            className="h-4 w-4"
                          />
                          <span className="text-slate-800">{option.label}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-400">{option.encryptedTotal.slice(0, 10)}...</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Vote weight
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={voteWeight}
                      onChange={(event) => setVoteWeight(event.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!canVote}
                    className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    {survey.hasVoted ? "Vote submitted" : survey.isSubmitting ? "Submitting..." : "Submit encrypted vote"}
                  </button>
                </form>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  Waiting on the owner to configure the survey.
                </p>
              )}
            </article>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Encrypted Results</h2>
            <p className="mt-2 text-sm text-slate-600">
              Totals remain encrypted on-chain. Authorised users can decrypt locally once the survey is finalised or access is granted.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {survey.options.map((option) => (
                <div key={option.index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-semibold text-slate-800">{option.label}</h3>
                  <p className="mt-2 text-xs font-mono text-slate-500 break-all">
                    {option.encryptedTotal}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">
                      {option.decryptedTotal !== undefined ? `${option.decryptedTotal.toString()} votes` : "Hidden"}
                    </span>
                    <button
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                      onClick={async () => {
                        await survey.decryptOption(option.index);
                      }}
                      disabled={option.decrypting || survey.isSubmitting || !survey.isOwner}
                    >
                      {option.decrypting ? "Decrypting..." : "Decrypt"}
                    </button>
                  </div>
                  {option.error && <p className="mt-2 text-xs text-rose-500">{option.error}</p>}
                </div>
              ))}
              {survey.options.length === 0 && (
                <p className="text-sm text-slate-500">No options available yet.</p>
              )}
            </div>
          </section>
        </>
      )}

      {formattedStatus && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-700">
          {formattedStatus}
        </div>
      )}
    </div>
  );
}
