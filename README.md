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

---

## Development

**tl;dr**: run the following command to build and serve the script locally on `http://localhost:8080`

```bash
docker build -t multisig-stx-btc . && docker run --rm -p 8080:80 multisig-stx-btc
```

### Building

Typically the script is built using Node.js and NPM.
The following commands will build the script and bundle the results in a `dist` folder:

```bash
npm install
npm run build
```

Additionally, a `Dockerfile` is provided, which can be used to build and serve the script locally.

### Serving

The script can be served locally (accessed via localhost) or behind https on a web server.
Other methods of hosting (e.g. on a NAS in a local network) may cause problems with the Trezor Connect library.

> **Note**
> An update to the Trezor Connect library may [break the script](https://github.com/hirosystems/multisig-stx-btc/issues/3) if the `index.html` file is directly opened in the browser.
> Below are some methods for correctly serving the script locally.

#### With Docker and `nginx`

> Requires [Docker](https://www.docker.com/products/docker-desktop/) to be installed.

From the root of this repository _(with the build output in a folder named `dist`)_, run:

```bash
docker run --rm --name nginx-multisig-stx-btc -p 8080:80 -v $(PWD)/dist:/usr/share/nginx/html nginx
```

This will serve the `dist` directory locally on port 8080 using `nginx`.
You can then access the script at `http://localhost:8080`.
Hit `ctrl-c` to stop the container again.

#### With Python

> Requires [Python 3.7+](https://www.python.org/downloads/) to be installed.

From the root of this repository _(with the build output in a folder named `dist`)_, run:

```bash
python3 -m http.server 8080 --directory dist
```

This will serve the `dist` directory locally on port 8080 using Python's built-in HTTP server.
You can then access the script at `http://localhost:8080`.
Hit `ctrl-c` to stop the server again.

#### With Node.js / NPM

> Requires [Node.js](https://nodejs.org/en/download/) to be installed.

From the root of this repository _(with the build output in a folder named `dist`)_, run:

```bash
npx serve dist
```

This will serve the `dist` directory locally on port 3000 using the [serve](https://www.npmjs.com/package/serve) package from Vercel.
You can then access the script at `http://localhost:3000`.
Hit `ctrl-c` to stop the server again.

#### With macOS default Apache

> Works only on macOS, using pre-installed software and no additional installs.

From the root of this repository _(with the build output in a folder named `dist`)_, go through the following steps:

1. Copy the build output to the default Apache directory:

```bash
sudo cp -r dist/ /Library/WebServer/Documents/multisig-stx-btc
```

2. Enable Apache _(hosts files at `/Library/WebServer/Documents` on port 80)_:

```bash
sudo apachectl start
```

3. Access the script at `http://localhost/multisig-stx-btc`.

4. When you're done, disable Apache again:

```bash
sudo apachectl stop
```

> Optionally, trash the `dist` content from the Apache directory again using `sudo mv /Library/WebServer/Documents/multisig-stx-btc ~/.Trash/multisig-stx-btc`.
