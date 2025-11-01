import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { EncryptedSurvey } from "../types";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("EncryptedSurveySepolia", function () {
  let signers: Signers;
  let surveyContract: EncryptedSurvey;
  let surveyAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This Hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("EncryptedSurvey");
      surveyAddress = deployment.address;
      surveyContract = await ethers.getContractAt("EncryptedSurvey", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("submits and decrypts a vote", async function () {
    steps = 9;
    this.timeout(4 * 40000);

    progress("Configuring survey (if needed)...");
    const currentCount = await surveyContract.optionCount().catch(() => 0n);
    if (currentCount === 0n) {
      const tx = await surveyContract
        .connect(signers.alice)
        .configureSurvey("Sepolia engagement", ["Positive", "Neutral", "Negative"]);
      await tx.wait();
    }

    progress("Encrypting vote weight '1'...");
    const encryptedVote = await fhevm
      .createEncryptedInput(surveyAddress, signers.alice.address)
      .add32(1)
      .encrypt();

    progress(
      `Submitting vote EncryptedSurvey=${surveyAddress} handle=${ethers.hexlify(encryptedVote.handles[0])} signer=${signers.alice.address}...`,
    );
    const voteTx = await surveyContract
      .connect(signers.alice)
      .submitVote(0, encryptedVote.handles[0], encryptedVote.inputProof);
    await voteTx.wait();

    progress("Fetching encrypted total...");
    const encryptedTotal = await surveyContract.getEncryptedTotal(0);
    expect(encryptedTotal).to.not.eq(ethers.ZeroHash);

    progress("Decrypting result...");
    const clearTotal = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedTotal, surveyAddress, signers.alice);
    progress(`Clear total received: ${clearTotal}`);

    expect(clearTotal).to.be.greaterThan(0);
  });
});
