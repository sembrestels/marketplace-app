import React from 'react'
import { useAppState, GU } from '@aragon/api-react'
import { Info } from '@aragon/ui'

const Information = ({minExpectedReturnAmount, tokenSymbol}) => {

  return (
    <div
      css={`
        margin-top: ${4 * GU}px;
      `}
    >
      <Info.Action title="Slippage">
        <p>
          {`The exact return of your order may differ from the one indicated if other users open buy or sell orders simultaneously.
          To ensure your return is not unsatisfactory your return will be at least ${minExpectedReturnAmount} ${tokenSymbol}
          or the transaction will have to be submitted again`}
        </p>
      </Info.Action>
    </div>
  )
}

export default Information
