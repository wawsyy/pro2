// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Encrypted Survey Voting
/// @notice Enables privacy-preserving survey voting with fully homomorphic encryption.
contract EncryptedSurvey is SepoliaConfig {
    /// @dev Metadata describing an encrypted survey option.
    struct SurveyOption {
        string label;
        euint32 encryptedTotal;
    }

    /// @notice Thrown when attempting to interact with an unconfigured survey.
    error SurveyNotConfigured();

    /// @notice Thrown when a caller already submitted a vote.
    error AlreadyVoted();

    /// @notice Thrown when an invalid option is accessed.
    error InvalidOption();

    /// @notice Thrown when a non-owner tries to call an owner-only function.
    error NotOwner();

    /// @notice Thrown when attempting to vote after the survey is closed.
    error SurveyClosed();

    /// @notice Emitted when the survey is configured.
    event SurveyConfigured(string indexed question, string[] options);

    /// @notice Emitted whenever a voter submits an encrypted vote.
    event VoteSubmitted(address indexed voter, uint256 optionIndex);

    /// @notice Emitted when the survey is closed by the owner.
    event SurveyFinalized(address indexed owner);

    /// @notice Emitted when the owner allows an address to decrypt the result of an option.
    event ResultAccessGranted(address indexed grantee, uint256 indexed optionIndex);

    address public immutable owner;
    string public surveyQuestion;
    SurveyOption[] private _options;
    bool public isConfigured;
    bool public isFinalized;
    mapping(address => bool) public hasVoted;

    constructor() {
        owner = msg.sender;
    }

    /// @notice Configures the survey question and options. Callable only once by the owner.
    /// @param question The survey question to display.
    /// @param optionLabels A non-empty list of option labels (minimum two).
    function configureSurvey(string calldata question, string[] calldata optionLabels) external {
        if (msg.sender != owner) revert NotOwner();
        if (isConfigured) revert SurveyClosed();
        if (optionLabels.length < 2) revert InvalidOption();

        surveyQuestion = question;
        delete _options;

        for (uint256 i = 0; i < optionLabels.length; i++) {
            SurveyOption memory option;
            option.label = optionLabels[i];
            _options.push(option);
        }

        isConfigured = true;
        isFinalized = false;

        emit SurveyConfigured(question, optionLabels);
    }

    /// @notice Submits an encrypted vote for a specific option.
    /// @param optionIndex Index of the option to vote for.
    /// @param encryptedVote The encrypted vote value (typically 1).
    /// @param inputProof The proof associated with the encrypted vote.
    function submitVote(
        uint256 optionIndex,
        externalEuint32 encryptedVote,
        bytes calldata inputProof
    ) external {
        if (!isConfigured) revert SurveyNotConfigured();
        if (isFinalized) revert SurveyClosed();
        if (hasVoted[msg.sender]) revert AlreadyVoted();
        if (optionIndex >= _options.length) revert InvalidOption();

        SurveyOption storage option = _options[optionIndex];

        euint32 voteValue = FHE.fromExternal(encryptedVote, inputProof);
        option.encryptedTotal = FHE.add(option.encryptedTotal, voteValue);

        hasVoted[msg.sender] = true;

        FHE.allowThis(option.encryptedTotal);
        FHE.allow(option.encryptedTotal, owner);

        emit VoteSubmitted(msg.sender, optionIndex);
    }

    /// @notice Finalizes the survey, preventing additional votes.
    function finalizeSurvey() external {
        if (msg.sender != owner) revert NotOwner();
        if (!isConfigured) revert SurveyNotConfigured();
        if (isFinalized) revert SurveyClosed();

        isFinalized = true;

        emit SurveyFinalized(msg.sender);
    }

    /// @notice Grants decryption access for a particular option to an address.
    /// @param grantee The address that should be able to decrypt the option results.
    /// @param optionIndex The index of the option.
    function allowResultFor(address grantee, uint256 optionIndex) external {
        if (msg.sender != owner) revert NotOwner();
        if (!isConfigured) revert SurveyNotConfigured();
        if (optionIndex >= _options.length) revert InvalidOption();

        FHE.allow(_options[optionIndex].encryptedTotal, grantee);

        emit ResultAccessGranted(grantee, optionIndex);
    }

    /// @notice Retrieves metadata about the survey options.
    /// @return labels The list of option labels.
    function getOptionLabels() external view returns (string[] memory labels) {
        if (!isConfigured) revert SurveyNotConfigured();

        labels = new string[](_options.length);
        for (uint256 i = 0; i < _options.length; i++) {
            labels[i] = _options[i].label;
        }
    }

    /// @notice Returns the encrypted total votes for a given option.
    /// @param optionIndex Index of the option.
    /// @return encryptedTotal The encrypted total votes.
    function getEncryptedTotal(uint256 optionIndex) external view returns (euint32 encryptedTotal) {
        if (!isConfigured) revert SurveyNotConfigured();
        if (optionIndex >= _options.length) revert InvalidOption();

        encryptedTotal = _options[optionIndex].encryptedTotal;
    }

    /// @notice Returns the number of configured options.
    /// @return count The option count.
    function optionCount() external view returns (uint256 count) {
        if (!isConfigured) revert SurveyNotConfigured();
        count = _options.length;
    }

    /// @notice Returns whether an address has already voted.
    /// @param voter The address to check.
    /// @return voted True if the address has voted, false otherwise.
    function hasVoterSubmitted(address voter) external view returns (bool voted) {
        voted = hasVoted[voter];
    }
}
