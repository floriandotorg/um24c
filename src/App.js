import React, { useState } from 'react'
import format from 'format-duration'
import numeral from 'numeral'
import Plotly from 'plotly.js-basic-dist'
import createPlotlyComponent from 'react-plotly.js/factory'

const Plot = createPlotlyComponent(Plotly)

const concat = (buf1, buf2) => {
  const tmp = new Uint8Array(buf1.byteLength + buf2.byteLength)
  tmp.set(new Uint8Array(buf1), 0)
  tmp.set(new Uint8Array(buf2), buf1.byteLength)
  return tmp.buffer
}

const modelMap = {
  0x0963: 'UM24C',
  0x09c9: 'UM25C',
  0x0d4c: 'UM34C'
}

const chargingModeMap = {
  1: 'QC2',
  2: 'QC3',
  3: 'APP2.4A',
  4: 'APP2.1A',
  5: 'APP1.0A',
  6: 'APP0.5A',
  7: 'DCP1.5A',
  8: 'SAMSUNG'
}

let buffer = new Uint8Array()

const Chart = ({ y, color, unit }) => (
  <Plot
    useResizeHandler
    style={{width: '90%', height: '20vh'}}
    data={[
      {
        y,
        mode: 'lines',
        marker: { color }
      }
    ]}
    layout={{
      showlegend: false,
      plot_bgcolor: 'rgb(0, 0, 0)',
      paper_bgcolor: 'rgb(0, 0, 0)',
      font: {
        family: 'monospace',
        color: 'white'
      },
      autosize: true,
      margin: {
        l: 60,
        r: 0,
        b: 20,
        t: 20,
        pad: 0
      },
      xaxis: {
        visible: false
      },
      yaxis: {
        //range: [min, _.max([max, ...y])],
        showgrid: true,
        showline: true,
        zeroline: true,
        visible: true,
        autorange: true,
        gridcolor: 'rgb(68, 68, 68)',
        ticksuffix: unit
      }
    }}
    config={{
      displayModeBar: false
    }}
  />
)

const Intro = ({ onClick, loading }) => (
  <div className='intro'>
    { loading ? <p>Connecting ..</p> : <>
      <h1>UM24C/UM25C/UM34C<br />Power Meter</h1>
      <button onClick={onClick}>Connect</button>
      <p className='info'>*On iOS the <a href='https://apps.apple.com/de/app/bluefy-web-ble-browser/id1492822055?l=en' rel='noopener noreferrer' target='_blank'>Bluefy</a> app is required.</p>
    </>}
  </div>
)

const Stats = ({ values: { modelId, group, voltage, amperage, impedance, wattage, temperature, capacityAmperage, capacityWattage, duration, chargingMode, negativeDataLineVoltage, positiveDataLineVoltage }, voltage: voltageHistory, amperage: amperageHistory }) => (
  <>
    <header>
      Model: {modelId}
    </header>

    <p className='large green'>{numeral(voltage / 1000).format('00.00')} V</p>
    <p className='large lightblue'>{numeral(amperage / 1000).format('0.000')} A</p>

    <div className='row'>
      <div className='col'>
        <p className='red'>{numeral(capacityAmperage).format('00000')} mAh</p>
      </div>
      <div className='col'>
        <p className='blue'>{numeral(impedance / 1000).format('0000.0')} &#8486;</p>
      </div>
    </div>

    <div className='row'>
      <div className='col'>
        <p className='yellow'>{numeral(capacityWattage).format('00000')} mWh</p>
      </div>
      <div className='col'>
        <p>{numeral(wattage / 1000).format('00.000')} W</p>
      </div>
    </div>

    <div className='row'>
      <div className='col'>
        <Chart y={voltageHistory} color='#3abe87' unit=' V' />
      </div>

      <div className='col'>
        <Chart y={amperageHistory} color='#3abe87' unit=' A' />
      </div>
    </div>

    <div className='row'>
      <div className='col'>
        <p className=''>&oplus; {numeral(positiveDataLineVoltage / 1000).format('0.00')} V</p>
      </div>
      <div className='col'>
        <p>Group: {group}</p>
      </div>
    </div>

    <div className='row'>
      <div className='col'>
        <p className=''>&#8854; {numeral(negativeDataLineVoltage / 1000).format('0.00')} V</p>
      </div>
      <div className='col'>
        <p>{temperature} &deg;C</p>
      </div>
    </div>

    <div className='row'>
      <div className='col'>
        <p className='lightblue'>{chargingMode}</p>
      </div>
      <div className='col'>
        <p className='yellow'>{duration && format(duration)}</p>
      </div>
    </div>
  </>
)

const STATE_DISCONNECTED = 0
const STATE_CONNECTING = 1
const STATE_CONNECTED = 2

const App = () => {
  const [state, setState] = useState(STATE_DISCONNECTED)
  const [values, setValues] = useState({})
  const [voltage, setVoltage] = useState(new Array(100))
  const [amperage, setAmperage] = useState(new Array(100))

  const connect = () => {
    setState(STATE_CONNECTING)

    return navigator.bluetooth.requestDevice({
      filters: [{services: [0xFFE0]}],
    })
    .then(device => {
      device.gatt.connect()
        .then(server => {
          return server.getPrimaryService(0xFFE0)
        })
        .then(service => {
          return service.getCharacteristic(0xFFE1)
        })
        .then(characteristic => {
          characteristic.startNotifications().then(() => {
            const trigger = () => characteristic.writeValue(new Uint8Array([0xf0]))

            characteristic.addEventListener('characteristicvaluechanged', ({ target: { value }}) => {
              buffer = concat(buffer, value.buffer)
              if (value.byteLength === 10) {
                const dv = new DataView(buffer)
                if (dv.byteLength === 130) {
                  const modelId = modelMap[dv.getUint16(0)] || 'n/a'
                  const group = dv.getUint16(14)
                  const voltage = dv.getUint16(2) * (modelId === 'UM25C' ? 1 : 10)
                  const amperage = dv.getUint16(4)
                  setValues({
                    modelId,
                    group,
                    voltage,
                    amperage,
                    impedance: dv.getUint32(122) * 100,
                    wattage: dv.getUint32(6),
                    temperature: dv.getUint16(10),
                    capacityAmperage: dv.getUint32(16 + group * 8),
                    capacityWattage: dv.getUint32(20 + group * 8),
                    duration: dv.getUint32(112) * 1000,
                    positiveDataLineVoltage: dv.getUint16(98) * 10,
                    negativeDataLineVoltage: dv.getUint16(96) * 10,
                    chargingMode: chargingModeMap[dv.getUint16(100)] || "unknown"
                  })
                  setVoltage(arr => [voltage / 1000, ...arr.slice(0, -1)])
                  setAmperage(arr => [amperage / 1000, ...arr.slice(0, -1)])
                }
                buffer = new Uint8Array()
                setTimeout(trigger, 500)
              }
            })
            trigger()
            setState(STATE_CONNECTED)
          })
        })
    })
  }

  return (
    <>
      <div className="App">
        {state === STATE_CONNECTED ? <Stats values={values} voltage={voltage} amperage={amperage} /> : <Intro onClick={connect} loading={state === STATE_CONNECTING} />}
      </div>
      <footer><a href='https://github.com/floriandotorg/um24c' rel='noopener noreferrer' target='_blank'>&copy;{new Date().getFullYear()} by Florian Kaiser</a></footer>
    </>
  )
}

export default App
