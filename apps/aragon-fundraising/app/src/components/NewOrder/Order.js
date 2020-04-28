import React, { useEffect, useContext, useRef, useState } from 'react'
import styled from 'styled-components'
import { useApi, useAppState } from '@aragon/api-react'
import { Button, DropDown, Info, Text, TextInput, theme, unselectable, GU } from '@aragon/ui'
import { MainViewContext } from '../../context'
import Total from './Total'
import Info_ from './Info'
import ValidationError from '../ValidationError'
import { toDecimals, formatBigNumber } from '../../utils/bn-utils'

const Order = ({ isBuyOrder }) => {
  // *****************************
  // background script state
  // *****************************
  const {
    constants: { PCT_BASE },
    values: { buyFeePct, sellFeePct },
    addresses: { marketMaker },
    collaterals,
    bondedToken: { decimals: bondedDecimals, symbol: bondedSymbol },
  } = useAppState()
  const collateralItems = [collaterals.dai]

  // *****************************
  // aragon api
  // *****************************
  const api = useApi()

  // *****************************
  // context state
  // *****************************
  const { orderPanel, setOrderPanel, userBondedTokenBalance, userDaiBalance } = useContext(MainViewContext)

  // *****************************
  // internal state
  // *****************************
  const [selectedCollateral, setSelectedCollateral] = useState(0)
  const [amount, setAmount] = useState('')
  const [evaluatedReturn, setEvaluatedReturn] = useState('')
  const [valid, setValid] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const amountInput = useRef(null)

  // *****************************
  // effects
  // *****************************
  // handle reset when opening
  useEffect(() => {
    if (orderPanel) {
      // reset to default values
      setSelectedCollateral(0)
      setAmount('')
      setValid(false)
      setErrorMessage(null)
      // focus the right input, given the order type
      // timeout to avoid some flicker
      amountInput && setTimeout(() => amountInput.current.focus(), 100)
    }
  }, [orderPanel, isBuyOrder])

  // *****************************
  // handlers
  // *****************************
  const handleAmountUpdate = event => {
    setAmount(event.target.value)
  }

  const validate = (err, message) => {
    setValid(err)
    setErrorMessage(message)
  }

  const handleSubmit = event => {
    event.preventDefault()
    const address = collateralItems[selectedCollateral].address
    if (valid) {
      const amountBn = toDecimals(amount, collateralItems[selectedCollateral].decimals).toFixed()
      if (isBuyOrder) {
        const intent = { token: { address, value: amountBn, spender: marketMaker } }
        api
          .openBuyOrder(address, amountBn, intent)
          .toPromise()
          .catch(console.error)
      } else {
        api
          .openSellOrder(address, amountBn)
          .toPromise()
          .catch(console.error)
      }
      setOrderPanel(false)
    }
  }

  const getDecimals = () => {
    return isBuyOrder ? collateralItems[selectedCollateral].decimals : bondedDecimals
  }

  const getSymbol = () => {
    return isBuyOrder ? collateralItems[selectedCollateral].symbol : bondedSymbol
  }

  const getConversionSymbol = () => {
    return isBuyOrder ? bondedSymbol : collateralItems[selectedCollateral].symbol
  }

  const getReserveRatio = () => {
    return collateralItems[selectedCollateral].reserveRatio
  }

  const getUserBalance = () => {
    const balance = isBuyOrder ? [userDaiBalance][selectedCollateral] : userBondedTokenBalance
    const decimals = isBuyOrder ? collateralItems[selectedCollateral].decimals : bondedDecimals
    return formatBigNumber(balance, decimals)
  }

  const percentageOf = (numberWithDecimals) => {
    return numberWithDecimals.div(PCT_BASE).times(100).toFixed(2, 1)
  }

  const getFeePercentage = () => {
    return isBuyOrder ? percentageOf(buyFeePct) : percentageOf(sellFeePct)
  }

  const getFeeAmount = () => {
    return isBuyOrder ? getBuyFeeAmount() : getSellFeeAmount()
  } 

  const getBuyFeeAmount = () => {
    const inputAmount = amount > 0 && errorMessage === null ? amount : 0
    return buyFeePct.div(PCT_BASE).times(inputAmount)
  }

  const getSellFeeAmount = () => {
    const finalEvaluatedReturn = evaluatedReturn > 0 ? evaluatedReturn : 0
    return sellFeePct.div(PCT_BASE).times(finalEvaluatedReturn)
  }

  return (
    <form onSubmit={handleSubmit}>
      <InputsWrapper>
        <AmountField key="collateral">
          <label>
            {isBuyOrder && <StyledTextBlock>{collateralItems[selectedCollateral].symbol} TO SPEND</StyledTextBlock>}
            {!isBuyOrder && <StyledTextBlock>{bondedSymbol} TO SELL</StyledTextBlock>}
          </label>
          <CombinedInput>
            <TextInput ref={amountInput} type="number" value={amount} onChange={handleAmountUpdate} min={0} placeholder="0" step="any" required wide />
            {isBuyOrder ? (
              <span
                css={`
                  width: ${2 * GU}px;
                `}
              />
            ) : (
              <Text
                as="span"
                css={`
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  margin: 0 10px;
                `}
              >
                against
              </Text>
            )}
            <DropDown items={[collaterals.dai.symbol]} selected={selectedCollateral} onChange={setSelectedCollateral} />
          </CombinedInput>
        </AmountField>
      </InputsWrapper>
      <Total
        isBuyOrder={isBuyOrder}
        amount={{ value: amount, decimals: getDecimals(), symbol: getSymbol(), reserveRatio: getReserveRatio() }}
        conversionSymbol={getConversionSymbol()}
        onError={validate}
        setEvaluatedReturn={setEvaluatedReturn}
      />
      <div
        css={`
          padding: ${2 * GU}px 0 0;
        `}
      >
        <Button mode="strong" type="submit" disabled={!valid} wide>
          Open {isBuyOrder ? 'buy' : 'sell'} order
        </Button>
      </div>
      {errorMessage && <ValidationError messages={[errorMessage]} />}
      <div
        css={`
          padding-top: ${2 * GU}px;
        `}
      >
        <Info
          title="Your balance"
          css={`
            margin-bottom: ${2 * GU}px;
          `}
        >
          {getUserBalance()} {getSymbol()}
        </Info>

        <Info_ isBuyOrder={isBuyOrder} slippage={collateralItems[selectedCollateral].slippage} />

        {getFeePercentage() > 0 && <Info
          title={`Fee (${getFeePercentage()}%)`}
          css={`
            margin-top: ${2 * GU}px;
          `}
        >
          <p>
            {`A fee of ${getFeeAmount()} ${collateralItems[selectedCollateral].symbol} will be sent directly to the organisation's funding pool.`}
          </p>
        </Info>}

      </div>
    </form>
  )
}

const AmountField = styled.div`
  margin-bottom: ${2.5 * GU}px;
`

const InputsWrapper = styled.div`
  display: flex;
  flex-direction: column;
`

const CombinedInput = styled.div`
  display: flex;
  input[type='text'] {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right: 0;
  }
  input[type='text'] + div > div:first-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
`

const StyledTextBlock = styled(Text.Block).attrs({
  color: theme.textSecondary,
  smallcaps: true,
})`
  ${unselectable()};
  display: flex;
`

export default Order
