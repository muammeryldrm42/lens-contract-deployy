// Lens Testnet Deployer + Mint UI
const statusEl = document.getElementById('status');
function log(msg, cls){ statusEl.innerHTML += `\n${cls?`<span class="${cls}">`:''}${msg}${cls?'</span>':''}`; statusEl.scrollTop = statusEl.scrollHeight; }
function set(msg, cls){ statusEl.innerHTML = `${cls?`<span class="${cls}">`:''}${msg}${cls?'</span>':''}`; }
function short(addr){ return addr ? addr.slice(0,6)+'…'+addr.slice(-4) : ''; }

// Official network params (per Lens docs)
const LENS_CHAIN_ID_HEX = '0x90f7'; // 37111
const LENS_PARAMS = {
  chainId: LENS_CHAIN_ID_HEX,
  chainName: 'Lens Chain Testnet',
  nativeCurrency: { name: 'GRASS', symbol: 'GRASS', decimals: 18 },
  rpcUrls: ['https://rpc.testnet.lens.xyz'],
  blockExplorerUrls: ['https://explorer.testnet.lens.xyz']
};

let provider, signer, account, lastERC20, lastERC721;

// ---------------- Wallet / Network ----------------
async function connectWallet(){
  if(!window.ethereum){ set('MetaMask not found. Please install it.', 'err'); return; }
  provider = new ethers.BrowserProvider(window.ethereum);
  const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
  account = accs[0];
  signer = await provider.getSigner();
  const net = await provider.getNetwork();
  set(`Connected: ${short(account)} | ChainID: ${Number(net.chainId)}.`, 'ok');
  if (Number(net.chainId) !== 37111){
    log('Not on Lens Testnet. Click “Switch to Lens Testnet”.', 'warn');
  }
}

async function switchToLens(){
  if(!window.ethereum){ set('MetaMask not found.', 'err'); return; }
  try{
    await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{ chainId: LENS_CHAIN_ID_HEX }]});
  }catch(e){
    if(e.code === 4902){
      await window.ethereum.request({ method:'wallet_addEthereumChain', params:[LENS_PARAMS]});
    }else{
      throw e;
    }
  }
  const net = await (new ethers.BrowserProvider(window.ethereum)).getNetwork();
  set(`Switched. ChainID: ${Number(net.chainId)} (Lens Testnet).`, 'ok');
}

async function connectIfNeeded(){
  if (!provider || !signer || !account){
    await connectWallet();
  }
}

async function assertLens(){
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 37111){
    throw new Error('Wrong network. Please switch to Lens Testnet (ChainID 37111).');
  }
}

// ---------------- Solidity Sources ----------------
// ERC20 with owner + mint
const SRC_ERC20 = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract MintableToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 value);

    modifier onlyOwner(){ require(msg.sender == owner, "ONLY_OWNER"); _; }

    constructor(string memory _name, string memory _symbol, uint256 _initialSupply) {
        name = _name; symbol = _symbol; owner = msg.sender;
        uint256 supply = _initialSupply * (10 ** uint256(decimals));
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }
    function mint(address to, uint256 amount) external onlyOwner {
        uint256 value = amount * (10 ** uint256(decimals));
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }
    function transfer(address to, uint256 value) external returns (bool) {
        require(balanceOf[msg.sender] >= value, "INSUFFICIENT_BALANCE");
        unchecked { balanceOf[msg.sender] -= value; }
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }
}`;

// Simple ERC721 with mint(to)
const SRC_ERC721 = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract SimpleNFT {
    string public name;
    string public symbol;
    uint256 public nextTokenId;
    address public owner;
    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    modifier onlyOwner(){ require(msg.sender == owner, "ONLY_OWNER"); _; }
    constructor(string memory _name, string memory _symbol) {
        name = _name; symbol = _symbol; owner = msg.sender;
    }
    function mint(address to) external onlyOwner returns (uint256) {
        uint256 tokenId = ++nextTokenId;
        ownerOf[tokenId] = to;
        balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }
}`;

// ---------------- Compiler (solc) ----------------
function ensureSolc(){
  if (typeof window.solc === 'undefined'){
    throw new Error("solc not found. Put a local file named `solc.min.js` next to index.html.");
  }
  return window.solc;
}

function compile(sourceName, sourceContent){
  const solc = ensureSolc();
  const input = {
    language: 'Solidity',
    sources: { [sourceName]: { content: sourceContent } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi','evm.bytecode.object'] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors){
    const errs = output.errors.filter(e => e.severity === 'error');
    if (errs.length){
      throw new Error(errs.map(e => e.formattedMessage || e.message).join('\n'));
    }
  }
  const contractName = Object.keys(output.contracts[sourceName])[0];
  const artifact = output.contracts[sourceName][contractName];
  const abi = artifact.abi;
  const bytecode = '0x' + artifact.evm.bytecode.object;
  if (!bytecode || bytecode === '0x') throw new Error('Compilation produced empty bytecode.');
  return { abi, bytecode, contractName };
}

// ---------------- Deployment ----------------
async function deployERC20(){
  try{
    set('Compiling ERC‑20…');
    const { abi, bytecode, contractName } = compile('MintableToken.sol', SRC_ERC20);
    log(`✔ Compiled ${contractName}`, 'ok');
    await connectIfNeeded(); await assertLens();

    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const name  = document.getElementById('erc20-name').value || 'MyToken';
    const sym   = document.getElementById('erc20-symbol').value || 'MTK';
    const sup   = BigInt(document.getElementById('erc20-supply').value || '1000000');

    set('Sending deploy tx… (ERC‑20)');
    const contract = await factory.deploy(name, sym, sup);
    log(`Tx sent: ${contract.deploymentTransaction().hash}`);

    set('Waiting for confirmation…');
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    lastERC20 = addr;
    document.getElementById('mint20-address').value = addr;

    set(`Deployed ERC‑20 at ${addr}`, 'ok');
    log(`Explorer: <a class="link" target="_blank" href="https://explorer.testnet.lens.xyz/address/${addr}">view on explorer</a>`);
  }catch(err){
    log('Deploy failed: ' + (err?.message || err), 'err');
  }
}

async function deployERC721(){
  try{
    set('Compiling ERC‑721…');
    const { abi, bytecode, contractName } = compile('SimpleNFT.sol', SRC_ERC721);
    log(`✔ Compiled ${contractName}`, 'ok');
    await connectIfNeeded(); await assertLens();

    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    const name  = document.getElementById('erc721-name').value || 'MyNFT';
    const sym   = document.getElementById('erc721-symbol').value || 'MNFT';

    set('Sending deploy tx… (ERC‑721)');
    const contract = await factory.deploy(name, sym);
    log(`Tx sent: ${contract.deploymentTransaction().hash}`);

    set('Waiting for confirmation…');
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    lastERC721 = addr;
    document.getElementById('mint721-address').value = addr;

    set(`Deployed ERC‑721 at ${addr}`, 'ok');
    log(`Explorer: <a class="link" target="_blank" href="https://explorer.testnet.lens.xyz/address/${addr}">view on explorer</a>`);
  }catch(err){
    log('Deploy failed: ' + (err?.message || err), 'err');
  }
}

// ---------------- Mint UIs ----------------
const ABI_ERC20 = [
  {"type":"function","name":"mint","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"decimals","inputs":[],"outputs":[{"type":"uint8"}],"stateMutability":"view"},
  {"type":"function","name":"balanceOf","inputs":[{"name":"owner","type":"address"}],"outputs":[{"type":"uint256"}],"stateMutability":"view"}
];

const ABI_ERC721 = [
  {"type":"function","name":"mint","inputs":[{"name":"to","type":"address"}],"outputs":[{"type":"uint256"}],"stateMutability":"nonpayable"}
];

async function mintERC20(){
  try{
    await connectIfNeeded(); await assertLens();
    const addr = document.getElementById('mint20-address').value || lastERC20;
    const to = document.getElementById('mint20-to').value || account;
    const amount = BigInt(document.getElementById('mint20-amount').value || '0');
    if(!addr){ throw new Error('Token contract address is empty.'); }
    const erc20 = new ethers.Contract(addr, ABI_ERC20, signer);
    set('Sending mint tx… (ERC‑20)');
    const tx = await erc20.mint(to, amount);
    log(`Tx sent: ${tx.hash}`);
    await tx.wait();
    set('Minted ERC‑20 successfully.', 'ok');
  }catch(err){
    log('Mint failed: ' + (err?.message || err), 'err');
  }
}

async function mintERC721(){
  try{
    await connectIfNeeded(); await assertLens();
    const addr = document.getElementById('mint721-address').value || lastERC721;
    const to = document.getElementById('mint721-to').value || account;
    if(!addr){ throw new Error('NFT contract address is empty.'); }
    const nft = new ethers.Contract(addr, ABI_ERC721, signer);
    set('Sending mint tx… (ERC‑721)');
    const tx = await nft.mint(to);
    log(`Tx sent: ${tx.hash}`);
    await tx.wait();
    set('Minted ERC‑721 successfully.', 'ok');
  }catch(err){
    log('Mint failed: ' + (err?.message || err), 'err');
  }
}

// ---------------- Bindings ----------------
document.getElementById('btn-connect').addEventListener('click', connectWallet);
document.getElementById('btn-switch').addEventListener('click', switchToLens);
document.getElementById('btn-deploy-erc20').addEventListener('click', deployERC20);
document.getElementById('btn-deploy-erc721').addEventListener('click', deployERC721);
document.getElementById('btn-mint-erc20').addEventListener('click', mintERC20);
document.getElementById('btn-mint-erc721').addEventListener('click', mintERC721);

// Tips on load
window.addEventListener('load', ()=>{
  log('If you see “solc not found”, place a local `solc.min.js` file next to index.html (browser build of solc).', 'warn');
  log('Network RPC: https://rpc.testnet.lens.xyz | Explorer: https://explorer.testnet.lens.xyz', 'warn');
});
