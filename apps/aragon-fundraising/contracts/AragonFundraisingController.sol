pragma solidity 0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/EtherTokenConstant.sol";
import "@aragon/os/contracts/common/IsContract.sol";
import "@aragon/os/contracts/common/SafeERC20.sol";
import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/token/ERC20.sol";
import "@aragon/apps-vault/contracts/Vault.sol";
import "@ablack/fundraising-shared-interfaces/contracts/IPresale.sol";
import "../../batched-bancor-market-maker/contracts/BancorMarketMaker.sol";
import "./IAragonFundraisingController.sol";

// TODO: Update permissions

// TODO: Removed vars for UI reference:
// ITap public tap;
//bytes32 public constant UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE  = keccak256("UPDATE_MAXIMUM_TAP_RATE_INCREASE_PCT_ROLE");
//bytes32 public constant UPDATE_MAXIMUM_TAP_FLOOR_DECREASE_PCT_ROLE = keccak256("UPDATE_MAXIMUM_TAP_FLOOR_DECREASE_PCT_ROLE");
//bytes32 public constant ADD_TOKEN_TAP_ROLE                         = keccak256("ADD_TOKEN_TAP_ROLE");
//bytes32 public constant UPDATE_TOKEN_TAP_ROLE                      = keccak256("UPDATE_TOKEN_TAP_ROLE");
//     uint256 public constant TO_RESET_CAP = 10;
//     string private constant ERROR_INVALID_TOKENS  = "FUNDRAISING_INVALID_TOKENS";
//     address[]                public toReset;
//function openBuyOrder(address _collateral, uint256 _value)
//function openSellOrder(address _collateral, uint256 _amount)
//function claimBuyOrder(address _buyer, uint256 _batchId, address _collateral)
//function claimSellOrder(address _seller, uint256 _batchId, address _collateral)
//function collateralsToBeClaimed(address _collateral)


contract AragonFundraisingController is EtherTokenConstant, IsContract, IAragonFundraisingController, AragonApp {
    using SafeERC20 for ERC20;
    using SafeMath  for uint256;

    /**
    Hardcoded constants to save gas
    bytes32 public constant UPDATE_BENEFICIARY_ROLE                    = keccak256("UPDATE_BENEFICIARY_ROLE");
    bytes32 public constant UPDATE_FEES_ROLE                           = keccak256("UPDATE_FEES_ROLE");
    bytes32 public constant ADD_COLLATERAL_TOKEN_ROLE                  = keccak256("ADD_COLLATERAL_TOKEN_ROLE");
    bytes32 public constant REMOVE_COLLATERAL_TOKEN_ROLE               = keccak256("REMOVE_COLLATERAL_TOKEN_ROLE");
    bytes32 public constant UPDATE_COLLATERAL_TOKEN_ROLE               = keccak256("UPDATE_COLLATERAL_TOKEN_ROLE");
    bytes32 public constant OPEN_PRESALE_ROLE                          = keccak256("OPEN_PRESALE_ROLE");
    bytes32 public constant OPEN_TRADING_ROLE                          = keccak256("OPEN_TRADING_ROLE");
    bytes32 public constant CONTRIBUTE_ROLE                            = keccak256("CONTRIBUTE_ROLE");
    bytes32 public constant OPEN_BUY_ORDER_ROLE                        = keccak256("OPEN_BUY_ORDER_ROLE");
    bytes32 public constant OPEN_SELL_ORDER_ROLE                       = keccak256("OPEN_SELL_ORDER_ROLE");
    bytes32 public constant WITHDRAW_ROLE                              = keccak256("WITHDRAW_ROLE");
    */
    bytes32 public constant UPDATE_BENEFICIARY_ROLE                    = 0xf7ea2b80c7b6a2cab2c11d2290cb005c3748397358a25e17113658c83b732593;
    bytes32 public constant UPDATE_FEES_ROLE                           = 0x5f9be2932ed3a723f295a763be1804c7ebfd1a41c1348fb8bdf5be1c5cdca822;
    bytes32 public constant ADD_COLLATERAL_TOKEN_ROLE                  = 0x217b79cb2bc7760defc88529853ef81ab33ae5bb315408ce9f5af09c8776662d;
    bytes32 public constant REMOVE_COLLATERAL_TOKEN_ROLE               = 0x2044e56de223845e4be7d0a6f4e9a29b635547f16413a6d1327c58d9db438ee2;
    bytes32 public constant UPDATE_COLLATERAL_TOKEN_ROLE               = 0xe0565c2c43e0d841e206bb36a37f12f22584b4652ccee6f9e0c071b697a2e13d;
    bytes32 public constant OPEN_PRESALE_ROLE                          = 0xf323aa41eef4850a8ae7ebd047d4c89f01ce49c781f3308be67303db9cdd48c2;
    bytes32 public constant OPEN_TRADING_ROLE                          = 0x26ce034204208c0bbca4c8a793d17b99e546009b1dd31d3c1ef761f66372caf6;
    bytes32 public constant CONTRIBUTE_ROLE                            = 0x9ccaca4edf2127f20c425fdd86af1ba178b9e5bee280cd70d88ac5f6874c4f07;
    bytes32 public constant OPEN_BUY_ORDER_ROLE                        = 0xa589c8f284b76fc8d510d9d553485c47dbef1b0745ae00e0f3fd4e28fcd77ea7;
    bytes32 public constant OPEN_SELL_ORDER_ROLE                       = 0xd68ba2b769fa37a2a7bd4bed9241b448bc99eca41f519ef037406386a8f291c0;
    bytes32 public constant WITHDRAW_ROLE                              = 0x5d8e12c39142ff96d79d04d15d1ba1269e4fe57bb9d26f43523628b34ba108ec;

    string private constant ERROR_CONTRACT_IS_EOA = "FUNDRAISING_CONTRACT_IS_EOA";

    IPresale public presale;
    BancorMarketMaker public marketMaker;
    Vault public reserve;

    /***** external functions *****/

    /**
     * @notice Initialize Aragon Fundraising controller
     * @param _presale     The address of the presale contract
     * @param _marketMaker The address of the market maker contract
     * @param _reserve     The address of the reserve [pool] contract
    */
    function initialize(
        IPresale _presale,
        BancorMarketMaker _marketMaker,
        Vault _reserve
    )
        external
        onlyInit
    {
        require(isContract(_presale),           ERROR_CONTRACT_IS_EOA);
        require(isContract(_marketMaker),       ERROR_CONTRACT_IS_EOA);
        require(isContract(_reserve),           ERROR_CONTRACT_IS_EOA);

        initialized();

        presale = _presale;
        marketMaker = _marketMaker;
        reserve = _reserve;
    }

    /* generic settings related function */

    /**
     * @notice Update beneficiary to `_beneficiary`
     * @param _beneficiary The address of the new beneficiary
    */
    function updateBeneficiary(address _beneficiary) external auth(UPDATE_BENEFICIARY_ROLE) {
        marketMaker.updateBeneficiary(_beneficiary);
    }

    /**
     * @notice Update fees deducted from buy and sell orders to respectively `@formatPct(_buyFeePct)`% and `@formatPct(_sellFeePct)`%
     * @param _buyFeePct  The new fee to be deducted from buy orders [in PCT_BASE]
     * @param _sellFeePct The new fee to be deducted from sell orders [in PCT_BASE]
    */
    function updateFees(uint256 _buyFeePct, uint256 _sellFeePct) external auth(UPDATE_FEES_ROLE) {
        marketMaker.updateFees(_buyFeePct, _sellFeePct);
    }

    /* presale related functions */

    /**
     * @notice Open presale
    */
    function openPresale() external auth(OPEN_PRESALE_ROLE) {
        presale.open();
    }

    /**
     * @notice Close presale and open trading
    */
    function closePresale() external isInitialized {
        presale.close();
    }

    /**
     * @notice Contribute to the presale up to `@tokenAmount(self.contributionToken(): address, _value)`
     * @param _value The amount of contribution token to be spent
    */
    function contribute(uint256 _value) external payable authP(CONTRIBUTE_ROLE, arr(msg.sender)) {
        presale.contribute.value(msg.value)(msg.sender, _value);
    }

    /**
     * @notice Refund `_contributor`'s presale contribution #`_vestedPurchaseId`
     * @param _contributor      The address of the contributor whose presale contribution is to be refunded
     * @param _vestedPurchaseId The id of the contribution to be refunded
    */
    function refund(address _contributor, uint256 _vestedPurchaseId) external isInitialized {
        presale.refund(_contributor, _vestedPurchaseId);
    }

    /* market making related functions */

    /**
     * @notice Open trading [enabling users to open buy and sell orders]
    */
    function openTrading() external auth(OPEN_TRADING_ROLE) {
        marketMaker.open();
    }



    /**
     * @notice Open a buy order worth `@tokenAmount(_collateral, _value)`
     * @param _collateral The address of the collateral token to be spent
     * @param _depositAmount The amount of collateral token to be deposited
     * @param _minReturnAmountAfterFee The minimum amount of the returned bonded tokens
    */
    function makeBuyOrder(address _collateral, uint256 _depositAmount, uint256 _minReturnAmountAfterFee)
        external payable authP(OPEN_BUY_ORDER_ROLE, arr(msg.sender))
    {
        marketMaker.makeBuyOrder.value(msg.value)(msg.sender, _collateral, _depositAmount, _minReturnAmountAfterFee);
    }

    /**
     * @notice Open a sell order worth `@tokenAmount(self.token(): address, _amount)` against `_collateral.symbol(): string`
     * @param _collateral The address of the collateral token to be returned
     * @param _sellAmount The amount of bonded token to be spent
     * @param _minReturnAmountAfterFee The minimum amount of the returned collateral tokens
    */
    function makeSellOrder(address _collateral, uint256 _sellAmount, uint256 _minReturnAmountAfterFee)
        external authP(OPEN_SELL_ORDER_ROLE, arr(msg.sender))
    {
        marketMaker.makeSellOrder(msg.sender, _collateral, _sellAmount, _minReturnAmountAfterFee);
    }

    /* collateral tokens related functions */

    /**
     * @notice Add `_collateral.symbol(): string` as a whitelisted collateral token
     * @param _collateral     The address of the collateral token to be whitelisted
     * @param _virtualSupply  The virtual supply to be used for that collateral token [in wei]
     * @param _virtualBalance The virtual balance to be used for that collateral token [in wei]
     * @param _reserveRatio   The reserve ratio to be used for that collateral token [in PPM]
    */
    function addCollateralToken(
        address _collateral,
        uint256 _virtualSupply,
        uint256 _virtualBalance,
        uint32  _reserveRatio
    )
    	external
        auth(ADD_COLLATERAL_TOKEN_ROLE)
    {
        marketMaker.addCollateralToken(_collateral, _virtualSupply, _virtualBalance, _reserveRatio);
    }

    /**
     * @notice Re-add `_collateral.symbol(): string` as a whitelisted collateral token [if it has been un-whitelisted in the past]
     * @param _collateral     The address of the collateral token to be whitelisted
     * @param _virtualSupply  The virtual supply to be used for that collateral token [in wei]
     * @param _virtualBalance The virtual balance to be used for that collateral token [in wei]
     * @param _reserveRatio   The reserve ratio to be used for that collateral token [in PPM]
    */
    function reAddCollateralToken(
        address _collateral,
        uint256 _virtualSupply,
        uint256 _virtualBalance,
        uint32  _reserveRatio
    )
    	external
        auth(ADD_COLLATERAL_TOKEN_ROLE)
    {
        marketMaker.addCollateralToken(_collateral, _virtualSupply, _virtualBalance, _reserveRatio);
    }

    /**
      * @notice Remove `_collateral.symbol(): string` as a whitelisted collateral token
      * @param _collateral The address of the collateral token to be un-whitelisted
    */
    function removeCollateralToken(address _collateral) external auth(REMOVE_COLLATERAL_TOKEN_ROLE) {
        marketMaker.removeCollateralToken(_collateral);
    }

    /**
     * @notice Update `_collateral.symbol(): string` collateralization settings
     * @param _collateral     The address of the collateral token whose collateralization settings are to be updated
     * @param _virtualSupply  The new virtual supply to be used for that collateral token [in wei]
     * @param _virtualBalance The new virtual balance to be used for that collateral token [in wei]
     * @param _reserveRatio   The new reserve ratio to be used for that collateral token [in PPM]
    */
    function updateCollateralToken(
        address _collateral,
        uint256 _virtualSupply,
        uint256 _virtualBalance,
        uint32  _reserveRatio
    )
        external
        auth(UPDATE_COLLATERAL_TOKEN_ROLE)
    {
        marketMaker.updateCollateralToken(_collateral, _virtualSupply, _virtualBalance, _reserveRatio);
    }

    /***** public view functions *****/

    function token() public view isInitialized returns (address) {
        return marketMaker.token();
    }

    function contributionToken() public view isInitialized returns (address) {
        return presale.contributionToken();
    }

    function balanceOf(address _who, address _token) public view isInitialized returns (uint256) {
        return _token == ETH ? _who.balance : ERC20(_token).staticBalanceOf(_who);
    }

    /***** internal functions *****/

    function _tokenIsContractOrETH(address _token) internal view returns (bool) {
        return isContract(_token) || _token == ETH;
    }
}
