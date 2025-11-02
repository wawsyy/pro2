# Encrypted Survey Voting Frontend

This Next.js application provides the RainbowKit-powered dashboard for the Encrypted Survey Voting flow. It interacts with the `EncryptedSurvey.sol` contract, handling wallet connectivity, encryption of survey votes, decryption of authorised results, and owner-level survey management.

## Prerequisites

- Node.js 20 or newer
- npm 10+
- A WalletConnect project ID exposed as `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- Generated ABI files (`npm run genabi`) from the project root after each contract deployment

## Getting Started

Install dependencies:

```
npm install
```

Regenerate ABI files (must be run after `npx hardhat deploy` in the root project):

```
npm run genabi
```

Launch the development server against the FHEVM mock environment:

```
npm run dev:mock
```

Visit http://localhost:3000 and use the RainbowKit button in the header to connect a wallet.

## Key Features

- Survey configuration for the contract owner, including question and option management
- Encrypted vote submission with optional weighting and enforced one-vote-per-wallet
- Owner controls for finalising surveys and granting result decryption rights
- Encrypted result listings with inline decryption for authorised accounts
- Real-time pairing with the Hardhat FHEVM mock for local development

## Project Structure Highlights

- `app/` - Next.js routing, global styles, and provider setup
- `components/EncryptedSurveyDashboard.tsx` - primary survey workflow UI
- `hooks/useEncryptedSurvey.tsx` - contract integration, encryption and decryption logic, and UI state
- `fhevm/` - shared helpers sourced from the Zama template for interacting with the FHEVM relayer SDK
- `abi/` - generated ABI and address maps produced by `npm run genabi`

## Scripts

- `npm run dev:mock` - start Next.js with the FHEVM mock runtime (default for local work)
- `npm run dev` - start Next.js without auto-running the mock helper
- `npm run build` - production build
- `npm run lint` - Next.js linting

## License

This package inherits the BSD-3-Clause-Clear licence from the parent project.
