/* eslint-disable no-undef */
/* eslint-disable no-use-before-define */
// var web3 = web3 || {}
// var artifacts = artifacts || {}
// var contract = contract || function(a, b) {}
// var context = context || function(a, b) {}
// var it = it || function(a, b) {}
// var before = before || function(a, b) {}
// var beforeEach = beforeEach || function(a, b) {}
// var assert = assert || {}

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const getBalance = require('@aragon/test-helpers/balance')(web3)
const assertEvent = require('@aragon/test-helpers/assertEvent')
const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const blockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const { hash } = require('eth-ens-namehash')

const getEvent = (receipt, event, arg) => {
  return receipt.logs.filter(l => l.event === event)[0].args[arg]
}
const getTimestamp = receipt => {
  return web3.eth.getBlock(receipt.receipt.blockNumber).timestamp
}

const Kernel = artifacts.require('Kernel')
const ACL = artifacts.require('ACL')
const EVMScriptRegistryFactory = artifacts.require('EVMScriptRegistryFactory')
const DAOFactory = artifacts.require('DAOFactory')
const MiniMeToken = artifacts.require('MiniMeToken')
const TokenManager = artifacts.require('TokenManager')
const Pool = artifacts.require('Pool')
const Controller = artifacts.require('SimpleMarketMakerController')
const Formula = artifacts.require('BancorFormula.sol')
const BondingCurve = artifacts.require('BondingCurve')
const EtherTokenConstantMock = artifacts.require('EtherTokenConstantMock')
const TokenMock = artifacts.require('TokenMock')
const ForceSendETH = artifacts.require('ForceSendETH')

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const DEBUG = false

contract('BondingCurve app', accounts => {
  let factory, dao, acl, token, pBase, cBase, bBase, tBase, pool, tokenManager, controller, formula, curve, token1, token2, token3
  let ETH, APP_MANAGER_ROLE, MINT_ROLE, BURN_ROLE, ADMIN_ROLE, CREATE_BUY_ORDER_ROLE, CREATE_SELL_ORDER_ROLE, TRANSFER_ROLE

  // let UPDATE_VAULT_ROLE, UPDATE_POOL_ROLE, ADD_TOKEN_TAP_ROLE, REMOVE_TOKEN_TAP_ROLE, UPDATE_TOKEN_TAP_ROLE, WITHDRAW_ROLE, TRANSFER_ROLE

  const POOL_ID = hash('pool.aragonpm.eth')
  const TOKEN_MANAGER_ID = hash('token-manager.aragonpm.eth')
  const CONTROLLER_ID = hash('controller.aragonpm.eth')
  const BANCOR_CURVE_ID = hash('vault.aragonpm.eth')

  const INITIAL_ETH_BALANCE = 500
  const INITIAL_TOKEN_BALANCE = 1000

  const VIRTUAL_SUPPLIES = [2, 3, 4]
  const VIRTUAL_BALANCES = [1, 3, 3]
  const RESERVE_RATIOS = [200000, 300000, 500000]
  const FEE_PERCENT = 10000
  const BUY_GAS = 0
  const SELL_GAS = 0
  const BLOCKS_IN_BATCH = 10
  const PPM = 1000000

  const root = accounts[0]
  const authorized = accounts[1]
  const unauthorized = accounts[2]

  const initialize = async _ => {
    // DAO
    const dReceipt = await factory.newDAO(root)
    dao = await Kernel.at(getEvent(dReceipt, 'DeployDAO', 'dao'))
    acl = await ACL.at(await dao.acl())
    await acl.createPermission(root, dao.address, APP_MANAGER_ROLE, root, { from: root })
    // token
    token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'Bond', 18, 'BON', false)
    // pool
    const pReceipt = await dao.newAppInstance(POOL_ID, pBase.address, '0x', false)
    pool = await Pool.at(getEvent(pReceipt, 'NewAppProxy', 'proxy'))
    // market maker controller
    const cReceipt = await dao.newAppInstance(CONTROLLER_ID, cBase.address, '0x', false)
    controller = await Controller.at(getEvent(cReceipt, 'NewAppProxy', 'proxy'))
    // token manager
    const tReceipt = await dao.newAppInstance(TOKEN_MANAGER_ID, tBase.address, '0x', false)
    tokenManager = await TokenManager.at(getEvent(tReceipt, 'NewAppProxy', 'proxy'))
    // bancor-curve
    const bReceipt = await dao.newAppInstance(BANCOR_CURVE_ID, bBase.address, '0x', false)
    curve = await BondingCurve.at(getEvent(bReceipt, 'NewAppProxy', 'proxy'))
    // permissions
    await acl.createPermission(curve.address, pool.address, TRANSFER_ROLE, root, { from: root })
    await acl.createPermission(curve.address, tokenManager.address, MINT_ROLE, root, { from: root })
    await acl.createPermission(curve.address, tokenManager.address, BURN_ROLE, root, { from: root })
    await acl.createPermission(authorized, curve.address, ADMIN_ROLE, root, { from: root })
    await acl.createPermission(authorized, curve.address, CREATE_BUY_ORDER_ROLE, root, { from: root })
    await acl.createPermission(authorized, curve.address, CREATE_SELL_ORDER_ROLE, root, { from: root })
    // collaterals
    await forceSendETH(authorized, INITIAL_ETH_BALANCE)
    token1 = await TokenMock.new(authorized, INITIAL_TOKEN_BALANCE)
    token2 = await TokenMock.new(authorized, INITIAL_TOKEN_BALANCE)
    token3 = await TokenMock.new(unauthorized, INITIAL_TOKEN_BALANCE)
    // allowances
    await token1.approve(curve.address, INITIAL_TOKEN_BALANCE, { from: authorized })
    await token2.approve(curve.address, INITIAL_TOKEN_BALANCE, { from: authorized })
    await token3.approve(curve.address, INITIAL_TOKEN_BALANCE, { from: unauthorized })
    // initializations
    await token.changeController(tokenManager.address)
    await tokenManager.initialize(token.address, true, 0)
    await pool.initialize()

    await controller.initialize(pool.address, curve.address)
    await curve.initialize(controller.address, tokenManager.address, formula.address, BLOCKS_IN_BATCH)
    await curve.updateFee(FEE_PERCENT, { from: authorized })
    await curve.updateGas(BUY_GAS, SELL_GAS, { from: authorized })
    await curve.addCollateralToken(ETH, VIRTUAL_SUPPLIES[0], VIRTUAL_BALANCES[0], RESERVE_RATIOS[0], { from: authorized })
    await curve.addCollateralToken(token1.address, VIRTUAL_SUPPLIES[1], VIRTUAL_BALANCES[1], RESERVE_RATIOS[1], { from: authorized })
    await curve.addCollateralToken(token2.address, VIRTUAL_SUPPLIES[2], VIRTUAL_BALANCES[2], RESERVE_RATIOS[2], { from: authorized })
  }

  const forceSendETH = async (to, value) => {
    // Using this contract ETH will be send by selfdestruct which always succeeds
    const forceSend = await ForceSendETH.new()
    return forceSend.sendByDying(to, { value })
  }

  before(async () => {
    // factory
    const kBase = await Kernel.new(true) // petrify immediately
    const aBase = await ACL.new()
    const rFact = await EVMScriptRegistryFactory.new()
    factory = await DAOFactory.new(kBase.address, aBase.address, rFact.address)
    // formula
    formula = await Formula.new()
    // base contracts
    pBase = await Pool.new()
    cBase = await Controller.new()
    tBase = await TokenManager.new()
    bBase = await BondingCurve.new()
    // constants
    ETH = await (await EtherTokenConstantMock.new()).getETHConstant()
    APP_MANAGER_ROLE = await kBase.APP_MANAGER_ROLE()
    TRANSFER_ROLE = await pBase.TRANSFER_ROLE()
    MINT_ROLE = await tBase.MINT_ROLE()
    BURN_ROLE = await tBase.BURN_ROLE()
    ADMIN_ROLE = await bBase.ADMIN_ROLE()
    CREATE_BUY_ORDER_ROLE = await bBase.CREATE_BUY_ORDER_ROLE()
    CREATE_SELL_ORDER_ROLE = await bBase.CREATE_SELL_ORDER_ROLE()
  })

  beforeEach(async () => {
    await initialize()
  })

  context('> #deploy', () => {
    it('> it should deploy', async () => {
      await BondingCurve.new()
    })
  })

  context('> #initialize', () => {
    context('> initialization parameters are correct', () => {
      it('it should initialize contract', async () => {
        assert.equal(await curve.pool(), pool.address)
        assert.equal(await curve.token(), token.address)
        assert.equal(await token.transfersEnabled(), true)
        assert.equal(await curve.batchBlocks(), BLOCKS_IN_BATCH)
        assert.equal(await curve.collateralTokensLength(), 3)

        assert.equal(await curve.collateralTokens(0), ETH)
        assert.equal(await curve.collateralTokens(1), token1.address)
        assert.equal(await curve.collateralTokens(2), token2.address)

        assert.equal(await controller.isCollateralToken(ETH), true)
        assert.equal(await controller.isCollateralToken(token1.address), true)
        assert.equal(await controller.isCollateralToken(token2.address), true)

        assert.equal(await controller.virtualSupply(ETH), VIRTUAL_SUPPLIES[0])
        assert.equal(await controller.virtualSupply(token1.address), VIRTUAL_SUPPLIES[1])
        assert.equal(await controller.virtualSupply(token2.address), VIRTUAL_SUPPLIES[2])

        assert.equal(await controller.virtualBalance(ETH), VIRTUAL_BALANCES[0])
        assert.equal(await controller.virtualBalance(token1.address), VIRTUAL_BALANCES[1])
        assert.equal(await controller.virtualBalance(token2.address), VIRTUAL_BALANCES[2])

        assert.equal(await controller.reserveRatio(ETH), RESERVE_RATIOS[0])
        assert.equal(await controller.reserveRatio(token1.address), RESERVE_RATIOS[1])
        assert.equal(await controller.reserveRatio(token2.address), RESERVE_RATIOS[2])
      })
    })

    //   context('> initialization parameters are not correct', () => {
    //     it('it should revert', async () => {

    //     })
    //   })
    it('it should revert on re-initialization', async () =>
      assertRevert(() => curve.initialize(controller.address, tokenManager.address, formula.address, BLOCKS_IN_BATCH)))
  })
  context('> #test', () => {
    it('it should work', async () => {
      assert.equal(await controller.reserveRatio(ETH), RESERVE_RATIOS[0])
      assert.equal(await controller.reserveRatio(token1.address), RESERVE_RATIOS[1])
      assert.equal(await controller.reserveRatio(token2.address), RESERVE_RATIOS[2])
      assert.equal(await controller.virtualSupply(ETH), VIRTUAL_SUPPLIES[0])
      assert.equal(await controller.virtualSupply(token1.address), VIRTUAL_SUPPLIES[1])
      assert.equal(await controller.virtualSupply(token2.address), VIRTUAL_SUPPLIES[2])
      assert.equal(await controller.virtualBalance(ETH), VIRTUAL_BALANCES[0])
      assert.equal(await controller.virtualBalance(token1.address), VIRTUAL_BALANCES[1])
      assert.equal(await controller.virtualBalance(token2.address), VIRTUAL_BALANCES[2])
    })
  })

  context('> #createBuyOrder', () => {
    context('> sender has CREATE_BUY_ORDER_ROLE', () => {
      context('> and collateral is whitelisted', () => {
        context('> and value is not zero', () => {
          context('> and begins by creating an order', () => {
            it('it should create buy order', async () => {
              const receipt = await curve.createBuyOrder(authorized, token1.address, 10, { from: authorized })
              assertEvent(receipt, 'NewBuyOrder')

              let NewBuyOrder = receipt.logs.find(l => l.event === 'NewBuyOrder')
              let batchNumber = NewBuyOrder ? NewBuyOrder.args.batchId.toNumber() : new Error('No Buy Order')

              await increaseBlocks(BLOCKS_IN_BATCH)

              if (DEBUG) await printBatch(batchNumber)

              const _receipt = await curve.createBuyOrder(authorized, token1.address, 10, { from: authorized })
              assertEvent(_receipt, 'NewBuyOrder')

              const claim = await curve.claimBuy(authorized, token1.address, batchNumber)
              assertEvent(claim, 'ReturnBuy')
            })

            let firstBatch, secondBatch, balance1, balance2

            beforeEach(async () => {
              balance1 = await token.balanceOf(authorized)
              const receipt1 = await curve.createBuyOrder(authorized, token1.address, 10, { from: authorized, value: BUY_GAS })
              assertEvent(receipt1, 'NewBuyOrder')
              NewBuyOrder = receipt1.logs.find(l => l.event === 'NewBuyOrder')
              firstBatch = NewBuyOrder ? NewBuyOrder.args.batchId.toNumber() : new Error('No Buy Order')
              if (DEBUG) await printBatch(firstBatch)
            })

            it('it should progress til next batch and clear first batch with new buy order, then progress and clear with clearBatches', async () => {
              await increaseBlocks(BLOCKS_IN_BATCH)

              const receipt2 = await curve.createBuyOrder(authorized, token1.address, 10, { from: authorized, value: BUY_GAS })
              assertEvent(receipt2, 'NewBuyOrder')
              NewBuyOrder = receipt2.logs.find(l => l.event === 'NewBuyOrder')
              secondBatch = NewBuyOrder ? NewBuyOrder.args.batchId.toNumber() : new Error('No Buy Order')

              let { cleared } = await getBatch(token1.address, firstBatch)
              assert(cleared, `Batch ${firstBatch} didn't clear`)

              await increaseBlocks(BLOCKS_IN_BATCH)
              await curve.clearBatches()
              cleared = await (async function() {
                let { cleared } = await getBatch(token1.address, secondBatch)
                return cleared
              })()
              assert(cleared, `Batch ${secondBatch} didn't clear`)
            })

            it('it should progress til next batch and clear first batch with clearBatches', async () => {
              await increaseBlocks(BLOCKS_IN_BATCH)

              await curve.clearBatches()

              let { cleared } = await getBatch(token1.address, firstBatch)
              assert(cleared, `Batch ${firstBatch} didn't clear`)
            })

            it('it should fail claiming the batch before it cleared', async () => {
              await assertRevert(() => curve.claimBuy(authorized, token1.address, firstBatch))
            })

            it('it should succeed claiming the batch after it is cleared', async () => {
              await increaseBlocks(BLOCKS_IN_BATCH)

              await curve.clearBatches()

              const claim1 = await curve.claimBuy(authorized, token1.address, firstBatch)
              assertEvent(claim1, 'ReturnBuy')

              balance2 = await token.balanceOf(authorized)
              assert(balance2.gt(balance1), `balance2 (${balance2.toString(10)}) is not greater than balance1 (${balance1.toString(10)})`)
            })
          })
        })
        context('> but value is zero', () => {
          it('it should revert', async () => {
            await assertRevert(() => curve.createBuyOrder(authorized, token1.address, 0, { from: authorized, value: BUY_GAS }))
          })
        })
      })
      context('> but collateral is not whitelisted', () => {
        it('it should revert', async () => {
          const unlisted = await TokenMock.new(authorized, INITIAL_TOKEN_BALANCE)
          await unlisted.approve(curve.address, INITIAL_TOKEN_BALANCE, { from: authorized })

          await assertRevert(() => curve.createBuyOrder(authorized, unlisted.address, 10, { from: authorized, value: BUY_GAS }))
        })
      })
    })

    context('> sender does not have CREATE_BUY_ORDER_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() => curve.createBuyOrder(unauthorized, token3.address, 10, { from: unauthorized, value: BUY_GAS }))
      })
    })
  })

  context('> #createSellOrder', () => {
    context('> sender has CREATE_SELL_ORDER_ROLE', () => {
      context('> and collateral is whitelisted', () => {
        context('> and amount is not zero', () => {
          context('> and sender has sufficient funds', () => {
            it('it should create sell order', async () => {
              await buyAndClaimTokens({ address: authorized, collateralToken: token1.address, amount: 10 })
              const receipt = await sellAsMuchAsPossible({ address: authorized, collateralToken: token1.address })

              assertEvent(receipt, 'NewSellOrder')
            })
            it('it should create sell order and claim it by clearing batches', async () => {
              await buyAndClaimTokens({ address: authorized, collateralToken: token1.address, amount: 10 })
              const receipt = await sellAsMuchAsPossible({ address: authorized, collateralToken: token1.address })

              let NewSellOrder = receipt.logs.find(l => l.event === 'NewSellOrder')
              let batchNumber = NewSellOrder ? NewSellOrder.args.batchId.toNumber() : new Error('No Sell Order')

              await increaseBlocks(BLOCKS_IN_BATCH)

              if (DEBUG) await printBatch(batchNumber)
              await curve.clearBatches()
              if (DEBUG) await printBatch(batchNumber)

              const claim = await curve.claimSell(authorized, token1.address, batchNumber)

              assertEvent(claim, 'ReturnSell')
            })
            it('it should create sell order and claim it by making a new buy order', async () => {
              await buyAndClaimTokens({ address: authorized, collateralToken: token1.address, amount: 10 })
              const receipt = await sellAsMuchAsPossible({ address: authorized, collateralToken: token1.address })

              let NewSellOrder = receipt.logs.find(l => l.event === 'NewSellOrder')
              let batchNumber = NewSellOrder ? NewSellOrder.args.batchId.toNumber() : new Error('No Sell Order')

              await increaseBlocks(BLOCKS_IN_BATCH)

              if (DEBUG) await printBatch(batchNumber)
              await buyAndClaimTokens({ address: authorized, collateralToken: token1.address, amount: 10 })
              if (DEBUG) await printBatch(batchNumber)

              const claim = await curve.claimSell(authorized, token1.address, batchNumber)

              assertEvent(claim, 'ReturnSell')
            })
            it('it should create sell order and claim it by making a new sell order', async () => {
              await buyAndClaimTokens({ address: authorized, collateralToken: token1.address, amount: 20 })
              const receipt = await sellHalfAsMuchAsPossible({ address: authorized, collateralToken: token1.address })

              let NewSellOrder = receipt.logs.find(l => l.event === 'NewSellOrder')
              let batchNumber = NewSellOrder ? NewSellOrder.args.batchId.toNumber() : new Error('No Sell Order')
              await increaseBlocks(BLOCKS_IN_BATCH)

              if (DEBUG) await printBatch(batchNumber)
              await sellAsMuchAsPossible({ address: authorized, collateralToken: token1.address })
              if (DEBUG) await printBatch(batchNumber)

              const claim = await curve.claimSell(authorized, token1.address, batchNumber)

              assertEvent(claim, 'ReturnSell')
            })
          })
          context('> but sender does not have sufficient funds', () => {
            it('it should revert', async () => {
              await assertRevert(() => curve.createSellOrder(authorized, token1.address, 10, { from: authorized }))
            })
          })
        })

        context('> but amount is zero', () => {
          it('it should revert', async () => {
            await buyAndClaimTokens({ address: authorized, collateralToken: token1.address, amount: 10 })
            await assertRevert(() => curve.createSellOrder(authorized, token1.address, 0, { from: authorized }))
          })
        })
      })
      context('> but collateral is not whitelisted', () => {
        it('it should revert', async () => {
          const unlisted = await TokenMock.new(authorized, INITIAL_TOKEN_BALANCE)
          await unlisted.approve(curve.address, INITIAL_TOKEN_BALANCE, { from: authorized })
          await assertRevert(() => curve.createSellOrder(authorized, unlisted.address, 0, { from: authorized }))
        })
      })
    })
    context('> sender does not have CREATE_SELL_ORDER_ROLE', () => {
      it('it should revert', async () => {
        await buyAndClaimTokens({ address: authorized, collateralToken: token1.address, amount: 10 })
        let balanceOf = await token.balanceOf(authorized)
        await token.transfer(unauthorized, balanceOf, { from: authorized })
        await assertRevert(() => curve.createSellOrder(unauthorized, token1.address, balanceOf, { from: unauthorized }))
      })
    })
  })

  // TODO: make it easier than double approve
  async function sellAsMuchAsPossible({ address, collateralToken }) {
    let balanceOf = await token.balanceOf(address)
    let transfersEnabled = await token.transfersEnabled()
    await token.approve(curve.address, 0, { from: address })
    await token.approve(curve.address, balanceOf, { from: address })
    let allowed = await token.allowance(address, curve.address)
    return curve.createSellOrder(address, collateralToken, balanceOf, { from: address })
  }

  // TODO: make it easier than double approve
  async function sellHalfAsMuchAsPossible({ address, collateralToken }) {
    let balanceOf = await token.balanceOf(address)
    let half = balanceOf.div(2)
    await token.approve(curve.address, 0, { from: address })
    await token.approve(curve.address, half, { from: address })
    return curve.createSellOrder(address, collateralToken, half, { from: address })
  }

  async function buyAndClaimTokens({ address, collateralToken, amount, from }) {
    from = from || address
    const batchId = await buyToken({ address, collateralToken, amount, from })
    await increaseBlocks(BLOCKS_IN_BATCH)
    await curve.clearBatches()
    await claimToken({ batchId, collateralToken, address })
  }

  async function buyToken({ address, collateralToken, amount, from, value = '0' }) {
    const _receipt = await curve.createBuyOrder(address, collateralToken, amount, { from, value })
    const NewBuyOrder = _receipt.logs.find(l => l.event === 'NewBuyOrder')
    return NewBuyOrder ? NewBuyOrder.args.batchId.toNumber() : new Error('No Buy Order')
  }

  async function claimToken({ batchId, collateralToken, address }) {
    await curve.claimBuy(authorized, token1.address, batchId)
  }

  async function printBatch(batchNumber) {
    const tokens = await curve.collateralTokensLength()
    await _printBatch(batchNumber, tokens.toNumber())
  }

  async function _printBatch(batchNumber, len, key = 0) {
    const PPM = 1000000
    console.log({ len, key })
    if (key === len) return
    const tokenAddress = await curve.collateralTokens(key)
    let [init, cleared, poolBalance, totalSupply, totalBuySpend, totalBuyReturn, totalSellSpend, totalSellReturn] = await curve.getBatch(
      tokenAddress,
      batchNumber
    )
    console.log({
      tokenAddress,
      init,
      cleared,
      poolBalance,
      totalSupply,
      totalBuySpend,
      totalBuyReturn,
      totalSellSpend,
      totalSellReturn,
    })
    let staticPrice = await curve.getPricePPM(tokenAddress, totalSupply, poolBalance)
    console.log({ staticPrice: staticPrice.toNumber() })
    let resultOfSell = totalSellSpend.mul(staticPrice).div(PPM)
    console.log({ resultOfSell: resultOfSell.toString(10) })
    let resultOfBuy = totalBuySpend.mul(PPM).div(staticPrice)
    console.log({ resultOfBuy: resultOfBuy.toString(10) })
    let remainingBuy = totalBuySpend.sub(resultOfSell)
    remainingBuy = remainingBuy > 0 ? remainingBuy : remainingBuy;
    console.log({ remainingBuy: remainingBuy.toString(10) })

    await _printBatch(batchNumber, len, key + 1)
  }

  async function getBatch(collateralToken, batchNumber) {
    let [init, cleared, poolBalance, totalSupply, totalBuySpend, totalBuyReturn, totalSellSpend, totalSellReturn] = await curve.getBatch(collateralToken, batchNumber)
    return {
      init,
      cleared,
      poolBalance,
      totalSupply,
      totalBuySpend,
      totalBuyReturn,
      totalSellSpend,
      totalSellReturn,
    }
  }
})

function increaseBlocks(blocks) {
  return new Promise((resolve, reject) => {
    increaseBlock().then(() => {
      blocks -= 1
      if (blocks === 0) {
        resolve()
      } else {
        increaseBlocks(blocks).then(resolve)
      }
    })
  })
}

function stopMining() {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(
      {
        jsonrpc: '2.0',
        method: 'miner_stop',
        id: 12346,
      },
      (err, result) => {
        if (err) reject(err)
        resolve(result)
      }
    )
  })
}

function startMining() {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(
      {
        jsonrpc: '2.0',
        method: 'miner_start',
        id: 12347,
      },
      (err, result) => {
        if (err) reject(err)
        resolve(result)
      }
    )
  })
}

function increaseBlock() {
  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(
      {
        jsonrpc: '2.0',
        method: 'evm_mine',
        id: 12345,
      },
      (err, result) => {
        if (err) reject(err)
        resolve(result)
      }
    )
  })
}
