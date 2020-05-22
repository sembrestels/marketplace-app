import React from 'react'
import { useAppState, GU } from '@aragon/api-react'
import { Info } from '@aragon/ui'

const Information = () => {

  return (
    <div
      css={`
        margin-top: ${4 * GU}px;
      `}
    >
      <Info.Action title="Min received amount">
        <p>
          The exact return of your order may differ from the one indicated if other users open buy or sell orders simultaneously.
          To ensure your return is not unsatisfactory your return will be atleast the minimum amount specified.
        </p>
      </Info.Action>
    </div>
  )
}

export default Information
