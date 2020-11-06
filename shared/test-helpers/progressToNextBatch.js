module.exports = (web3, BATCH_BLOCKS) => async () => {
  const { latestBlock } = require('@aragon/contract-helpers-test/src/time')
  const increaseBlocks = require('./increaseBlocks')(web3)
  const currentBlock = await latestBlock()
  const currentBatch = Math.floor(currentBlock / BATCH_BLOCKS) * BATCH_BLOCKS
  const blocksUntilNextBatch = currentBatch + BATCH_BLOCKS - currentBlock
  await increaseBlocks(blocksUntilNextBatch)
}
