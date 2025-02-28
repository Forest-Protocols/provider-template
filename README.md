# Protocol: `Machine Tranlsation Service Protocol`

## Description

`Machine Tranlsation Service Protocol is a protocol that allows users to request translations for their documents. The protocol is designed to be a decentralized translation service that is powered by a network of validators and providers.`

## Basic Info

| Name                      | Value                                                           |
| ------------------------- | --------------------------------------------------------------- |
| PT Smart Contract Address | `0x17F6E71A3BDCF3D64C84A24549Ff1F2d0e869E8A`                    |
| PT Registration Date      | `10/02/2025`                                                    |
| PT Details File CID       | `bagaaierajjzuopoidka3o7lyz5j6zzpx456ik5bhkje3wmlwvmai4i7p4yoq` |
| PT Owner Wallet Address   | `0x0F99b0b4A4C54bF18C50BeED9CE03cfCF7c76BDE`                    |
| PT Owner Details File CID | `bagaaierahoqgkldgnxirdegtv5aq5vs5ydfk6ujfb5dqz73f42layjaiz7ua` |

## Supported Actions (Endpoints)

| Method-Path       | Params/Body                                          | Response                                                                                        | Description                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /details`    | `body: string[]`                                     | `string[]`                                                                                      | Retrieves the contents of detail files for the given CIDs. If one CID is given and corresponding file is not found, returns 404/Not Found. Otherwise returns an array of contents of the files |
| `GET /resources`  | `params: { id?: number, pc?: Address }`              | `Resource[] \| Resource`                                                                        | If `id` and `pc` is given, retrieves one resource information. Otherwise returns all resources of the requester                                                                                |
| `POST /translate` | `params: {from?: string, to: string, text: string }` | `{ code: PipeResponseCode; response: { id: number; text: string; from?: string; to: string }; ` | Translate the text from source language to target one                                                                                                                                          |
| `POST /detect`    | `params: { text: string }`                           | `Promise<unknow>; `                                                                             | Detect the source language and returns a code of the source language with response of what language is that                                                                                    |

## Configuration Parameters

This Protocol has the following configuration. Some of them are enforced by the logic of the on-chain smart contracts and the others are part of the Validator code hence enforced by the Validator consensus.

| Config                                   | Value                                                           | Enforced by    |
| ---------------------------------------- | --------------------------------------------------------------- | -------------- |
| Maximum Number of Validators             | `10`                                                            | Smart Contract |
| Maximum Number of Providers              | `10`                                                            | Smart Contract |
| Minimum Collateral                       | `10`                                                            | Smart Contract |
| Validator Registration Fee               | `5`                                                             | Smart Contract |
| Provider Registration Fee                | `3`                                                             | Smart Contract |
| Offer Registration Fee                   | `2`                                                             | Smart Contract |
| Update Delay for Terms Change            | `400`                                                           | Smart Contract |
| Validators Share of Emissions            | `45`                                                            | Smart Contract |
| Providers Share of Emissions             | `45`                                                            | Smart Contract |
| PT Owner Share of Emissions              | `10`                                                            | Smart Contract |
| CID of the Details File                  | `bagaaierajjzuopoidka3o7lyz5j6zzpx456ik5bhkje3wmlwvmai4i7p4yoq` | Smart Contract |
| Performance Optimization Weight          | `{*Percentage}`                                                 | Validator      |
| Price Optimization Weight                | `{*Percentage}`                                                 | Validator      |
| Price-to-Performance Optimization Weight | `{*Percentage}`                                                 | Validator      |
| Popularity Optimization Weight           | `{*Percentage}`                                                 | Validator      |

> Sum of the percentages mentioned with `+` sign must equal to 100. Same thing applies for `*` too.

You can always double-check the on-chain values e.g. [here](https://sepolia-optimism.etherscan.io/address/`{Smart Contract Address}`#readContract)

## Performance Requirements

The Validators are performing a number of tests on Resources to ensure quality across the board. Below is a list of checked Benchmarks:

| Name            | Units     | Threshold Value | Min / Max     |
| --------------- | --------- | --------------- | ------------- |
| `{Test Name 1}` | `{Units}` | `{Value}`       | `{Min / Max}` |
| `{Test Name 2}` | `{Units}` | `{Value}`       | `{Min / Max}` |
| `{Test Name 3}` | `{Units}` | `{Value}`       | `{Min / Max}` |

More in-depth descriptions of the Tests (optional):

| Name          | Description             |
| ------------- | ----------------------- |
| {Test Name 1} | {Long form description} |
| {Test Name 2} | {Long form description} |
| {Test Name 3} | {Long form description} |

## Become a Provider in this Protocol

If you want to start providing services in this Protocol follow this tutorial: [link](become-a-provider.md)
