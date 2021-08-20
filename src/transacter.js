let specificUTXO;

bsk.config.network.getUTXOs = (address) => {
  return bsk.config.network.getNetworkedUTXOs(address)
    .then(
    (allUTXOs) => {
      if (specificUTXO) {
        let returnSet = allUTXOs.filter(
          (utxo) => {
            console.log(`Checking for inclusion: ${utxo}`);
            return utxo.tx_hash === specificUTXO
          }
        );
        return returnSet
      } else {
        return allUTXOs
      }
    }
  )
}

bsk.config.network.getFeeRate = function() {
  return fetch('https://bitcoinfees.earn.com/api/v1/fees/recommended')
      .then(resp => resp.json())
      .then(rates => Math.floor(2.3 * rates.fastestFee))
}

bsk.config.network.getConsensusHash = function() {
  return Promise.resolve("00000000000000000000000000000000")
}

function getPath() {
  return document.getElementById('transact-path').value.trim()
}

function getXPUB() {
  const path = getPath()
  return TrezorConnect.getPublicKey({ path })
    .then((result) => {
      console.log(JSON.stringify(result, undefined, 2))
      return result.payload.xpub
    })
    .then((xpub) => {
      displayMessage('xpub', xpub)
    })
}

function displayMessage(name, message, title) {
  const container = document.getElementById(name)
  container.classList.remove('invisible')
  const displayArea = document.getElementById(`${name}-message`)
  displayArea.innerHTML = message

  if (title) {
    const titleArea = document.getElementById(`${name}-title`)
    titleArea.innerHTML = title
  }
}

function sign() {
  const path = getPath()
  const message = document.getElementById('sign-input').value.trim()

  return TrezorConnect.signMessage({ path, message, coin: 'BTC' })
    .then(result => {
      if (!result.success) {
        throw new Error('Trezor refused to sign!')
      } else {
        return { signature: result.payload.signature,
                 address: result.payload.address }
      }
    })
    .then(({signature, address}) => {
      const data = { signature,
                     message,
                     address }
      displayMessage('sign', JSON.stringify(data, undefined, 2))
    })
}

function generate() {
  const fromAddr = document.getElementById('from-address').value.trim()
  const fromPKsHex = document.getElementById('from-pubkeys').value.trim().split(',').map(x => x.trim())
  const requiredSigners = parseInt(document.getElementById('from-n').value.trim())

  if (isNaN(requiredSigners) || requiredSigners <= 0) {
    displayMessage('tx', 'Invalid input in amount to send -- must be a positive integer.', 'ERROR')
    return
  }

  return Promise.resolve().then(() => {
    let authorizedPKs = fromPKsHex.slice().sort().map((k) => Buff.from(k, 'hex'))
    let redeem = btc.payments.p2ms({ m: requiredSigners, pubkeys: authorizedPKs })
    let redeemScript = redeem.output.toString('hex')

    let btcFromAddr = btc.payments.p2sh({ redeem }).address
    let c32FromAddr = c32.b58ToC32(btcFromAddr)
    if (c32FromAddr !== fromAddr) {
      console.log('Failed to compute correct address from PKs, trying alternate combination');
      authorizedPKs_unsorted = fromPKsHex.map((k) => Buff.from(k, 'hex'))
      redeem = btc.payments.p2ms({ m: requiredSigners, pubkeys: authorizedPKs_unsorted })
      redeemScript = redeem.output.toString('hex')

      btcFromAddr = btc.payments.p2sh({ redeem }).address
      c32FromAddr = c32.b58ToC32(btcFromAddr)

      if (c32FromAddr !== fromAddr) {
        throw new Error('Computed address (from PKs and required signer) does not match inputted address')
      }
    }

    const dummySigner = new bskTrezor.NullSigner(btcFromAddr)

    let rawPreStxOpTx = '';

    return bsk.transactions.makeV2PreStxOp(dummySigner, undefined, true)
      .then((rawTx) => {
        if (btc.Transaction.fromHex(rawTx).outs.length != 2) {
          console.log("Pre-STX operation should have exactly two outputs");
          throw new Error('Pre-STX operation should have exactly two outputs, please fund a larger UTXO to consume');
        }
        console.log('=== Partially Signed Pre-STX operation tx ===')
        console.log(rawTx)
        rawPreStxOpTx = rawTx
        return rawTx
      })
      .then(tx => ({ tx, redeemScript }))
      .then(({ tx, redeemScript }) => {
        console.log('redeem script')
        console.log(redeemScript)
        return ({ tx, redeemScript })
      })
      .then(jsonOutput => Buff.from(JSON.stringify(jsonOutput))
            .toString('base64'))
      .then(payload => displayMessage('prestxop-tx', `Payload: <br/> <br/> ${payload}`, 'Unsigned Pre-STX Operation Transaction'))
      .catch(err => {
        if (err.name === 'NotEnoughFundsError') {
          displayMessage('prestxop-tx', `Not enough BTC funds to pay BTC fee. <br/> You should send a little over ${parseInt(err.leftToFund)*2} satoshis to ${btcFromAddr}`, 'ERROR')
        } else {
          displayMessage('prestxop-tx', `Failed to generate transaction: <br/><br/> ${err}`, 'ERROR')
        }
        console.log(err)
      })
  })
}

function generate_transfer() {
  const fromAddr = document.getElementById('from-address').value.trim()
  const fromPKsHex = document.getElementById('from-pubkeys').value.trim().split(',').map(x => x.trim())
  const requiredSigners = parseInt(document.getElementById('from-n').value.trim())
  const toAddress = document.getElementById('to-address').value.trim()
  const toSend = BigInteger.fromBuffer(document.getElementById('stacks-send').value.trim())
  const utxo = document.getElementById('consume-utxo').value.trim()

  const useWholeUTXO = document.getElementById('use-whole-utxo').checked;

  if (toSend.compareTo(BigInteger.ONE) < 0) {
    displayMessage('tx', 'Invalid input in amount to send -- must be a positive integer.', 'ERROR')
    return
  }

  if (isNaN(requiredSigners) || requiredSigners <= 0) {
    displayMessage('tx', 'Invalid input in amount to send -- must be a positive integer.', 'ERROR')
    return
  }

  let feeRateFunction = bsk.config.network.getFeeRate;

  return Promise.resolve().then(() => {
    specificUTXO = utxo;
    let authorizedPKs = fromPKsHex.slice().sort().map((k) => Buff.from(k, 'hex'))
    let redeem = btc.payments.p2ms({ m: requiredSigners, pubkeys: authorizedPKs })
    let redeemScript = redeem.output.toString('hex')

    let btcFromAddr = btc.payments.p2sh({ redeem }).address
    let c32FromAddr = c32.b58ToC32(btcFromAddr)
    if (c32FromAddr !== fromAddr) {
      console.log('Failed to compute correct address from PKs, trying alternate combination');
      authorizedPKs_unsorted = fromPKsHex.map((k) => Buff.from(k, 'hex'))
      redeem = btc.payments.p2ms({ m: requiredSigners, pubkeys: authorizedPKs_unsorted })
      redeemScript = redeem.output.toString('hex')

      btcFromAddr = btc.payments.p2sh({ redeem }).address
      c32FromAddr = c32.b58ToC32(btcFromAddr)

      if (c32FromAddr !== fromAddr) {
        throw new Error('Computed address (from PKs and required signer) does not match inputted address')
      }
    }

    const btcToAddr = c32.c32ToB58(toAddress)

    const dummySigner = new bskTrezor.NullSigner(btcFromAddr)

    if (useWholeUTXO) {
      bsk.config.network.getFeeRate = function() {
        return Promise.resolve(1)
      };
    }

    return bsk.transactions.makeV2TokenTransfer(btcToAddr,
                                                toSend,
                                                '',
                                                dummySigner,
                                                undefined,
                                                true)
      .then(rawTX => {
        if (useWholeUTXO) {
          let tx = btc.Transaction.fromHex(rawTX);
          while (tx.outs.length > 2) {
            tx.outs.pop();
          }
          return tx.toHex()
        } else {
          return rawTX
        }
      })
      .then(rawTX => {
        console.log('=== Partially Signed Token Transfer ===')
        console.log(rawTX)
        return rawTX
      })
      .then(tx => ({ tx, redeemScript }))
      .catch(err => {
        if (err.name === 'NotEnoughFundsError') {
          err.btcAddr = btcFromAddr
        }
        throw err
      })
  })
    .then(jsonOutput => Buff.from(JSON.stringify(jsonOutput))
          .toString('base64'))
    .then(payload => {
      specificUTXO = undefined;
      bsk.config.network.getFeeRate = feeRateFunction;
      displayMessage('tx', `Payload: <br/> <br/> ${payload}`, 'Unsigned Transaction')
    })
    .catch(err => {
      specificUTXO = undefined;
      bsk.config.network.getFeeRate = feeRateFunction;
      if (err.name === 'NotEnoughFundsError') {
        displayMessage('tx', `The transaction generator doesn't think the PreStxOp has enough funds to pay the transaction fees. Try to generate using the "use whole UTXO" option.`, 'ERROR')
      } else {
        displayMessage('tx', `Failed to generate transaction: <br/><br/> ${err}`, 'ERROR')
      }
      console.log(err)
    })
}

function generate_stacking() {
  const fromAddr = document.getElementById('from-address').value.trim()
  const fromPKsHex = document.getElementById('from-pubkeys').value.trim().split(',').map(x => x.trim())
  const requiredSigners = parseInt(document.getElementById('from-n').value.trim())
  const poxAddress = document.getElementById('pox-address').value.trim()
  const toStack = BigInteger.fromBuffer(document.getElementById('stacks-send').value.trim())
  const cycles = BigInteger.fromBuffer(document.getElementById('stack-cycles').value.trim())
  const utxo = document.getElementById('consume-utxo').value.trim()

  const useWholeUTXO = document.getElementById('use-whole-utxo').checked;

  if (toStack.compareTo(BigInteger.ONE) < 0) {
    displayMessage('tx', 'Invalid input in amount to send -- must be a positive integer.', 'ERROR')
    return
  }

  if (cycles.compareTo(BigInteger.ONE) < 0) {
    displayMessage('tx', 'Invalid input in stack cycles -- must be a positive integer.', 'ERROR')
    return
  }

  if (isNaN(requiredSigners) || requiredSigners <= 0) {
    displayMessage('tx', 'Invalid input in amount to send -- must be a positive integer.', 'ERROR')
    return
  }

  let feeRateFunction = bsk.config.network.getFeeRate;

  return Promise.resolve().then(() => {
    specificUTXO = utxo;
    let authorizedPKs = fromPKsHex.slice().sort().map((k) => Buff.from(k, 'hex'))
    let redeem = btc.payments.p2ms({ m: requiredSigners, pubkeys: authorizedPKs })
    let redeemScript = redeem.output.toString('hex')

    let btcFromAddr = btc.payments.p2sh({ redeem }).address
    let c32FromAddr = c32.b58ToC32(btcFromAddr)
    if (c32FromAddr !== fromAddr) {
      console.log('Failed to compute correct address from PKs, trying alternate combination');
      authorizedPKs_unsorted = fromPKsHex.map((k) => Buff.from(k, 'hex'))
      redeem = btc.payments.p2ms({ m: requiredSigners, pubkeys: authorizedPKs_unsorted })
      redeemScript = redeem.output.toString('hex')

      btcFromAddr = btc.payments.p2sh({ redeem }).address
      c32FromAddr = c32.b58ToC32(btcFromAddr)

      if (c32FromAddr !== fromAddr) {
        throw new Error('Computed address (from PKs and required signer) does not match inputted address')
      }
    }

    const dummySigner = new bskTrezor.NullSigner(btcFromAddr)

    if (useWholeUTXO) {
      bsk.config.network.getFeeRate = function() {
        return Promise.resolve(1)
      };
    }

    return bsk.transactions.makeStacking(poxAddress,
                                         toStack,
                                         cycles,
                                         dummySigner,
                                         undefined,
                                         true)
      .then(rawTX => {
        console.log('=== Partially Signed Token Transfer ===')
        console.log(rawTX)
        return rawTX
      })
      .then(rawTX => {
        if (useWholeUTXO) {
          let tx = btc.Transaction.fromHex(rawTX);
          while (tx.outs.length > 2) {
            tx.outs.pop();
          }
          return tx.toHex()
        } else {
          return rawTX
        }
      })
      .then(tx => ({ tx, redeemScript }))
      .catch(err => {
        if (err.name === 'NotEnoughFundsError') {
          err.btcAddr = btcFromAddr
        }
        throw err
      })
  })
    .then(jsonOutput => Buff.from(JSON.stringify(jsonOutput))
          .toString('base64'))
    .then(payload => {
      specificUTXO = undefined;
      bsk.config.network.getFeeRate = feeRateFunction;
      displayMessage('tx', `Payload: <br/> <br/> ${payload}`, 'Unsigned Transaction')
    })
    .catch(err => {
      specificUTXO = undefined;
      bsk.config.network.getFeeRate = feeRateFunction;
      if (err.name === 'NotEnoughFundsError') {
        displayMessage('tx', `The transaction generator doesn't think the PreStxOp has enough funds to pay the transaction fees. Try to generate using the "use whole UTXO" option.`, 'ERROR')
      } else {
        displayMessage('tx', `Failed to generate transaction: <br/><br/> ${err}`, 'ERROR')
      }
      console.log(err)
    })
}

function getDevice() {
  return document.getElementById('transact-device').value.trim()
}

function checkDecode() {
  const input = document.getElementById('check-decode-input').value.trim()
  const input_json = JSON.parse(Buff.from(input, 'base64').toString());
  const tx = btc.Transaction.fromHex(input_json.tx);
  console.log(tx)
  const expectedRedeem = input_json.redeemScript

  let patially_signed = false;

  if (tx.ins[0].script.length == 0) {
    partially_signed = false;
  } else {
    const input_script = btc.script.decompile(tx.ins[0].script);
    const last_index = input_script.length - 1;
    const actualRedeem = input_script[last_index].toString('hex')
    if (expectedRedeem != actualRedeem) {
      displayMessage('tx', 'Redeem script in transaction did not match expected', 'ERROR')
      return;
    }
    partially_signed = true;
  }

  const fromBTCAddress = btc.payments.p2sh({ redeem: btc.payments.p2ms({ output: Buff.from(expectedRedeem, 'hex') }) })
      .address
  const fromSTXAddress = c32.b58ToC32(fromBTCAddress)
  const toBTCAddress = btc.address.fromOutputScript(tx.outs[1].script)
  const toSTXAddress = c32.b58ToC32(toBTCAddress)

  const script = btc.script.decompile(tx.outs[0].script)[1]

  const magic_bytes = script.slice(0, 2).toString();
  const op_code = script.slice(2, 3).toString();
  const total_btc = tx.outs.reduce((a, b) => { return a + b.value }, 0);

  console.log(`Magic bytes: ${magic_bytes}; Op code: ${op_code}`);

  if (magic_bytes != 'X2') {
    displayMessage('tx', 'Magic bytes for Stacks v2 incorrect, expected "X2"', 'ERROR')
    return;
  }

  if (op_code == '$') {
    const micro_amount = BigInteger.fromHex(script.slice(3, 19).toString('hex'))
    const message = `
  ================== STX Transfer =======================<br/>
  STX from address: ${fromSTXAddress}<br/>
  STX to address:   ${toSTXAddress}<br/>
  microstacks amount: ${micro_amount}<br/>
  partially signed: ${partially_signed}<br/>
  BTC consumed: ${total_btc}<br/>
  =======================================================<br/>
`;
    displayMessage('tx', message, 'Decoded/Checked Transaction');
  } else if (op_code == 'p') {
    if (fromSTXAddress != toSTXAddress) {
      displayMessage('tx', 'Invalid PreSTX operation, expected from and to addresses to be equal', 'ERROR')
      return;
    }
    const message = `
  ================== Pre-STX Op =========================<br/>
  STX from address: ${fromSTXAddress}<br/>
  partially signed: ${partially_signed}<br/>
  BTC consumed: ${total_btc}<br/>
  =======================================================<br/>
`;
    displayMessage('tx', message, 'Decoded/Checked Transaction');
  } else {
    displayMessage('tx', `Unknown opcode for Stacks v2: ${op_code}`, 'ERROR')
    return;
  }
}

function transact(buildIncomplete) {
  const device = getDevice()
  console.log("signing with trezor")

  const path = getPath()

  const inputPayload = document.getElementById('transact-input').value.trim()

  const { tx, redeemScript } = JSON.parse(Buff.from(inputPayload, 'base64'))

  console.log('redeemscript')
  console.log(redeemScript)
  console.log('tx')
  console.log(tx)

  const txB = btc.TransactionBuilder.fromTransaction(
    btc.Transaction.fromHex(tx))

  return bskTrezor.TrezorMultiSigSigner.createSigner(path, redeemScript)
    .then(txSigner => {
      let signPromise = Promise.resolve()
      for (let i = 0; i < txB.__inputs.length; i++) {
        console.log('input')
        console.log(txB.__inputs[i])
        signPromise = signPromise.then(() => txSigner.signTransaction(txB, i))
      }
      return signPromise
    })
    .then(() => {
      const tx = buildIncomplete ? txB.buildIncomplete().toHex() : txB.build().toHex()
      console.log('== SIGNED TX ==')
      console.log(tx)
      if (buildIncomplete) {
        const jsonObj = { tx, redeemScript }
        const payload = Buff.from(JSON.stringify(jsonObj))
              .toString('base64')
        displayMessage('tx', payload, 'Partially Signed Transaction')
      } else {
        displayMessage('tx', tx, 'Signed Transaction')
      }
    })
    .catch(err => {
      displayMessage('tx', `Failed to sign transaction: <br/><br/> ${err}`, 'ERROR')
      console.log(err)
    })
}
