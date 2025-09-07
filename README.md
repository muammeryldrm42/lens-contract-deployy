# Lens Testnet — Contract Deployer (with Mint buttons)

This is a single‑page app that lets you **deploy** and **mint** for simple ERC‑20 and ERC‑721 contracts on **Lens Chain Testnet** (ChainID **37111**, native token **GRASS**).

## What’s inside?
- `index.html` — UI (mobile friendly)
- `styles.css` — light styling
- `app.js` — logic (ethers v6, compile + deploy + mint)
- **You must add** a local Solidity compiler file as `solc.min.js`

## 2‑Step Setup
1. Put these files in one folder and open `index.html` in your browser (Chrome + MetaMask).
2. Download a **browser build of solc**, e.g. `soljson-v0.8.26+commit....js`, and place it next to `index.html` as **`solc.min.js`**.  
   - Without this file you’ll see “solc not found”. That’s expected until you add it.

## Lens Testnet (official)
- Chain ID: **37111**
- RPC: **https://rpc.testnet.lens.xyz**
- Explorer: **https://explorer.testnet.lens.xyz**
- Currency: **GRASS**

If your wallet isn’t on Lens Testnet, click **“Switch to Lens Testnet”** in the app header.

## Contracts
Two minimal contracts are compiled in‑browser:
- **ERC‑20**: `MintableToken` — owner‑gated `mint(address,uint256)`, 18 decimals, deployer receives initial supply.
- **ERC‑721**: `SimpleNFT` — owner‑gated `mint(address)`.

> Owner is the deployer address.

## Mint UI
- After deploying, the app auto‑fills the contract address into the mint form.
- ERC‑20 amount is in **whole units** (18 decimals are handled inside the contract).

## Troubleshooting
- **solc not found** → Add a local `solc.min.js` (browser build of Solidity compiler).
- **Wrong network** → Use the “Switch to Lens Testnet” button.
- **Insufficient funds** → Get GRASS from the Lens faucet (see Lens docs).

Happy shipping! 🛠️
