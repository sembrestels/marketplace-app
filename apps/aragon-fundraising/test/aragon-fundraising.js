const Controller = artifacts.require('AragonFundraisingController')
const TokenMock = artifacts.require('TokenMock')
const {
  ETH,
  INITIAL_COLLATERAL_BALANCE,
  PRESALE_GOAL,
  PRESALE_PERIOD,
  PRESALE_STATE,
  BATCH_BLOCKS,
  RATES,
  FLOORS,
} = require('@ablack/fundraising-shared-test-helpers/constants')
const setup = require('./helpers/setup')
const { now, getBuyOrderBatchId, getSellOrderBatchId } = require('./helpers/utils')
const openAndClaimBuyOrder = require('./helpers/utils').openAndClaimBuyOrder(web3, BATCH_BLOCKS)
const assertExternalEvent = require('@ablack/fundraising-shared-test-helpers/assertExternalEvent')
const forceSendETH = require('@ablack/fundraising-shared-test-helpers/forceSendETH')
const getProxyAddress = require('@ablack/fundraising-shared-test-helpers/getProxyAddress')
const random = require('@ablack/fundraising-shared-test-helpers/random')
const increaseBlocks = require('@ablack/fundraising-shared-test-helpers/increaseBlocks')(web3)
const progressToNextBatch = require('@ablack/fundraising-shared-test-helpers/progressToNextBatch')(web3, BATCH_BLOCKS)
const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const { assertRevert } = require('@aragon/test-helpers/assertThrow')

contract('AragonFundraisingController app', ([root, authorized, unauthorized]) => {
  before(async () => {
    await setup.deploy.infrastructure(this)
  })

  beforeEach(async () => {
    await setup.deploy.organization(this, root, authorized)
  })

  // #region initialize
  context('> #initialize', () => {
    context('> initialization parameters are valid', () => {
      it('it should initialize controller', async () => {
        assert.equal(await this.controller.presale(), this.presale.address)
        assert.equal(await this.controller.marketMaker(), this.marketMaker.address)
        assert.equal(await this.controller.reserve(), this.reserve.address)
      })
    })

    context('> initialization parameters are not valid', () => {
      let uninitialized

      beforeEach(async () => {
        const receipt = await this.dao.newAppInstance(setup.ids.controller, this.base.controller.address, '0x', false)
        uninitialized = await Controller.at(getProxyAddress(receipt))
      })

      it('it should revert [presale is not a contract]', async () => {
        await assertRevert(() =>
          uninitialized.initialize(root, this.marketMaker.address, this.reserve.address, { from: root })
        )
      })

      it('it should revert [market maker is not a contract]', async () => {
        await assertRevert(() =>
          uninitialized.initialize(this.presale.address, root, this.reserve.address, { from: root })
        )
      })

      it('it should revert [reserve is not a contract]', async () => {
        await assertRevert(() =>
          uninitialized.initialize(this.presale.address, this.marketMaker.address, root, { from: root })
        )
      })
    })

    it('it should revert on re-initialization', async () => {
      await assertRevert(() => setup.initialize.controller(this, root))
    })
  })
  // #endregion

  // #region updateBeneficiary
  context('> #updateBeneficiary', () => {
    context('> sender has UPDATE_BENEFICIARY_ROLE', () => {
      it('it should update beneficiary', async () => {
        const receipt = await this.controller.updateBeneficiary(root, { from: authorized })

        assertExternalEvent(receipt, 'UpdateBeneficiary(address)', 1)
        // double checked that the transaction has been dispatched in the marketMaker
        assert.equal(await this.marketMaker.beneficiary(), root)
      })
    })

    context('> sender does not have UPDATE_BENEFICIARY_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() => this.controller.updateBeneficiary(root, { from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region updateFees
  context('> #updateFees', () => {
    context('> sender has UPDATE_FEES_ROLE', () => {
      it('it should update fees', async () => {
        const receipt = await this.controller.updateFees(random.fee(), random.fee(), { from: authorized })

        assertExternalEvent(receipt, 'UpdateFees(uint256,uint256)')
      })
    })

    context('> sender does not have UPDATE_FEES_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() => this.controller.updateFees(random.fee(), random.fee(), { from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region openPresale
  context('> #openPresale', () => {
    context('> sender has OPEN_PRESALE_ROLE', () => {
      it('it should open presale', async () => {
        await this.controller.openPresale({ from: authorized })

        assert.equal((await this.presale.state()).toNumber(), PRESALE_STATE.FUNDING)
      })
    })

    context('> sender does not have OPEN_PRESALE_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() => this.controller.openPresale({ from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region closePresale
  context('> #closePresale', () => {
    beforeEach(async () => {
      await this.controller.openPresale({ from: authorized })
      await this.controller.contribute(PRESALE_GOAL, { from: authorized })
    })

    it('it should close presale', async () => {
      await this.controller.closePresale({ from: authorized })

      assert.equal((await this.presale.state()).toNumber(), PRESALE_STATE.CLOSED)
    })
  })
  // #endregion

  // #region contribute
  context('> #contribute', () => {
    beforeEach(async () => {
      await this.controller.openPresale({ from: authorized })
    })

    context('> sender has CONTRIBUTE_ROLE', () => {
      it('it should forward contribution', async () => {
        const receipt = await this.controller.contribute(PRESALE_GOAL / 2, { from: authorized })

        assertExternalEvent(receipt, 'Contribute(address,uint256,uint256,uint256)')
      })
    })

    context('> sender does not have CONTRIBUTE_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() => this.controller.contribute(PRESALE_GOAL / 2, { from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region refund
  context('> #refund', () => {
    beforeEach(async () => {
      await this.controller.openPresale({ from: authorized })
      await this.controller.contribute(PRESALE_GOAL / 2, { from: authorized })
      await this.presale.mockSetTimestamp(now() + PRESALE_PERIOD)
    })

    it('it should refund buyer', async () => {
      const receipt = await this.controller.refund(authorized, 0, { from: authorized })

      assertExternalEvent(receipt, 'Refund(address,uint256,uint256,uint256)')
    })
  })
  // #endregion

  // #region openTrading
  context('> #openTrading', () => {
    context('> sender has OPEN_TRADING_ROLE', () => {
      it('it should open trading', async () => {
        const receipt = await this.controller.openTrading({ from: authorized })

        assertExternalEvent(receipt, 'Open()')
      })

    })

    context('> sender does not have OPEN_TRADING_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() => this.controller.openTrading({ from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region makeBuyOrder
  context('> #makeBuyOrder', () => {
    beforeEach(async () => {
      await this.controller.openTrading({ from: authorized })
    })

    context('> sender has MAKE_BUY_ORDER_ROLE', () => {
      it('it should open buy order [ETH]', async () => {
        const amount = random.amount()
        const receipt = await this.controller.makeBuyOrder(ETH, amount, 0, { from: authorized, value: amount })

        assertExternalEvent(receipt, 'MakeBuyOrder(address,address,uint256,uint256,uint256)')
      })

      it('it should open buy order [ERC20]', async () => {
        const receipt = await this.controller.makeBuyOrder(this.collaterals.dai.address, random.amount(), 0, { from: authorized })

        assertExternalEvent(receipt, 'MakeBuyOrder(address,address,uint256,uint256,uint256)')
      })
    })

    context('> sender does not have MAKE_BUY_ORDER_ROLE', () => {
      it('it should revert [ETH]', async () => {
        const amount = random.amount()

        await assertRevert(() => this.controller.makeBuyOrder(ETH, amount, 0, { from: unauthorized, value: amount }))
      })

      it('it should revert [ERC20]', async () => {
        await assertRevert(() => this.controller.makeBuyOrder(this.collaterals.dai.address, random.amount(), 0, { from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region makeSellOrder
  context('> #makeSellOrder', () => {
    beforeEach(async () => {
      await this.controller.openTrading({ from: authorized })
    })

    context('> sender has MAKE_SELL_ORDER_ROLE', () => {
      it('it should open sell order [ETH]', async () => {
        const amount = random.amount()
        await this.controller.makeBuyOrder(ETH, amount, 0, { from: authorized, value: amount })
        const balance = await this.token.balanceOf(authorized)

        const receipt = await this.controller.makeSellOrder(ETH, balance, 0, { from: authorized })

        assertExternalEvent(receipt, 'MakeSellOrder(address,address,uint256,uint256,uint256)')
      })

      it('it should open sell order [ERC20]', async () => {
        await this.controller.makeBuyOrder(this.collaterals.dai.address, random.amount(), 0, { from: authorized })
        const balance = await this.token.balanceOf(authorized)

        const receipt = await this.controller.makeSellOrder(this.collaterals.dai.address, balance, 0, { from: authorized })

        assertExternalEvent(receipt, 'MakeSellOrder(address,address,uint256,uint256,uint256)')
      })
    })

    context('> sender does not have MAKE_SELL_ORDER_ROLE', () => {
      it('it should revert [ETH]', async () => {
        const amount = random.amount()
        await this.controller.makeBuyOrder(ETH, amount, 0, { from: authorized, value: amount })
        const balance = await this.token.balanceOf(authorized)
        await this.token.transfer(unauthorized, balance, { from: authorized })

        await assertRevert(() => this.controller.makeSellOrder(ETH, balance, 0, { from: unauthorized }))
      })

      it('it should revert [ERC20]', async () => {
        await this.controller.makeBuyOrder(this.collaterals.dai.address, random.amount(), 0, { from: authorized })
        const balance = await this.token.balanceOf(authorized)
        await this.token.transfer(unauthorized, balance, { from: authorized })

        await assertRevert(() => this.controller.makeSellOrder(this.collaterals.dai.address, balance, 0,
          { from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region addCollateralToken
  context('> #addCollateralToken', () => {
    context('> sender has ADD_COLLATERAL_TOKEN_ROLE', () => {
      context('> and rate is superior to zero', () => {
        it('it should add collateral token, protect it and tap it', async () => {
          const receipt = await this.controller.addCollateralToken(
            this.collaterals.ant.address,
            random.virtualSupply(),
            random.virtualBalance(),
            random.reserveRatio(),
            {
              from: authorized,
            }
          )

          assertExternalEvent(receipt, 'AddCollateralToken(address,uint256,uint256,uint32)') // market maker
        })
      })

      context('> and rate is zero', () => {
        it('it should add collateral token, protect it, but not tap it', async () => {
          const receipt = await this.controller.addCollateralToken(
            this.collaterals.ant.address,
            random.virtualSupply(),
            random.virtualBalance(),
            random.reserveRatio(),
            {
              from: authorized,
            }
          )

          assertExternalEvent(receipt, 'AddCollateralToken(address,uint256,uint256,uint32)') // market maker
        })
      })
    })

    context('> sender does not have ADD_COLLATERAL_TOKEN_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() =>
          this.controller.addCollateralToken(
            this.collaterals.ant.address,
            random.virtualSupply(),
            random.virtualBalance(),
            random.reserveRatio(),
            {
              from: unauthorized,
            }
          )
        )
      })
    })
  })
  // #endregion

  // #region reAddCollateralToken
  context('> #reAddCollateralToken', () => {
    beforeEach(async () => {
      await this.controller.removeCollateralToken(this.collaterals.dai.address, { from: authorized })
    })

    context('> sender has ADD_COLLATERAL_TOKEN_ROLE', () => {
      it('it should re-add collateral token', async () => {
        const receipt = await this.controller.reAddCollateralToken(
          this.collaterals.dai.address,
          random.virtualSupply(),
          random.virtualBalance(),
          random.reserveRatio(),
          {
            from: authorized,
          }
        )

        assertExternalEvent(receipt, 'AddCollateralToken(address,uint256,uint256,uint32)') // market maker
      })
    })

    context('> sender does not have ADD_COLLATERAL_TOKEN_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() =>
          this.controller.reAddCollateralToken(
            this.collaterals.dai.address,
            random.virtualSupply(),
            random.virtualBalance(),
            random.reserveRatio(),
            {
              from: unauthorized,
            }
          )
        )
      })
    })
  })
  // #endregion

  // #region removeCollateralToken
  context('> #removeCollateralToken', () => {
    context('> sender has REMOVE_COLLATERAL_TOKEN_ROLE', () => {
      it('it should remove collateral token', async () => {
        const receipt1 = await this.controller.removeCollateralToken(this.collaterals.dai.address, { from: authorized })

        assertExternalEvent(receipt1, 'RemoveCollateralToken(address)')
      })
    })

    context('> sender does not have REMOVE_COLLATERAL_TOKEN_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() => this.controller.removeCollateralToken(this.collaterals.dai.address, { from: unauthorized }))
      })
    })
  })
  // #endregion

  // #region updateCollateralToken
  context('> #updateCollateralToken', () => {
    context('> sender has UPDATE_COLLATERAL_TOKEN_ROLE', () => {
      it('it should update collateral token', async () => {
        const receipt = await this.controller.updateCollateralToken(
          this.collaterals.dai.address,
          random.virtualSupply(),
          random.virtualBalance(),
          random.reserveRatio(),
          { from: authorized }
        )

        assertExternalEvent(receipt, 'UpdateCollateralToken(address,uint256,uint256,uint32)')
      })
    })

    context('> sender does not have UPDATE_COLLATERAL_TOKEN_ROLE', () => {
      it('it should revert', async () => {
        await assertRevert(() =>
          this.controller.updateCollateralToken(
            this.collaterals.dai.address,
            random.virtualSupply(),
            random.virtualBalance(),
            random.reserveRatio(),
            { from: unauthorized }
          )
        )
      })
    })
  })
  // #endregion

  // #region token
  context('> #token', () => {
    it('it should return bonded token address', async () => {
      assert.equal(await this.controller.token(), this.token.address)
    })
  })
  // #endregion

  // #region contributionToken
  context('> #contributionToken', () => {
    it('it should return contribution token address', async () => {
      assert.equal(await this.controller.contributionToken(), this.collaterals.dai.address)
    })
  })
  // #endregion

  // #region balanceOf
  context('> #balanceOf', () => {
    context('> reserve', () => {
      it('it should return available reserve balance [ETH]', async () => {
        // note requires running devchain/testrpc with account values more than INITIAL_COLLATERAL_BALANCE / 2
        // using -e <Account Balances>
        await forceSendETH(this.reserve.address, INITIAL_COLLATERAL_BALANCE / 2)

        assert.equal((await this.controller.balanceOf(this.reserve.address, ETH)).toNumber(), INITIAL_COLLATERAL_BALANCE / 2 - RATES[0] * 3 * BATCH_BLOCKS)
      })

      it('it should return available reserve balance [ERC20]', async () => {
        await this.collaterals.dai.transfer(this.reserve.address, INITIAL_COLLATERAL_BALANCE, { from: authorized })

        assert.equal(
          (await this.controller.balanceOf(this.reserve.address, this.collaterals.dai.address)).toNumber(),
          INITIAL_COLLATERAL_BALANCE - RATES[1] * 3 * BATCH_BLOCKS
        )
      })
    })
    context('> others', () => {
      it('it should return balance [ETH]', async () => {
        assert.equal((await this.controller.balanceOf(authorized, ETH)).toNumber(), (await web3.eth.getBalance(authorized)).toNumber())
      })

      it('it should return balance [ETH]', async () => {
        assert.equal(
          (await this.controller.balanceOf(authorized, this.collaterals.dai.address)).toNumber(),
          (await this.collaterals.dai.balanceOf(authorized)).toNumber()
        )
      })
    })
  })
  // #endregion
})