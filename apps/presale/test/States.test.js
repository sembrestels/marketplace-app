const { PRESALE_PERIOD, PRESALE_GOAL, PRESALE_STATE, PRESALE_MIN_GOAL } = require('@1hive/apps-marketplace-shared-test-helpers/constants')
const { prepareDefaultSetup, defaultDeployParams, initializePresale } = require('./common/deploy')
const { getEvent, now } = require('./common/utils')

const getState = async test => {
  return (await test.presale.state()).toNumber()
}

contract('Presale, states validation', ([anyone, appManager, buyer]) => {
  const itManagesStateCorrectly = startDate => {
    describe('When a sale is deployed', () => {
      before(async () => {
        await prepareDefaultSetup(this, appManager)
        await initializePresale(this, { ...defaultDeployParams(this, appManager), startDate })

        await this.contributionToken.generateTokens(buyer, PRESALE_GOAL)
        await this.contributionToken.approve(this.presale.address, PRESALE_GOAL, { from: buyer })
      })

      it('Initial state is Pending', async () => {
        assert.equal(await getState(this), PRESALE_STATE.PENDING)
      })

      describe('When the sale is started', () => {
        before(async () => {
          if (startDate == 0) {
            startDate = now()
            await this.presale.open({ from: appManager })
          }
          this.presale.mockSetTimestamp(startDate + 1)
        })

        it('The state is Funding', async () => {
          assert.equal(await getState(this), PRESALE_STATE.FUNDING)
        })

        describe('When the funding period is still running', () => {
          before(async () => {
            this.presale.mockSetTimestamp(startDate + PRESALE_PERIOD / 2)
          })

          it('The state is still Funding', async () => {
            assert.equal(await getState(this), PRESALE_STATE.FUNDING)
          })

          describe('When purchases are made, not reaching the funding goal', () => {
            before(async () => {
              await this.presale.contribute(buyer, PRESALE_MIN_GOAL / 2, { from: buyer })
            })

            it('The state is still Funding', async () => {
              assert.equal(await getState(this), PRESALE_STATE.FUNDING)
            })

            describe('When the funding period elapses without having reached the funding goal', () => {
              before(async () => {
                this.presale.mockSetTimestamp(startDate + PRESALE_PERIOD)
              })

              it('The state is Refunding', async () => {
                assert.equal(await getState(this), PRESALE_STATE.REFUNDING)
              })
            })
          })

          describe('When purchases are made, reaching the min funding goal before the funding period elapsed', () => {
            before(async () => {
              this.presale.mockSetTimestamp(startDate + PRESALE_PERIOD / 2)
              await this.presale.contribute(buyer, PRESALE_MIN_GOAL / 2, { from: buyer })
            })

            it('The state is Funding', async () => {
              assert.equal(await getState(this), PRESALE_STATE.FUNDING)
            })

            describe('When the funding period elapses having reached the min funding goal', () => {
              before(async () => {
                this.presale.mockSetTimestamp(startDate + PRESALE_PERIOD)
              })

              it('The state is GoalReached', async () => {
                assert.equal(await getState(this), PRESALE_STATE.GOAL_REACHED)
              })
            })

            describe('When the sale owner closes the sale', () => {
              before(async () => {
                await this.presale.close()
              })

              it('The state is Closed', async () => {
                assert.equal(await getState(this), PRESALE_STATE.CLOSED)
              })
            })
          })
        })
      })
    })
  }

  describe('When no startDate is specified upon initialization', () => {
    itManagesStateCorrectly(0)
  })

  describe('When a startDate is specified upon initialization', () => {
    itManagesStateCorrectly(now() + 3600)
  })
})
