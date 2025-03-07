# User interaction with an Agreement with Forest CLI Tool

In our case, to showcase how provider works within the network and handle the service, we would use the LLM model with the API keys from [Open Router](https://openrouter.ai). From user perspective we would send an XTMP request to the provider and check if the provider can handle the request with the response.

> Note: Make sure that you have enough Optimism Sepolia ETH to cover transaction costs, you need also USDC testnet tokens to pay 2 month prepayment for the service.
> Note: To register the agreement within the system, the backend provider should be spinned up and listen to blockchain to register resource and agreement that user is going to enter based on the PT address and offer id.

1. You have to prepare your private key to enter an agreement and copy/paste your command within the new opened terminal.
2. Check your balance with the following command:

```sh
forest wallet balance <your public evm address>
```

Return value will be like the example below:

```txt
0.01 ETH
2.8 USDC
1000 FOREST
```

3. Run the command to find the offer you want to enter an agreement with. You can do it with the following command:

```sh
forest get offers <protocol address>
```

Return value will be like the example below:

```txt
ID @ Product Category: 0 @ 0xf833d786374AEbC580eC389BE21A4CC340B543CD
Provider: 0x354cc7AC43c4681976bd926271524f6E28db2c96
Status: Active
Fee Per Second: 0.000001 USDC
Fee Per Month: 2.6352 USDC
Total Stock: 100
Active Agreements: 0
CID: bagaaiera3by5b3mykt7n2q2e4yvglgoh33ssoat5qczvgo75ii5yrxamo2aq
```

4. Enter an agreement for specific offer hosted by Provider within the PT:

```sh
forest agreement enter \
--account <file or private key> \
--deposit <number> \
--offer  <offer id> \
--protocol <protocol address> \
```

## Congratulations! You have entered an agreement with the Provider for the specific offer within the Product Category.

Right now we want to test if user can send a request to user this service and we are having a pipe method within the Forest CLI tool:

```sh
forest pipe <provider address> \
POST \
"/chat/completions" \
--body '{"providerId": 13,"id": 7,
"model": "any type of model that is free", "messages" : [{"role": "user","content": "Say hello world" } ], "pt": "0xf833d786374AEbC580eC389BE21A4CC340B543CD" }' \
--account <account private key as plain text or file path>
```
