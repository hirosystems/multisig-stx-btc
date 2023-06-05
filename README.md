**WARNING**: This script is very much a alpha-level script. It is designed to work
under favorable conditions, and there are many ways that it could fail. This
script provides a bare-bones experience and the protocol that it uses is
fairly intricate. This script requires careful thought to use correctly, and is
generally not recommended if other approaches are possible. Checking and
double-checking the outputs of this script is very strongly advised. This script
is provided as-is, and we make no guarantees that it will work for your use case.

Using the multi-sig transaction script.

In order to issue a multi-sig transaction you must, at a high-level:

1. Fund the multi-sig address using Bitcoin to pay Bitcoin transaction
   fees (STX-over-BTC transactions require Bitcoin fees).
2. Generate a partial pre-transaction for sending the Stacks.
3. Sign the partial pre-transaction with each participating device.
4. Broadcast the pre-transaction.
5. Generate the _actual_ transaction for sending the Stacks.
6. Sign the transaction with each participating device.
7. Broadcast the transaction.
8. The Stacks block that is elected in the Bitcoin block _after_
   the one in which your transaction was included will process
   your transaction. If no such block is elected, the transaction
   _fails_, and you will need to start the whole process over again.

To figure out how much Bitcoin is required to fund the transaction,
you can use the index.html script to try and generate a
transaction. If the address needs more funds, the page will tell you how
much BTC (in satoshis) to send to the correct Bitcoin address.

Generating the transaction requires manually inputting the correct
parameters for your multi-sig wallet:

1. Public Keys -- these are _all_ the participating public keys
   for your multi-sig address (if your address is 2-of-3, you should
   enter 3 public keys). You should input these public keys in the same
   order that you did when you generated your wallet. If they are not
   in the correct order, the page will give you an error.

2. The number of required signers.

3. The multi-sig Stacks address you wish to send from

4. The Stacks address you wish to send to

5. The number of _microstacks_ to send or stack (these are 10^-6 stacks).

6. The Bitcoin TXID of your Pre-transaction, and whether or not
   to consume the whole pre-transaction's UTXO (in most cases, you
   would want to consume the whole UTXO to pay Bitcoin transaction fees,
   however if the Bitcoin UTXO is very large, you may not want to do this).

Once you've generated the transaction, the page will output a
partially generated transaction as a data blob at the bottom of the
page. You now need to iteratively sign this partial transaction.

## Caveats

The STX-over-BTC wire format is burdensome in a couple ways:

1. It always requires sending _two_ Bitcoin transactions: a pre-transaction and
   the actualy transaction itself. This is discussed in [SIP-007](https://github.com/stacksgov/sips/blob/main/sips/sip-007/sip-007-stacking-consensus.md#stx-operations-on-bitcoin).
1. You cannot construct the second Bitcoin transaction until the first one has
   been broadcasted.
1. The Stacks block elected in the bitcoin block following the second
   transaction processes the transaction (i.e., the second transaction
   is included in Bitcoin block 101, it will be processed by the Stacks
   block elected in Bitcoin block 102).
1. If no Stacks block was elected at that height _or_ if the elected
   Stacks block ends up being forked-away-from (i.e., orphaned), then
   your transaction will _not_ be picked up by the Stacks network.
   You will need to construct a new pre-transaction and transaction pair.

One other important note:

This script does a pretty poor job of estimating Bitcoin fees, which
is why "spending the whole UTXO" on the second transaction is helpful:
it makes the TX smaller, and therefore the fee paid is more effective.
Because of this, it is _strongly_ recommended that you inspect the
constructed Bitcoin transactions for their fee rates. The way that this
script works requires the Pre-Transaction _completely_ fund the second
transaction. Therefore, the UTXO from the Pre-Transaction _must_ be
large enough to fund the second transaction.

## Signing the Transaction

In order to sign the transaction, take the data blob you wish
to sign, and paste it into the "Partial transaction" form field
on the page. You need to explicitly specify the path on your
hardware device that will sign the transaction. If you
used the Stacks Wallet application to generate a public key,
that path is:

m/44'/5757'/0'/0/0

When you plug in the hardware device and click the "Start Sign" button,
you will be prompted by your device to sign the transaction.

If it completes successfully, it will output the partially signed
transaction as a data blob. Copy that blob and paste it into
the partial transaction field, repeating this process for as many
signatures as are required by the multisig address. When you are
signing for the last signature in the address (i.e., the 2nd signature in
a 2-of-3), use the "Finish Sign TX" button instead of the "Start Sign" button.
When you use the finish sign tx button, and the hardware device successfully
signs the transaction, it will output a raw Bitcoin transaction as a hex string.
Broadcast that transaction from any valid Bitcoin transaction broadcaster
(e.g., https:://www.blockchain.com/btc/pushtx).

## Hosting the script locally

### With Docker and `nginx`

From the root of this repository _(the folder which contains the `dist` folder)_, run:

```bash
docker run --rm --name nginx-multisig-stx-btc -p 8080:80 -v $(PWD)/dist:/usr/share/nginx/html nginx
```

This will serve the `dist` directory locally on port 8080 using `nginx`.
You can then access the script at `http://localhost:8080`.
Hit `ctrl-c` to stop the container again.
