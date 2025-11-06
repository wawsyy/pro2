import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { EncryptedSurvey, EncryptedSurvey__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedSurvey")) as EncryptedSurvey__factory;
  const surveyContract = (await factory.deploy()) as EncryptedSurvey;
  const surveyAddress = await surveyContract.getAddress();

  return { surveyContract, surveyAddress };
}

describe("EncryptedSurvey", function () {
  let signers: Signers;
  let surveyContract: EncryptedSurvey;
  let surveyAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This Hardhat test suite requires the local FHEVM mock.`);
      this.skip();
    }

    ({ surveyContract, surveyAddress } = await deployFixture());

    await surveyContract
      .connect(signers.deployer)
      .configureSurvey("How satisfied are you with remote work?", ["Very satisfied", "Neutral", "Not satisfied"]);
  });

  async function encryptVote(voter: HardhatEthersSigner, weight = 1) {
    return fhevm.createEncryptedInput(surveyAddress, voter.address).add32(weight).encrypt();
  }

  it("returns configured metadata", async function () {
    const labels = await surveyContract.getOptionLabels();
    expect(labels).to.deep.equal(["Very satisfied", "Neutral", "Not satisfied"]);
    expect(await surveyContract.optionCount()).to.equal(3);
    expect(await surveyContract.surveyQuestion()).to.equal("How satisfied are you with remote work?");
  });

  it("accepts encrypted votes and keeps totals hidden", async function () {
    const encryptedVote = await encryptVote(signers.alice);

    const tx = await surveyContract
      .connect(signers.alice)
      .submitVote(0, encryptedVote.handles[0], encryptedVote.inputProof);
    await tx.wait();

    const encryptedTotal = await surveyContract.getEncryptedTotal(0);
    const decrypted = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedTotal, surveyAddress, signers.deployer);

    expect(decrypted).to.equal(1);
  });

  it("prevents duplicate voting", async function () {
    const encryptedVote = await encryptVote(signers.alice);

    await surveyContract
      .connect(signers.alice)
      .submitVote(1, encryptedVote.handles[0], encryptedVote.inputProof);

    await expect(
      surveyContract.connect(signers.alice).submitVote(1, encryptedVote.handles[0], encryptedVote.inputProof),
    ).to.be.revertedWithCustomError(surveyContract, "AlreadyVoted");
  });

  it("blocks new votes once finalized", async function () {
    const encryptedVote = await encryptVote(signers.alice);

    await surveyContract
      .connect(signers.alice)
      .submitVote(2, encryptedVote.handles[0], encryptedVote.inputProof);

    await surveyContract.connect(signers.deployer).finalizeSurvey();

    const bobVote = await encryptVote(signers.bob);
    await expect(
      surveyContract.connect(signers.bob).submitVote(2, bobVote.handles[0], bobVote.inputProof),
    ).to.be.revertedWithCustomError(surveyContract, "SurveyClosed");
  });

  it("allows the owner to grant decryption rights", async function () {
    const encryptedVote = await encryptVote(signers.alice, 2);

    await surveyContract
      .connect(signers.alice)
      .submitVote(0, encryptedVote.handles[0], encryptedVote.inputProof);

    await surveyContract.connect(signers.deployer).allowResultFor(signers.bob.address, 0);

    const encryptedTotal = await surveyContract.getEncryptedTotal(0);
    const decryptedByBob = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedTotal,
      surveyAddress,
      signers.bob,
    );

    expect(decryptedByBob).to.equal(2);
  });

  it("should check if a voter has submitted", async function () {
    const encryptedVote = await encryptVote(signers.alice);

    await surveyContract
      .connect(signers.alice)
      .submitVote(0, encryptedVote.handles[0], encryptedVote.inputProof);

    const hasVoted = await surveyContract.hasVoterSubmitted(signers.alice.address);
    const hasNotVoted = await surveyContract.hasVoterSubmitted(signers.bob.address);

    expect(hasVoted).to.be.true;
    expect(hasNotVoted).to.be.false;
  });
});
