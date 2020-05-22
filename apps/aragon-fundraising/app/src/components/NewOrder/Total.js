import React, { useContext, useState, useEffect } from 'react'
import { Text } from '@aragon/ui'
import { useApi, useAppState } from '@aragon/api-react'
import styled from 'styled-components'
import BigNumber from 'bignumber.js'
import { MainViewContext } from '../../context'
import BancorFormulaAbi from '../../abi/BancorFormula.json'
import { formatBigNumber, toDecimals } from '../../utils/bn-utils'

const Total = ({ isBuyOrder, amount, conversionSymbol, onError, setEvaluatedReturn, evaluatedReturn }) => {
  const { value, decimals, symbol, reserveRatio, feeAmount, feePercentage } = amount
  // *****************************
  // background script state
  // *****************************
  const {
    constants: { PCT_BASE },
    values: { buyFeePct, sellFeePct },
    addresses: { formula: formulaAddress },
    bondedToken: { overallSupply }
  } = useAppState()

  // *****************************
  // aragon api
  // *****************************
  const api = useApi()
  const formula = api.external(formulaAddress, BancorFormulaAbi)

  // *****************************
  // context state
  // *****************************
  const { price, primaryCollateralBalance, userPrimaryCollateralBalance, userBondedTokenBalance } = useContext(MainViewContext)

  // *****************************
  // internal state
  // *****************************
  const [formattedAmount, setFormattedAmount] = useState(formatBigNumber(0, 0))

  // *****************************
  // handlers
  // *****************************
  const errorCb = (msg = null) => {
    setEvaluatedReturn(null)
    onError(false, msg)
  }

  const okCb = () => onError(true, null)

  // *****************************
  // effects
  // *****************************
  // recalculate price when amount, collateral or type of order changed
  useEffect(() => {
    let didCancel = false

    const evaluateOrderReturn = async () => {
      const functionToCall = isBuyOrder ? 'calculatePurchaseReturn' : 'calculateSaleReturn'
      const valueBn = toDecimals(value, decimals)
      // supply, balance, weight, amount
      const currentSymbol = isBuyOrder ? symbol : conversionSymbol
      const supply = overallSupply.primaryCollateral
      const balance = primaryCollateralBalance

      if (balance && !didCancel) {
        if (isBuyOrder) {
          const fee = valueBn.times(buyFeePct).div(PCT_BASE)
          const paidLessFee = valueBn.minus(fee)
          const reserveBalanceAtCalculation = balance.plus(paidLessFee).toFixed()

          const result = await api.external(formulaAddress, BancorFormulaAbi)
            .calculatePurchaseReturn(supply.toFixed(), reserveBalanceAtCalculation, reserveRatio.toFixed(), paidLessFee.toFixed())
            .toPromise()
            .catch(() => errorCb('The amount is out of range of the supply'))
          const resultBn = new BigNumber(result)

          setEvaluatedReturn(formatBigNumber(resultBn, decimals))
        } else {
          const reserveSupplyAtCalculation = supply.minus(valueBn).toFixed()

          const result = await api.external(formulaAddress, BancorFormulaAbi)
            .calculateSaleReturn(reserveSupplyAtCalculation, balance.toFixed(), reserveRatio.toFixed(), valueBn.toFixed())
            .toPromise()
            .catch(() => errorCb('The amount is out of range of the supply'))
          const resultBn = new BigNumber(result)

          setEvaluatedReturn(formatBigNumber(resultBn, decimals))
        }
        okCb()
      } else {
        errorCb(null)
      }
    }

    const userBalance = userPrimaryCollateralBalance
    const valueLessFee = isBuyOrder ? parseFloat(value) - feeAmount : value
    if (isBuyOrder && userBalance.lt(toDecimals(value, decimals))) {
      // cannot buy more than your own balance
      setFormattedAmount(formatBigNumber(valueLessFee, 0))
      setEvaluatedReturn(null)
      onError(false, `Your ${symbol} balance is not sufficient`)
    } else if (!isBuyOrder && userBondedTokenBalance.lt(toDecimals(value, decimals))) {
      // cannot sell more than your own balance
      setFormattedAmount(formatBigNumber(valueLessFee, 0))
      setEvaluatedReturn(null)
      onError(false, `Your ${symbol} balance is not sufficient`)
    } else if (value?.length && value > 0) {
      // only try to evaluate when an amount is entered, and valid
      evaluateOrderReturn()
      setFormattedAmount(formatBigNumber(valueLessFee, 0))
    } else {
      // if input is empty, reset to default values and disable order button
      setFormattedAmount(formatBigNumber(0, 0))
      errorCb(null)
    }

    return () => {
      didCancel = true
    }
  }, [isBuyOrder, amount, conversionSymbol])

  const evaluatedReturnLessFee = formatBigNumber(isBuyOrder ? evaluatedReturn : parseFloat(evaluatedReturn) - feeAmount, 0)

  return (
    <div css="display: flex; justify-content: space-between; padding: 0 5px;">
      <div>
        <Text weight="bold">TOTAL</Text>
      </div>
      <div css="display: flex; flex-direction: column">
        <div css="display: flex; justify-content: flex-end;">
          <AmountField weight="bold">{formattedAmount}</AmountField>
          <Text weight="bold">{symbol}</Text>
          {feePercentage > 0 && isBuyOrder &&
          <FeeField weight="bold">{`(${formatBigNumber(feeAmount, 0)} FEE)`}</FeeField>}
        </div>
        {evaluatedReturn && <div css="display: flex; justify-content: flex-end;">
          <AmountField color="grey">~{evaluatedReturnLessFee}</AmountField>
          <Text color="grey">{conversionSymbol}</Text>
          {feePercentage > 0 && !isBuyOrder &&
          <FeeField color="grey">{`(${formatBigNumber(feeAmount, 0)} FEE)`}</FeeField>}
        </div>}
      </div>
    </div>
  )
}

const AmountField = styled(Text)`
  margin-right: 7px;
`

const FeeField = styled(Text)`
  margin-left: 10px;
`

export default Total
