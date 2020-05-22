import React, { useEffect, useState } from 'react'
import { Box, Button, Field, GU, Help, Info, SidePanel, Split, TextInput, textStyle, TokenBadge, useLayout, useTheme, IdentityBadge } from '@aragon/ui'
import { useApi, useAppState } from '@aragon/api-react'
import { differenceInMonths } from 'date-fns'
import EditIcon from '../assets/EditIcon.svg'
import DefinitionsBox from '../components/DefinitionsBox'
import { formatBigNumber, fromMonthlyAllocation, toMonthlyAllocation, toDecimals, fromDecimals } from '../utils/bn-utils'
import ValidationError from '../components/ValidationError'

// In this copy we should display the user the percentage of max increase of the tap
const helpContent = (tokenSymbol) => {
  return [
    [
      'What is the collateralization ratio?',
      'The collateralization ratio defines the ratio between the amount of collateral in your market-maker reserve and the market cap of this marketplace.',
    ]
  ]
}

const ReserveSetting = ({ label, helpContent: [hint, help], value }) => {
  const theme = useTheme()
  return (
    <div
      css={`
        display: flex;
        flex-direction: column;
        margin-bottom: ${3 * GU}px;
      `}
    >
      <div
        css={`
          display: flex;
          align-items: center;
        `}
      >
        <span
          css={`
            margin-right: ${1 * GU}px;
            color: ${theme.surfaceContentSecondary};
          `}
        >
          {label}
        </span>
        <Help hint={hint}>{help}</Help>
      </div>
      <p
        css={`
          ${textStyle('body1')};
          font-weight: 600;
        `}
      >
        {value}
      </p>
    </div>
  )
}

export default () => {
  // *****************************
  // background script state
  // *****************************
  const {
    constants: { PPM, PCT_BASE },
    collaterals: {
      primaryCollateral: {
        address: primaryCollateralAddress,
        reserveRatio: primaryCollateralReserveRatio,
        symbol: primaryCollateralSymbol,
        decimals: primaryCollateralDecimals,
      },
    },
    bondedToken: { name, symbol, decimals: tokenDecimals, address, realSupply },
  } = useAppState()

  // *****************************
  // aragon api
  // *****************************
  const api = useApi()

  // *****************************
  // human readable values
  // *****************************
  const adjustedTokenSupply = formatBigNumber(realSupply, tokenDecimals)
  const primaryCollateralRatio = formatBigNumber(primaryCollateralReserveRatio.div(PPM).times(100), 0)

  // *****************************
  // internal state
  // *****************************
  const [opened, setOpened] = useState(false)

  const theme = useTheme()
  const { layoutName } = useLayout()

  const editMonthlyAllocationButton = <Button icon={<img src={EditIcon} />} label="Update fees" onClick={() => setOpened(true)} />

  return (
    <>
      <Split
        primary={
          <>
            <Box heading="Collateralization ratios">
              <div
                css={`
                  display: grid;
                  grid-column-gap: ${3 * GU}px;
                  grid-template-columns: repeat(${layoutName === 'small' ? '1' : '2'}, 1fr);
                  width: 100%;
                `}
              >
                {[
                  [primaryCollateralSymbol, primaryCollateralRatio],
                ].map(([symbol, ratio], i) => (
                  <ReserveSetting
                    key={i}
                    label={`${symbol} collateralization ratio`}
                    helpContent={helpContent(primaryCollateralSymbol)[0]}
                    value={
                      <span>
                        {ratio}
                        <span
                          css={`
                            margin-left: ${0.5 * GU}px;
                            color: ${theme.surfaceContentSecondary};
                          `}
                        >
                          %
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            </Box>
          </>
        }
        secondary={
          <DefinitionsBox
            heading="Shares"
            definitions={[
              { label: 'Total Supply', content: <strong>{adjustedTokenSupply}</strong> },
              {
                label: 'Token',
                content: <TokenBadge name={name} symbol={symbol} badgeOnly />,
              },
              { label: 'Address', content: <IdentityBadge entity={address} /> },
            ]}
          />
        }
      />
      {/*TODO: Convert to update buy/sell fees*/}
      <SidePanel opened={opened} onClose={() => setOpened(false)} title="Monthly allocation">
        <form
          css={`
            margin-top: ${3 * GU}px;
          `}
        >
          {/*<Field label={`Rate (${primaryCollateralSymbol})`}>*/}
          {/*  <TextInput type="number" value={newRate} onChange={handleMonthlyChange} wide required />*/}
          {/*</Field>*/}
          {/*<Field label={`Floor (${primaryCollateralSymbol})`}>*/}
          {/*  <TextInput type="number" value={newFloor} onChange={handleFloorChange} wide required />*/}
          {/*</Field>*/}
          {/*<Button mode="strong" type="submit" disabled={!valid} wide>*/}
          {/*  Save monthly allocation*/}
          {/*</Button>*/}
          {/*{errorMessages?.length > 0 && <ValidationError messages={errorMessages} />}*/}

          {/*<Info*/}
          {/*  title="Info"*/}
          {/*  css={`*/}
          {/*    margin-top: ${2 * GU}px;*/}
          {/*  `}*/}
          {/*>*/}
          {/*  <p>*/}
          {/*    You can increase the rate by <b>{displayRateIncrease}%</b> up to <b>{adjustedMaxRate} {primaryCollateralSymbol}</b>.*/}
          {/*  </p>*/}
          {/*  <p>*/}
          {/*    You can decrease the floor by <b>{displayFloorIncrease}%</b> down to <b>{adjustedMinFloor} {primaryCollateralSymbol}</b>.*/}
          {/*  </p>*/}
          {/*</Info>*/}
          {/*<Info*/}
          {/*  mode="warning"*/}
          {/*  title="Warning"*/}
          {/*  css={`*/}
          {/*    margin-top: ${2 * GU}px;*/}
          {/*  `}*/}
          {/*>*/}
          {/*  You can update either the tap rate or floor only once a month. If you do update the tap rate or floor now{' '}*/}
          {/*  <b>you will not be able to update either of them again before a month</b>. Act wisely.*/}
          {/*</Info>*/}
        </form>
      </SidePanel>
    </>
  )
}
