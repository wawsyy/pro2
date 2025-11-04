import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedEncryptedSurvey = await deploy("EncryptedSurvey", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedSurvey contract deployed at: `, deployedEncryptedSurvey.address);
};
export default func;
func.id = "deploy_encrypted_survey"; // id required to prevent reexecution
func.tags = ["EncryptedSurvey"];
